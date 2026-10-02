// URL 与应用状态之间的映射，以及离开页面时的构筑提醒

import type { Match, EventEdition, DeckData } from "./types.js";
import type { Site, State, AppActions } from "./config.js";
import { sitePath } from "./config.js";
import { getLang, parseLang, t, type Lang } from "./i18n.js";
import { encodeDeck } from "../domain/deckCode.js";

/**
 * 站内切换站点：先过“构筑会丢失”的确认，再 pushState 并加载目标站点。
 * 站点菜单与页脚的“关于网站”共用此路径，两处行为须一致。
 */
export function navigateToSite(site: Site, state: State, actions: AppActions): void {
  if (site === state.config.site) return;
  if (!confirmLeaveDeck(state.builderDeck)) return;
  history.pushState(null, "", sitePath(site) + langQuery());
  actions.loadSite(site);
}

/**
 * 当前语言的 URL 后缀。中文不带参数，英文为 ?lang=en；
 * 拼给不经过 buildUrl 的地址（如页脚里“关于网站”的 href）。
 */
export function langQuery(): string {
  return getLang() === "en" ? "?lang=en" : "";
}

/** 把语言写进查询参数。中文不写，地址保持原样 */
function appendLang(params: URLSearchParams): void {
  if (getLang() === "en") params.set("lang", "en");
}

/**
 * 禁限卡表页的地址。构筑页的“查看”在新标签页打开它，故须带上当前语言；
 * tag 已在地址里，中文模式下不加多余参数。
 */
export function limitsPageUrl(tag: string): string {
  return `${sitePath("limits")}/${encodeURIComponent(tag)}${langQuery()}`;
}

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

/**
 * 构筑链接：site 取 builder（可编辑）或 deck-display（只读展示）。
 * 构筑非空才带 deck（空构筑不必写进地址），未选卡表则不带 limits。
 * 构筑导出页的“复制分享链接”与展示页的“编辑卡组”都靠它拼地址。
 */
export function buildDeckUrl(
  site: Site,
  deck: DeckData | undefined,
  limitTag: string | null | undefined
): string {
  const params = new URLSearchParams();
  if (deck && cardCount(deck) > 0) params.set("deck", encodeDeck(deck));
  if (limitTag) params.set("limits", limitTag);
  appendLang(params);
  const qs = params.toString();
  return qs ? `${sitePath(site)}?${qs}` : sitePath(site);
}

/**
 * 根据当前状态构建 URL（比赛详情附带 ?date=，分站附带 ?env=，
 * 构筑两站附带 ?deck=/?limits=，英文模式一律附带 ?lang=en）
 */
export function buildUrl(state: State): string {
  const base = sitePath(state.config.site);
  if (state.config.site === "builder") {
    return buildDeckUrl("builder", state.builderDeck, state.builderLimitTag);
  }
  if (state.config.site === "deck-display") {
    return buildDeckUrl("deck-display", state.displayDeck, state.displayLimitTag);
  }
  if (state.config.site === "limits") {
    const path = state.limitViewTag ? `${base}/${encodeURIComponent(state.limitViewTag)}` : base;
    const params = new URLSearchParams();
    appendLang(params);
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  }
  const params = new URLSearchParams();
  if (state.config.site === "event") {
    params.set("env", state.eventEdition || "ocg");
  }
  appendLang(params);
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

/**
 * 将当前状态同步到地址栏，替换当前历史记录。
 * 构筑导出站编辑过程中会频繁调用，用 pushState 会让后退键逐步回退每一次编辑。
 */
export function replaceUrl(state: State): void {
  history.replaceState(null, "", buildUrl(state));
}

/** 解析当前 URL，得到站点、板块、语言与各查询参数（deck/limits 仅构筑两站使用） */
export function parseRoute(): {
  site: Site;
  edition?: EventEdition;
  lang: Lang;
  dateParam: string | null;
  deckParam: string | null;
  limitsParam: string | null;
  limitTagParam: string | null;
} {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const dateParam = params.get("date");
  const lang = parseLang(params.get("lang"));
  const none = { dateParam: null, deckParam: null, limitsParam: null, limitTagParam: null };
  if (path === "/event") {
    const env = params.get("env");
    const edition: EventEdition = env === "sc" ? "sc" : "ocg";
    return { site: "event", edition, lang, ...none };
  }
  if (path === "/builder" || path === "/deck-display") {
    return {
      site: path === "/builder" ? "builder" : "deck-display",
      lang,
      ...none,
      deckParam: params.get("deck"),
      limitsParam: params.get("limits"),
    };
  }
  if (path === "/limits" || path.startsWith("/limits/")) {
    const tag = path.slice("/limits/".length);
    return { site: "limits", lang, ...none, limitTagParam: tag ? decodeURIComponent(tag) : null };
  }
  if (path === "/faq") {
    return { site: "faq", lang, ...none };
  }
  return { site: "main", lang, ...none, dateParam };
}

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
  return confirm(t("leave.deckConfirm"));
}

/** 注册关页提醒：构筑里有卡片时才拦，弹窗文案由浏览器决定 */
export function watchUnload(getDeck: () => DeckData | undefined): void {
  window.addEventListener("beforeunload", (ev) => {
    if (cardCount(getDeck()) === 0) return;
    ev.preventDefault();
  });
}
