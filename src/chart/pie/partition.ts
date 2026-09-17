// 饼图的扇区划分：决定哪些卡组单独成块，哪些合并进 others

import type { DeckCount } from "../../core/types.js";

// 占比低于该值的卡组也归入 others（饼块太小无法展示卡图）
const MIN_SLICE_PCT = 0.025;

/** 一个饼块 */
export interface Slice {
  name: string;
  num: number;
  pct: number;
  start: number;
  end: number;
  color: string;
  isOthers: boolean;
  subdecks?: Array<{ deck: string; num: number }>;
}

export interface Partition {
  /** 单独展示的卡组 */
  shown: DeckCount[];
  /** 归入 others 的卡组 */
  others: DeckCount[];
}

/**
 * 按数量从多到少分层统计：逐个"数量档位"尝试加入，
 * 若加入某档位后累计已 > 总数的 75%，则该档位及之后全部归入 others。
 * 若这样会导致无法展示任何具体卡组，则不做 others 划分（全部展示）。
 */
export function partitionDecks(decks: DeckCount[]): Partition {
  const total = decks.reduce((s, d) => s + d.num, 0);
  const sorted = [...decks].sort((a, b) => b.num - a.num);
  const threshold = (.75) * total;

  // 按数量分组为档位（数量降序）
  const tiers: DeckCount[][] = [];
  for (const d of sorted) {
    const last = tiers[tiers.length - 1];
    if (last && last[0].num === d.num) last.push(d);
    else tiers.push([d]);
  }

  const shown: DeckCount[] = [];
  let acc = 0;
  let cutAt = tiers.length; // 从该档位起归入 others
  for (let t = 0; t < tiers.length; t++) {
    const tierSum = tiers[t].reduce((s, d) => s + d.num, 0);
    if (tierSum / total < MIN_SLICE_PCT || acc + tierSum > threshold) {
      cutAt = t;
      break;
    }
    shown.push(...tiers[t]);
    acc += tierSum;
  }

  const others = tiers.slice(cutAt).flat();

  // 无法展示任何具体卡组时，不做 others 划分
  if (shown.length === 0) {
    return { shown: sorted, others: [] };
  }
  return { shown, others };
}
