import type { DataFile, Match, MatchType } from "./types.js";

/** 从指定数据文件加载数据 */
export async function loadData(path: string = "./data/data.json"): Promise<Match[]> {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`无法加载数据文件 ${path}（HTTP ${res.status}）`);
  }
  const parsed = (await res.json()) as DataFile;
  if (!parsed || !Array.isArray(parsed.decks)) {
    throw new Error("数据文件格式不正确：缺少 decks 数组");
  }
  // 按日期升序排列，确保趋势图 x 轴按时间顺序
  return [...parsed.decks].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 收集所有比赛中四强使用的卡组名称（去重，按出现顺序稳定排序）。
 * 用于上位卡组统计的趋势图。
 * @param matches 比赛列表
 * @param allowedTypes 可选，允许的比赛类型列表。如果提供，只收集这些类型的比赛。
 */
export function top4DeckNames(matches: Match[], allowedTypes?: MatchType[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const match of matches) {
    // 如果提供了类型过滤，跳过不在列表中的比赛
    if (allowedTypes && !allowedTypes.includes(match.type)) continue;
    for (const deck of top4Decks(match)) {
      if (!seen.has(deck)) {
        seen.add(deck);
        names.push(deck);
      }
    }
  }
  return names;
}

/**
 * 收集所有比赛中出现过的卡组名称（去重，稳定顺序），用于建立"名称 -> 颜色"映射。
 * 四强卡组优先排在前面，使主要卡组获得靠前、区分度高的颜色槽；
 * 其余环境卡组（含淘汰赛卡组）随后加入，确保饼图每个卡组都有独立颜色。
 */
export function allDeckNames(matches: Match[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  const add = (name: string) => {
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  };
  for (const match of matches) {
    for (const deck of top4Decks(match)) add(deck);
  }
  for (const match of matches) {
    for (const d of match.decks) add(d.name);
    for (const d of match.elimination_decks ?? []) add(d.name);
  }
  return names;
}

/** 提取某场比赛四强使用的卡组名称（冠军、亚军、两位四强选手） */
export function top4Decks(match: Match): string[] {
  const decks = [match["1st"].deck];
  if (match["2nd"]) decks.push(match["2nd"].deck);
  if (match["3_4th"]) decks.push(...match["3_4th"].map((p) => p.deck));
  return decks;
}

/** 某卡组在某场比赛四强中出现的次数 */
export function deckCountIn(match: Match, name: string): number {
  return top4Decks(match).filter((d) => d === name).length;
}

/** 某场比赛的卡组总数 */
export function totalDecks(match: Match): number {
  if (match.deck_num) {
    return match.deck_num;
  }
  return match.decks.reduce((sum, d) => sum + d.num, 0);
}
