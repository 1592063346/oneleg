// URL 与应用状态之间的映射

import type { Match, EventEdition } from "./types.js";
import type { Site, State } from "./config.js";

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
  const base =
    state.config.site === "event" ? "/event" : state.config.site === "faq" ? "/faq" : "/";
  const params = new URLSearchParams();
  if (state.config.site === "event") {
    params.set("env", state.eventEdition || "ocg");
  }
  // 仅在比赛详情（饼图）视图携带日期
  const match = state.matches[state.selectedMatch];
  if (state.config.site !== "faq" && state.view === "pie" && match) {
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
  if (path === "/faq") return { site: "faq", dateParam: null };
  return { site: "main", dateParam };
}
