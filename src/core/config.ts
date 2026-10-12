// 站点类型、配置与共享状态定义

import type { DeckData, Match, MatchType, EventEdition } from "./types.js";
import { MATCH_TYPES, EVENT_MATCH_TYPES } from "./types.js";
import { EXTENSIONS } from "./extension.js";
import type { MsgKey } from "./i18n.js";

export type View = "pie" | "trend";
/** 站点标识。内置站点固定，扩展模块各自登记一个，故不写成联合类型 */
export type Site = string;

/** 站点配置：主站与国内赛事数据站（分站）的差异集中在此 */
export interface SiteConfig {
  site: Site;
  /** URL 基础路径。同时是各站点的唯一来源：站点菜单也照它跳转 */
  path: string;
  /** 站点标题文案的键（见 i18n.ts） */
  titleKey: MsgKey;
  dataPath: string;
  deckDir: string;
  matchTypes: MatchType[];
  hasTrend: boolean; // 是否有“上位卡组统计”模式
  showNameInDropdown: boolean; // 比赛下拉是否显示名称
  hasData: boolean; // 是否需要加载比赛数据（关于网站、构筑导出站不需要）
  hasEditionToggle?: boolean; // 是否有板块切换（分站专用）
}

/** 分站板块配置 */
export const EVENT_EDITION_CONFIGS: Record<
  EventEdition,
  { dataPath: string; deckDir: string; labelKey: MsgKey }
> = {
  ocg: {
    dataPath: "./data/event_data_ocg.json",
    deckDir: "./data/event_deck/ocg",
    labelKey: "edition.ocg",
  },
  sc: {
    dataPath: "./data/event_data_sc.json",
    deckDir: "./data/event_deck/sc",
    labelKey: "edition.sc",
  },
};

/** 内置站点的配置 */
const BUILTIN_SITES: Record<string, SiteConfig> = {
  main: {
    site: "main",
    path: "/",
    titleKey: "site.home.title",
    dataPath: "./data/data.json",
    deckDir: "./data/deck",
    matchTypes: MATCH_TYPES,
    hasTrend: true,
    showNameInDropdown: false,
    hasData: true,
  },
  event: {
    site: "event",
    path: "/event",
    titleKey: "site.event.title",
    dataPath: "./data/event_data_ocg.json",
    deckDir: "./data/event_deck/ocg",
    matchTypes: EVENT_MATCH_TYPES,
    hasTrend: false,
    showNameInDropdown: true,
    hasData: true,
    hasEditionToggle: true,
  },
  builder: {
    site: "builder",
    path: "/builder",
    titleKey: "site.home.title",
    dataPath: "",
    deckDir: "",
    matchTypes: [],
    hasTrend: false,
    showNameInDropdown: false,
    hasData: false,
  },
  "deck-display": {
    site: "deck-display",
    path: "/deck-display",
    titleKey: "site.home.title",
    dataPath: "",
    deckDir: "",
    matchTypes: [],
    hasTrend: false,
    showNameInDropdown: false,
    hasData: false,
  },
  limits: {
    site: "limits",
    path: "/limits",
    titleKey: "site.home.title",
    dataPath: "",
    deckDir: "",
    matchTypes: [],
    hasTrend: false,
    showNameInDropdown: false,
    hasData: false,
  },
  faq: {
    site: "faq",
    path: "/faq",
    titleKey: "site.home.title",
    dataPath: "",
    deckDir: "",
    matchTypes: [],
    hasTrend: false,
    showNameInDropdown: false,
    hasData: false,
  },
};

/**
 * 扩展模块共有的配置项：不取比赛数据、不列入站点菜单，
 * 也不显示品牌标题（页首由模块自己给出），故 titleKey 只作占位。
 */
const EXTENSION_SITE: Omit<SiteConfig, "site" | "path"> = {
  titleKey: "site.home.title",
  dataPath: "",
  deckDir: "",
  matchTypes: [],
  hasTrend: false,
  showNameInDropdown: false,
  hasData: false,
};

/** 全部站点配置：内置站点加上扩展模块登记的站点 */
export const SITE_CONFIGS: Record<string, SiteConfig> = { ...BUILTIN_SITES };
EXTENSIONS.forEach((module) => {
  SITE_CONFIGS[module.site] = { ...EXTENSION_SITE, site: module.site, path: module.path };
});

export const SITE_MENU: { site: Site; labelKey: MsgKey }[] = [
  { site: "main", labelKey: "menu.main" },
  { site: "event", labelKey: "menu.event" },
  { site: "builder", labelKey: "menu.builder" },
  { site: "faq", labelKey: "menu.faq" },
];

/** 站点对应的 URL 基础路径 */
export function sitePath(site: Site): string {
  return SITE_CONFIGS[site].path;
}

export interface State {
  config: SiteConfig;
  matches: Match[];
  names: string[]; // 所有卡组名称（用于颜色映射）
  trendDeckNames: string[]; // 四强上位卡组名称（用于趋势图搜索）
  colorMap: Map<string, number>;
  view: View;
  selectedMatch: number; // 饼图选中的比赛索引
  selectedDecks: string[]; // 趋势图已添加的卡组（有序）
  selectedTypes: Set<MatchType>; // 趋势图选中的比赛类型
  dateRange: { start: string; end: string } | null; // 趋势图日期区间筛选
  eventEdition?: EventEdition; // 分站当前板块（仅分站使用）
  builderDeck?: DeckData; // 构筑导出站正在编辑的卡组
  builderLimitTag?: string | null; // 构筑导出站当前适用的禁限卡表
  // 构筑展示站（只读）正在展示的卡组与其适用的禁限卡表。
  displayDeck?: DeckData; // 构筑展示站（只读）正在展示的卡组与其适用的禁限卡表。
  displayLimitTag?: string | null;
  limitViewTag?: string | null; // 禁限卡表页正在浏览的表 tag
  extensionParam?: string | null; // 扩展模块页面的地址参数（如文章 id）；无则表示模块入口页
}

/**
 * 应用级操作回调：由 app.ts 注入，供导航与各视图触发加载/重绘，
 * 避免视图模块反向依赖入口文件形成循环引用。
 */
export interface AppActions {
  loadSite(site: Site): Promise<void>;
  /** 切换站点：含离开构筑的确认、写地址与加载 */
  navigateToSite(site: Site): void;
  renderShell(state: State): void;
  renderBody(state: State): void;
  /** 扩展模块内部的站内跳转（如文章列表与正文之间）：含确认、写地址与重绘 */
  openExtension(site: Site, param: string | null): void;
}
