// 导航外壳：站点切换下拉、板块切换、视图切换

import type { EventEdition } from "./types.js";
import type { State, View, AppActions } from "./config.js";
import { EVENT_EDITION_CONFIGS, SITE_MENU } from "./config.js";
import { allDeckNames, loadData, top4DeckNames } from "./data.js";
import { buildColorMap } from "./palette.js";
import { getLang, setLang, t } from "./i18n.js";
import { navigateToSite, syncUrl } from "./router.js";
import { buildFooter } from "./footer.js";

const app = document.getElementById("app")!;

/** 渲染整体外壳（导航栏 + 视图容器），并触发首次视图渲染 */
export function renderShell(state: State, actions: AppActions): void {
  app.innerHTML = "";

  const nav = document.createElement("nav");
  nav.className = "menu";

  // 站点切换下拉 + 语言切换 + 标题
  const brandWrap = document.createElement("div");
  brandWrap.className = "brand-wrap";
  brandWrap.append(buildSiteDropdown(state, actions), buildLangToggle(state, actions));

  const title = document.createElement("span");
  title.className = "brand";
  title.textContent = t(state.config.titleKey);
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

  app.appendChild(buildFooter(state, actions));

  actions.renderBody(state);
}

/** 标题左侧的站点切换下拉：一个省略号按钮，悬停展开菜单 */
function buildSiteDropdown(state: State, actions: AppActions): HTMLElement {
  const dropdown = document.createElement("div");
  dropdown.className = "site-dropdown";

  const btn = document.createElement("button");
  btn.className = "site-dropdown-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", t("nav.siteMenu"));
  btn.textContent = "⋯";

  const listWrap = document.createElement("div");
  listWrap.className = "match-dropdown-list site-dropdown-list";
  const list = document.createElement("ul");
  SITE_MENU.forEach((item) => {
    const li = document.createElement("li");
    if (item.site === state.config.site) li.classList.add("active");
    li.textContent = t(item.labelKey);
    li.addEventListener("click", () => navigateToSite(item.site, state, actions));
    list.appendChild(li);
  });
  listWrap.appendChild(list);

  dropdown.append(btn, listWrap);
  return dropdown;
}

/**
 * 语言切换：点击即在中英之间来回切，没有下拉。
 * 文案遍布外壳与各视图，故整壳重绘；state 与各视图的模块级状态都不受影响。
 * 地址随之带上或去掉 ?lang=en，使当前语言可分享。
 */
function buildLangToggle(state: State, actions: AppActions): HTMLElement {
  const toEn = getLang() === "zh";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "site-dropdown-btn lang-toggle";
  // 用 SVG 而非 🌐 表情：表情强制彩色渲染，color 与悬停变色对它都不生效
  btn.innerHTML =
    '<svg viewBox="0 0 16 16" width="17" height="17" fill="none"' +
    ' stroke="currentColor" stroke-width="1.3" aria-hidden="true">' +
    '<circle cx="8" cy="8" r="6.35"/>' +
    '<ellipse cx="8" cy="8" rx="2.9" ry="6.35"/>' +
    '<path d="M1.65 8h12.7"/>' +
    "</svg>";
  btn.title = t(toEn ? "nav.lang.toEn" : "nav.lang.toZh");
  btn.setAttribute("aria-label", btn.title);
  btn.addEventListener("click", () => {
    setLang(toEn ? "en" : "zh");
    syncUrl(state);
    actions.renderShell(state);
  });
  return btn;
}

/** 分站板块切换标签（OCG / 简体中文） */
function buildEditionTabs(state: State, actions: AppActions): HTMLElement {
  const tabs = document.createElement("div");
  tabs.className = "tabs";
  (["ocg", "sc"] as EventEdition[]).forEach((edition) => {
    const btn = document.createElement("button");
    btn.textContent = t(EVENT_EDITION_CONFIGS[edition].labelKey);
    btn.className = "tab" + (state.eventEdition === edition ? " active" : "");
    btn.addEventListener("click", async () => {
      if (state.eventEdition === edition) return;
      state.eventEdition = edition;
      const editionConfig = EVENT_EDITION_CONFIGS[edition];
      state.config.dataPath = editionConfig.dataPath;
      state.config.deckDir = editionConfig.deckDir;

      // 重新加载数据
      app.innerHTML = `<p class="empty-note">${t("app.loading")}</p>`;
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
        app.innerHTML = `<div class="error">${t("app.loadFailed", {
          msg: err instanceof Error ? err.message : String(err),
        })}</div>`;
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
    btn.textContent = t(v === "pie" ? "nav.view.pie" : "nav.view.trend");
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
