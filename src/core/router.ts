// URL 与应用状态之间的映射，以及离开页面时的构筑提醒

import type { Match, EventEdition, DeckData } from "./types.js";
import type { Site, State } from "./config.js";
import { sitePath } from "./config.js";

/** 将日期 yyyy/mm/dd 转为 URL 参数形式 yyyymmdd */
export function dateToParam(date: string): string {
  return date.replace(/\//g, "");
}

/** 根据日期参数在比赛列表中查找索引，找不到则返回最近一场 */
export function matchIndexByDateParam(matches: Match[], param: string | null): number {
  if (param) {
    const idx = matches.findIndex((m) => dateToParam(m.date) === param);
    if (idx >= 0) return idx;
  }
  return matches.length - 1;
}

/** 根据当前状态构建 URL（比赛详情附带 ?date=，分站附带 ?env=） */
export function buildUrl(state: State): string {
  const base = sitePath(state.config.site);
  const params = new URLSearchParams();
  if (state.config.site === "event") {
    params.set("env", state.eventEdition || "ocg");
  }
  // 仅在比赛详情（饼图）视图携带日期
  const match = state.matches[state.selectedMatch];
  if (state.config.hasData && state.view === "pie" && match) {
    params.set("date", dateToParam(match.date));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** 将当前状态同步到浏览器地址栏（新增历史记录） */
export function syncUrl(state: State): void {
  history.pushState(null, "", buildUrl(state));
}

/** 解析当前 URL，得到站点、板块与日期参数 */
export function parseRoute(): { site: Site; edition?: EventEdition; dateParam: string | null } {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const dateParam = params.get("date");
  if (path === "/event") {
    const env = params.get("env");
    const edition: EventEdition = env === "sc" ? "sc" : "ocg";
    return { site: "event", edition, dateParam };
  }
  if (path === "/builder") return { site: "builder", dateParam: null };
  if (path === "/faq") return { site: "faq", dateParam: null };
  return { site: "main", dateParam };
}

// ---- 构筑未清空时的离开提醒 ----
//
// 三条离开路径的拦截点各不相同：
// - 站内切换站点是 pushState 的 SPA 跳转，页面并不卸载，beforeunload 不会触发，
//   只能在点击处自己拦；
// - 浏览器后退同理，要在 popstate 里拦；
// - 关闭标签页 / 刷新 / 地址栏跳走才是真正的页面卸载，那里只有浏览器自己的
//   beforeunload 原生弹窗，文案由浏览器决定，网站改不了。
//
// 另外，切换站点时 app.ts 会重建 State，builderDeck 不会跟着过去，
// 所以站内离开是真的会丢构筑，不只是防误触。

/** 构筑里的卡片总数 */
function cardCount(deck: DeckData | undefined): number {
  if (!deck) return 0;
  return deck.main.length + deck.extra.length + deck.side.length;
}

/**
 * 站内离开前的确认，返回 true 表示可以离开。
 * 传 undefined（当前不在构筑导出站）或构筑为空时直接放行。
 */
export function confirmLeaveDeck(deck: DeckData | undefined): boolean {
  if (cardCount(deck) === 0) return true;
  return confirm("当前构筑存在已有卡片，离开后将会丢失。确定离开？");
}

/** 注册关页提醒：构筑里有卡片时才拦，弹窗文案由浏览器决定 */
export function watchUnload(getDeck: () => DeckData | undefined): void {
  window.addEventListener("beforeunload", (ev) => {
    if (cardCount(getDeck()) === 0) return;
    ev.preventDefault();
  });
}
