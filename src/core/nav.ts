// 导航外壳：站点切换下拉、板块切换、视图切换

import type { EventEdition } from "./types.js";
import type { State, View, AppActions } from "./config.js";
import { EVENT_EDITION_CONFIGS, SITE_MENU, sitePath } from "./config.js";
import { allDeckNames, loadData, top4DeckNames } from "./data.js";
import { buildColorMap } from "./palette.js";
import { confirmLeaveDeck, syncUrl } from "./router.js";
import { buildFooter } from "./footer.js";

const app = document.getElementById("app")!;

/** 渲染整体外壳（导航栏 + 视图容器），并触发首次视图渲染 */
export function renderShell(state: State, actions: AppActions): void {
  app.innerHTML = "";

  const nav = document.createElement("nav");
  nav.className = "menu";

  // 站点切换下拉 + 标题
  const brandWrap = document.createElement("div");
  brandWrap.className = "brand-wrap";
  brandWrap.appendChild(buildSiteDropdown(state, actions));

  const title = document.createElement("span");
  title.className = "brand";
  title.textContent = state.config.title;
  brandWrap.appendChild(title);

  nav.appendChild(brandWrap);

  // 分站板块切换（OCG / 简体中文）
  if (state.config.hasEditionToggle && state.eventEdition) {
    nav.appendChild(buildEditionTabs(state, actions));
  }

  // 模式切换（仅主站有“上位卡组统计”）
  if (state.config.hasTrend) {
    nav.appendChild(buildViewTabs(state, actions));
  }

  app.appendChild(nav);

  const body = document.createElement("main");
  body.id = "view-body";
  body.className = "view-body";
  app.appendChild(body);

  app.appendChild(buildFooter());

  actions.renderBody(state);
}

/** 标题左侧的站点切换下拉：一个省略号按钮，悬停展开菜单 */
function buildSiteDropdown(state: State, actions: AppActions): HTMLElement {
  const dropdown = document.createElement("div");
  dropdown.className = "site-dropdown";

  const btn = document.createElement("button");
  btn.className = "site-dropdown-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "切换站点");
  btn.textContent = "⋯";

  const listWrap = document.createElement("div");
  listWrap.className = "match-dropdown-list site-dropdown-list";
  const list = document.createElement("ul");
  SITE_MENU.forEach((item) => {
    const li = document.createElement("li");
    if (item.site === state.config.site) li.classList.add("active");
    li.textContent = item.label;
    li.addEventListener("click", () => {
      if (item.site === state.config.site) return;
      // 离开构筑导出站会丢掉当前构筑，先问一句
      if (!confirmLeaveDeck(state.builderDeck)) return;
      history.pushState(null, "", sitePath(item.site));
      actions.loadSite(item.site);
    });
    list.appendChild(li);
  });
  listWrap.appendChild(list);

  dropdown.append(btn, listWrap);
  return dropdown;
}

/** 分站板块切换标签（OCG / 简体中文） */
function buildEditionTabs(state: State, actions: AppActions): HTMLElement {
  const tabs = document.createElement("div");
  tabs.className = "tabs";
  (["ocg", "sc"] as EventEdition[]).forEach((edition) => {
    const btn = document.createElement("button");
    btn.textContent = EVENT_EDITION_CONFIGS[edition].label;
    btn.className = "tab" + (state.eventEdition === edition ? " active" : "");
    btn.addEventListener("click", async () => {
      if (state.eventEdition === edition) return;
      state.eventEdition = edition;
      const editionConfig = EVENT_EDITION_CONFIGS[edition];
      state.config.dataPath = editionConfig.dataPath;
      state.config.deckDir = editionConfig.deckDir;
      state.config.editionToggleLabel = editionConfig.label;

      // 重新加载数据
      app.innerHTML = `<p class="empty-note">正在加载…</p>`;
      try {
        const matches = await loadData(state.config.dataPath);
        const names = allDeckNames(matches);
        const trendDeckNames = top4DeckNames(matches, state.config.matchTypes);
        state.matches = matches;
        state.names = names;
        state.trendDeckNames = trendDeckNames;
        state.colorMap = buildColorMap(names);
        state.selectedMatch = matches.length - 1;
        syncUrl(state);
        actions.renderShell(state);
      } catch (err) {
        app.innerHTML = `<div class="error">加载数据失败：${
          err instanceof Error ? err.message : String(err)
        }</div>`;
      }
    });
    tabs.appendChild(btn);
  });
  return tabs;
}

/** 视图切换标签（比赛详情 / 上位卡组统计） */
function buildViewTabs(state: State, actions: AppActions): HTMLElement {
  const tabs = document.createElement("div");
  tabs.className = "tabs";
  (["pie", "trend"] as View[]).forEach((v) => {
    const btn = document.createElement("button");
    btn.textContent = v === "pie" ? "比赛详情" : "上位卡组统计";
    btn.className = "tab" + (state.view === v ? " active" : "");
    btn.addEventListener("click", () => {
      state.view = v;
      syncUrl(state);
      actions.renderShell(state);
    });
    tabs.appendChild(btn);
  });
  return tabs;
}
