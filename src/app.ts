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
  navigateToSite,
  parseRoute,
  watchUnload,
} from "./core/router.js";
import { renderShell } from "./core/nav.js";
import { extensionFor, extensionReady } from "./core/extension.js";
import { getLang, setLang, t } from "./core/i18n.js";
import { createEmptyDeck } from "./domain/deck.js";
import { decodeDeck } from "./domain/deckCode.js";
import { hasLimitTag, loadLimitTables } from "./domain/limits.js";
import { buildPieView } from "./views/pie.js";
import { buildTrendView } from "./views/trend.js";
import { buildBuilderView, buildDeckDisplayView } from "./views/builder.js";
import { buildLimitsView } from "./views/limits.js";
import { buildFaqView } from "./views/faq.js";

const app = document.getElementById("app")!;
let currentState: State | null = null;

/** 解析出的路由，见 router.parseRoute */
type Route = ReturnType<typeof parseRoute>;

/**
 * 把当前语言同步到文档本身：<html lang> 与标题、描述。
 * index.html 里的中文副本是无脚本时的兜底，有脚本时以这里为准。
 */
function applyLang(): void {
  document.documentElement.lang = getLang() === "en" ? "en" : "zh-CN";
  document.title = t("meta.title");
  const desc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (desc) desc.content = t("meta.description");
}

/** 注入给导航与视图的操作回调，避免它们反向依赖本文件 */
const actions: AppActions = {
  loadSite,
  // 语言切换就地重绘外壳、不经过 loadSite，故文档语言也在这里同步一次
  renderShell: (state) => {
    applyLang();
    renderShell(state, actions);
  },
  renderBody,
  navigateToSite: (site) => {
    if (currentState) navigateToSite(site, currentState, actions);
  },
  // 扩展模块内部的跳转：数据在进入模块时已加载，就地重绘即可，无须重走 loadSite
  openExtension: (site, param) => {
    if (!currentState || currentState.config.site !== site) return;
    if ((currentState.extensionParam ?? null) === param) return;
    if (!confirmLeaveDeck(currentState.builderDeck)) return;
    currentState.extensionParam = param;
    history.pushState(null, "", buildUrl(currentState));
    refresh(currentState);
  },
};

async function loadSite(site: Site, route: Partial<Route> = {}): Promise<void> {
  const { edition, dateParam, deckParam, limitsParam, limitTagParam, extensionParam } = route;
  const config = SITE_CONFIGS[site];
  applyLang();
  app.innerHTML = `<p class="empty-note">${t("app.loading")}</p>`;

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
    // 扩展模块自行取数据；失败由模块自己的视图提示，此处不打断外壳渲染
    const extension = extensionFor(site);
    if (extension) {
      state.extensionParam = extensionParam ?? null;
      await extension.load(extensionParam ?? null).catch(() => null);
    }
    // 构筑两站（可编辑的构筑导出、只读的构筑展示）共用同一套 deck / limits 解析
    if (site === "limits") {
      await loadLimitTables().catch(() => null);
      state.limitViewTag = limitTagParam ?? null;
    }
    if (site === "builder" || site === "deck-display") {
      await loadLimitTables().catch(() => null);
      const deck = deckParam ? decodeDeck(deckParam) : null;
      if (deckParam && !deck) alert(t("app.deckDecodeFailed"));
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
  }

  let matches: Match[];
  try {
    matches = await loadData(config.dataPath);
  } catch (err) {
    app.innerHTML = `<div class="error">${t("app.loadFailed", {
      msg: err instanceof Error ? err.message : String(err),
    })}<br><small>${t("app.loadFailedHint")}</small></div>`;
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

/**
 * 重绘当前页面。扩展模块的页首含有随地址参数变化的部分（列表页与正文页的按钮不同），
 * 故外壳与视图一并重绘；普通站点只换视图主体。
 */
function refresh(state: State): void {
  if (extensionFor(state.config.site)) actions.renderShell(state);
  else renderBody(state);
}

/** 根据当前状态渲染视图主体 */
function renderBody(state: State): void {
  const body = document.getElementById("view-body");
  if (!body) return;
  body.innerHTML = "";

  // 扩展模块自带视图
  const extension = extensionFor(state.config.site);
  if (extension) {
    body.appendChild(extension.render(state, actions));
    return;
  }

  if (state.config.site === "builder") {
    body.appendChild(buildBuilderView(state));
  } else if (state.config.site === "deck-display") {
    body.appendChild(buildDeckDisplayView(state));
  } else if (state.config.site === "limits") {
    body.appendChild(buildLimitsView(state, actions));
  } else if (state.config.site === "faq") {
    body.appendChild(buildFaqView());
  } else if (state.view === "pie") {
    body.appendChild(buildPieView(state, actions));
  } else {
    body.appendChild(buildTrendView(state));
  }
}

async function main(): Promise<void> {
  // 根据 URL 决定加载哪个站点、板块及定位到的比赛。
  // 语言要先定下来，外壳与各视图的文案都取自它
  const route = parseRoute();
  setLang(route.lang);
  await loadSite(route.site, route);

  // 浏览器前进/后退时响应路由变化
  window.addEventListener("popstate", () => {
    const route = parseRoute();
    const { site, edition, dateParam, extensionParam, lang } = route;
    // 语言一变，外壳与视图的文案整体作废，得重绘而不能只改数据
    const langChanged = lang !== getLang();
    if (langChanged) setLang(lang);
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
    // 同站点、同板块（可含语言变化）时无需重新加载数据，重绘即可。
    // 扩展模块的数据在进入时已缓存，同样就地重绘，免得在模块内部翻页时闪一次“加载中”
    if (
      currentState &&
      currentState.config.site === site &&
      currentState.eventEdition === edition &&
      (currentState.config.hasData || extensionReady(site))
    ) {
      currentState.selectedMatch = matchIndexByDateParam(currentState.matches, dateParam);
      currentState.view = "pie";
      currentState.extensionParam = extensionParam;
      if (langChanged) actions.renderShell(currentState);
      else refresh(currentState);
      return;
    }
    loadSite(site, route);
  });

  // 关闭标签页/刷新/地址栏跳走时提醒（弹窗文案由浏览器决定）
  watchUnload(() => currentState?.builderDeck);

  // 主题切换后重绘（颜色跟随主题）
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (currentState) renderBody(currentState);
  });
}

main();
