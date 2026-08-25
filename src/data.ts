import type { DataFile, Match } from "./types.js";

/** 从 data.json 加载数据（优先使用内联数据,回退到 fetch） */
export async function loadData(): Promise<Match[]> {
  // 检查是否有内联数据（打包后会挂载到 window.__DATA__）
  const inlined = (window as any).__DATA__;
  if (inlined) {
    const parsed = inlined as DataFile;
    if (parsed && Array.isArray(parsed.decks)) {
      return [...parsed.decks].sort((a, b) => a.date.localeCompare(b.date));
    }
  }

  // 回退到 fetch（开发模式）
  const res = await fetch("./data/data.json", { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`无法加载 data.json（HTTP ${res.status}）`);
  }
  const parsed = (await res.json()) as DataFile;
  if (!parsed || !Array.isArray(parsed.decks)) {
    throw new Error("data.json 格式不正确：缺少 decks 数组");
  }
  // 按日期升序排列，确保趋势图 x 轴按时间顺序
  return [...parsed.decks].sort((a, b) => a.date.localeCompare(b.date));
}

/** 收集所有比赛中四强使用的卡组名称（去重，按出现顺序稳定排序） */
export function allDeckNames(matches: Match[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const match of matches) {
    for (const deck of top4Decks(match)) {
      if (!seen.has(deck)) {
        seen.add(deck);
        names.push(deck);
      }
    }
  }
  return names;
}

/** 提取某场比赛四强使用的卡组名称（冠军、亚军、两位四强选手） */
export function top4Decks(match: Match): string[] {
  return [match["1st"].deck, match["2nd"].deck, ...match["3_4th"].map((p) => p.deck)];
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
