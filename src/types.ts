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
}

/** 比赛类型 */
export type MatchType = "娱乐赛" | "积分赛" | "王中王邀请赛";

/** 全部比赛类型（用于趋势模式的类型筛选） */
export const MATCH_TYPES: MatchType[] = ["娱乐赛", "积分赛", "王中王邀请赛"];

/** 一场比赛的记录 */
export interface Match {
  /** 比赛时间，形如 "2026-08-05" */
  date: string;
  /** 比赛标题 */
  title: string;
  /** 比赛类型 */
  type: MatchType;
  /** 冠军 */
  "1st": Player;
  /** 亚军 */
  "2nd": Player;
  /** 四强 */
  "3_4th": Player[];
  /** 该场比赛各卡组数量 */
  decks: DeckCount[];
}

/** data.json 的顶层结构 */
export interface DataFile {
  decks: Match[];
}
