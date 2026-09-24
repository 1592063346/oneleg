// 应用入口：加载站点数据、组装操作回调、编排导航与视图渲染

import type { Match, EventEdition } from "./core/types.js";
import type { Site, State, AppActions } from "./core/config.js";
import { SITE_CONFIGS, EVENT_EDITION_CONFIGS } from "./core/config.js";
import { allDeckNames, loadData, top4DeckNames } from "./core/data.js";
import { buildColorMap } from "./core/palette.js";
import {
  buildUrl,
  confirmLeaveDeck,
  matchIndexByDateParam,
  parseRoute,
  watchUnload,
} from "./core/router.js";
import { renderShell } from "./core/nav.js";
import { createEmptyDeck } from "./domain/deck.js";
import { decodeDeck } from "./domain/deckCode.js";
import { hasLimitTag, loadLimitTables } from "./domain/limits.js";
import { buildPieView } from "./views/pie.js";
import { buildTrendView } from "./views/trend.js";
import { buildBuilderView, buildDeckDisplayView } from "./views/builder.js";
import { buildFaqView } from "./views/faq.js";

const app = document.getElementById("app")!;
let currentState: State | null = null;

/** 注入给导航与视图的操作回调，避免它们反向依赖本文件 */
const actions: AppActions = {
  loadSite,
  renderShell: (state) => renderShell(state, actions),
  renderBody,
};

async function loadSite(
  site: Site,
  edition?: EventEdition,
  dateParam?: string | null,
  deckParam?: string | null,
  limitsParam?: string | null
): Promise<void> {
  const config = SITE_CONFIGS[site];
  app.innerHTML = `<p class="empty-note">正在加载…</p>`;

  // 关于网站与构筑导出站不需要加载数据
  if (!config.hasData) {
    const state: State = {
      config,
      matches: [],
      names: [],
      trendDeckNames: [],
      colorMap: new Map(),
      view: "pie",
      selectedMatch: 0,
      selectedDecks: [],
      selectedTypes: new Set(),
      dateRange: null,
    };
    // 构筑两站（可编辑的构筑导出、只读的构筑展示）共用同一套 deck / limits 解析
    if (site === "builder" || site === "deck-display") {
      // 卡表先读进来，带 limits 的链接首屏就能定下选中项，非法 tag 也能当场判掉
      await loadLimitTables().catch(() => null);
      const deck = deckParam ? decodeDeck(deckParam) : null;
      // 弹窗阻挡在本行，用户确认后才继续渲染，呈现的顺序正好是提示在前、空构筑在后
      if (deckParam && !deck) alert("链接构筑无法解析，默认加载空构筑。");
      const limitTag = limitsParam && hasLimitTag(limitsParam) ? limitsParam : null;
      if (site === "builder") {
        state.builderDeck = deck ?? createEmptyDeck();
        state.builderLimitTag = limitTag;
      } else {
        state.displayDeck = deck ?? createEmptyDeck();
        state.displayLimitTag = limitTag;
      }
    }
    currentState = state;
    // 归一化地址栏：丢掉解不开的 deck 与不存在的 limits
    history.replaceState(null, "", buildUrl(state));
    renderShell(state, actions);
    return;
  }

  // 分站：根据板块应用对应数据路径
  let eventEdition: EventEdition | undefined;
  if (site === "event") {
    eventEdition = edition || "ocg";
    const editionConfig = EVENT_EDITION_CONFIGS[eventEdition];
    config.dataPath = editionConfig.dataPath;
    config.deckDir = editionConfig.deckDir;
    config.editionToggleLabel = editionConfig.label;
  }

  let matches: Match[];
  try {
    matches = await loadData(config.dataPath);
  } catch (err) {
    app.innerHTML = `<div class="error">加载数据失败：${
      err instanceof Error ? err.message : String(err)
    }<br><small>请通过本地服务器访问（例如 npm run serve），而非直接双击打开文件。</small></div>`;
    return;
  }

  const names = allDeckNames(matches);
  const trendDeckNames = top4DeckNames(matches, config.matchTypes);
  const state: State = {
    config,
    matches,
    names,
    trendDeckNames,
    colorMap: buildColorMap(names),
    view: "pie",
    selectedMatch: matchIndexByDateParam(matches, dateParam ?? null), // 按日期参数定位，否则最近一场
    selectedDecks: [], // 趋势图默认空，由用户搜索添加
    selectedTypes: new Set(config.matchTypes), // 默认全部类型
    dateRange: null, // 默认不限制日期
    eventEdition, // 分站当前板块
  };
  currentState = state;
  // 修正地址栏，使其反映实际定位到的比赛日期（不新增历史记录）
  history.replaceState(null, "", buildUrl(state));
  renderShell(state, actions);
}

/** 根据当前状态渲染视图主体 */
function renderBody(state: State): void {
  const body = document.getElementById("view-body");
  if (!body) return;
  body.innerHTML = "";

  if (state.config.site === "builder") {
    body.appendChild(buildBuilderView(state));
  } else if (state.config.site === "deck-display") {
    body.appendChild(buildDeckDisplayView(state));
  } else if (state.config.site === "faq") {
    body.appendChild(buildFaqView());
  } else if (state.view === "pie") {
    body.appendChild(buildPieView(state, actions));
  } else {
    body.appendChild(buildTrendView(state));
  }
}

async function main(): Promise<void> {
  // 根据 URL 决定加载哪个站点、板块及定位到的比赛
  const { site, edition, dateParam, deckParam, limitsParam } = parseRoute();
  await loadSite(site, edition, dateParam, deckParam, limitsParam);

  // 浏览器前进/后退时响应路由变化
  window.addEventListener("popstate", () => {
    const { site, edition, dateParam, deckParam, limitsParam } = parseRoute();
    // 后退离开构筑导出站同样会丢构筑。取消时把地址推回原处，不重新加载，
    // 这样已经在内存里的构筑原样保留（此时浏览器已经跳走，必须补一次 pushState）
    if (
      currentState &&
      site !== currentState.config.site &&
      !confirmLeaveDeck(currentState.builderDeck)
    ) {
      history.pushState(null, "", buildUrl(currentState));
      return;
    }
    // 同站点、同板块下仅日期变化时，无需重新加载数据
    if (
      currentState &&
      currentState.config.site === site &&
      currentState.eventEdition === edition &&
      currentState.config.hasData
    ) {
      currentState.selectedMatch = matchIndexByDateParam(currentState.matches, dateParam);
      currentState.view = "pie";
      renderBody(currentState);
      return;
    }
    loadSite(site, edition, dateParam, deckParam, limitsParam);
  });

  // 关闭标签页/刷新/地址栏跳走时提醒（弹窗文案由浏览器决定）
  watchUnload(() => currentState?.builderDeck);

  // 主题切换后重绘（颜色跟随主题）
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (currentState) renderBody(currentState);
  });
}

main();
