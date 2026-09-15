// 站点类型、配置与共享状态定义

import type { Match, MatchType, EventEdition } from "./types.js";
import { MATCH_TYPES, EVENT_MATCH_TYPES } from "./types.js";

export type View = "pie" | "trend";
export type Site = "main" | "event" | "faq";

/** 站点配置：主站与国内赛事数据站（分站）的差异集中在此 */
export interface SiteConfig {
  site: Site;
  title: string;
  toggleLabel: string; // 标题旁切换按钮文案
  dataPath: string;
  deckDir: string;
  matchTypes: MatchType[];
  hasTrend: boolean; // 是否有“上位卡组统计”模式
  showNameInDropdown: boolean; // 比赛下拉是否显示名称
  hasEditionToggle?: boolean; // 是否有板块切换（分站专用）
  editionToggleLabel?: string; // 板块切换按钮文案
}

/** 分站板块配置 */
export const EVENT_EDITION_CONFIGS: Record<
  EventEdition,
  { dataPath: string; deckDir: string; label: string }
> = {
  ocg: {
    dataPath: "./data/event_data_ocg.json",
    deckDir: "./data/event_deck/ocg",
    label: "OCG",
  },
  sc: {
    dataPath: "./data/event_data_sc.json",
    deckDir: "./data/event_deck/sc",
    label: "简体中文",
  },
};

export const SITE_CONFIGS: Record<Site, SiteConfig> = {
  main: {
    site: "main",
    title: "万籁阁游戏王 OCG 比赛数据站",
    toggleLabel: "主站",
    dataPath: "./data/data.json",
    deckDir: "./data/deck",
    matchTypes: MATCH_TYPES,
    hasTrend: true,
    showNameInDropdown: false,
  },
  event: {
    site: "event",
    title: "中国大陆游戏王赛事数据站",
    toggleLabel: "国内赛事数据站",
    dataPath: "./data/event_data_ocg.json",
    deckDir: "./data/event_deck/ocg",
    matchTypes: EVENT_MATCH_TYPES,
    hasTrend: false,
    showNameInDropdown: true,
    hasEditionToggle: true,
    editionToggleLabel: "OCG",
  },
  faq: {
    site: "faq",
    title: "万籁阁游戏王 OCG 比赛数据站",
    toggleLabel: "关于网站",
    dataPath: "",
    deckDir: "",
    matchTypes: [],
    hasTrend: false,
    showNameInDropdown: false,
  },
};

/** 站点切换下拉的选项顺序与文案 */
export const SITE_MENU: { site: Site; label: string; path: string }[] = [
  { site: "main", label: "主站", path: "/" },
  { site: "event", label: "国内赛事数据站", path: "/event" },
  { site: "faq", label: "关于网站", path: "/faq" },
];

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
}

/**
 * 应用级操作回调：由 app.ts 注入，供导航与各视图触发加载/重绘，
 * 避免视图模块反向依赖入口文件形成循环引用。
 */
export interface AppActions {
  loadSite(site: Site, edition?: EventEdition, dateParam?: string | null): Promise<void>;
  renderShell(state: State): void;
  renderBody(state: State): void;
}
