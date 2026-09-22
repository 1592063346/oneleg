// 数据模型定义

/** 单个卡组的名称及其数量 */
export interface DeckCount {
  name: string;
  num: number;
  subdecks?: Array<{ deck: string; num: number }>;
}

/** 选手及其使用的卡组 */
export interface Player {
  id: string;
  deck: string;
  deck_file?: boolean; // 是否有卡组文件
}

/** 比赛类型 */
export type MatchType =
  | "娱乐赛"
  | "积分赛"
  | "王中王邀请赛"
  | "特殊规则赛"
  // 国内赛事数据站（分站）类型
  | "城市巡回赛"
  | "YCS"
  | "特别大会"
  | "WCQ 预选赛"
  | "WCQ";

/** 分站板块类型 */
export type EventEdition = "ocg" | "sc";

/** 主站全部比赛类型（用于趋势模式的类型筛选） */
export const MATCH_TYPES: MatchType[] = ["娱乐赛", "积分赛", "王中王邀请赛"];

/** 分站（国内赛事数据站）全部比赛类型 */
export const EVENT_MATCH_TYPES: MatchType[] = ["城市巡回赛", "YCS", "特别大会", "WCQ 预选赛", "WCQ"];

/** 一场比赛的记录 */
export interface Match {
  /** 比赛时间，形如 "2026/08/05" */
  date: string;
  /** 比赛标题 */
  title: string;
  /** 比赛类型 */
  type: MatchType;
  /** 冠军 */
  "1st": Player;
  /** 亚军 */
  "2nd"?: Player;
  /** 四强 */
  "3_4th"?: Player[];
  /** 该场比赛各卡组数量 */
  decks: DeckCount[];
  /** 进入淘汰赛的卡组情况（与 decks 格式相同，可选） */
  elimination_decks?: DeckCount[];
  /** 该场比赛卡组总数（参赛人数，该数据一般为 decks 未统计时的备用数据） */
  deck_num?: number;
  /** 卡图环境（影响卡图 CDN 路径），可选，默认 "ocg" */
  env?: string;
  /** 比赛描述，可含 HTML 标签，可选 */
  disc?: string;
}

/** 一份禁限卡表（data/limits/ 下的单个文件） */
export interface LimitTable {
  /** 表名，如 "2026 年 7 月表（OCG）" */
  name: string;
  /**
   * 全部禁限制卡：卡片 id -> 允许投入张数。
   * 0 禁止 / 1 限制 / 2 准限制，禁止卡、限制卡、准限制卡的名单由它反推。
   */
  all: Record<string, number>;
}

/** data.json 的顶层结构 */
export interface DataFile {
  decks: Match[];
}

/** 一个卡组的三部分卡片 ID 列表 */
export interface DeckData {
  main: number[];
  extra: number[];
  side: number[];
  fileName?: string; // 用于下载时的文件名
}
