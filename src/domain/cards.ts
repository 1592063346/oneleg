// 卡片检索与卡片信息缓存：调用百鸽（ygocdb）的公开接口
// 该接口带 Access-Control-Allow-Origin: *，可直接在浏览器中跨域访问

const API = "https://ygocdb.com/api/v0/";

/** 卡片类型位（与 ygocdb / ydk 数据中的取值一致） */
export const TYPE = {
  monster: 0x1,
  spell: 0x2,
  trap: 0x4,
  fusion: 0x40,
  synchro: 0x2000,
  /** 装备魔法 */
  equip: 0x40000,
  quickPlay: 0x10000,
  continuous: 0x20000,
  field: 0x80000,
  /** 反击陷阱 */
  counter: 0x100000,
  xyz: 0x800000,
  link: 0x4000000,
} as const;

/** 额外卡组卡片（融合/同调/超量/连接）对应的类型位 */
const EXTRA_DECK_BITS = TYPE.fusion | TYPE.synchro | TYPE.xyz | TYPE.link;

/** 展示与排序所需的卡片信息 */
export interface CardInfo {
  id: number; // 卡片密码（ydk 中记录的即是此值）
  cn_name: string; // 中文名，已按官方简中优先挑过（见 pickCnName）
  jp_name: string;
  type: number; // 卡片类型位掩码
  level: number; // 星级/阶级（魔法·陷阱为 0）
}

/** 判断卡片是否只能放进额外卡组 */
export function isExtraDeckCard(card: CardInfo): boolean {
  return (card.type & EXTRA_DECK_BITS) !== 0;
}

interface RawData {
  type?: number;
  level?: number;
}

/** 检索结果的条目：类型信息嵌在 data 里，名字在顶层 */
interface RawSearchHit {
  id?: number;
  /** 官方简体中文译名 */
  sc_name?: string;
  /** 常见中文译名（非官方） */
  cn_name?: string;
  name?: string;
  jp_name?: string;
  data?: RawData;
}

/** 批量查询 cardset 的返回：以卡片密码为键，类型信息在 data 里，名字在 text 里 */
interface RawCard {
  id?: number;
  data?: RawData;
  text?: {
    /** 官方简体中文译名 */
    sc_name?: string;
    cn_name?: string;
    name?: string;
    jp_name?: string;
  };
}

/**
 * 卡片信息缓存：同一次会话内不重复查询，视图重绘也不会丢。
 * ydk 里只有卡片密码，排序所需的类型与星级都得靠它补齐。
 */
const cache = new Map<number, CardInfo>();

/** 读取已缓存的卡片信息 */
export function cachedCardInfo(id: number): CardInfo | undefined {
  return cache.get(id);
}

/** 批量查询单次请求携带的卡片数量上限 */
const BATCH_SIZE = 100;

/**
 * 确认过查不到的 ID（接口对不存在的 ID 直接不返回）。
 * 记下来是为了避免每次构筑变动都拿同一批查不到的卡去重试。
 */
const absent = new Set<number>();

/**
 * 异画 id -> 原画 id。同一张卡的不同插画在接口里各有各的 id，
 * 但都指向同一个原画 id，构筑中一律只保留原画 id。
 */
const aliases = new Map<number, number>();

/** 把异画 id 换回原画 id；无对应关系（含尚未查询过）时原样返回 */
export function originalCardId(id: number): number {
  return aliases.get(id) ?? id;
}

/** 该卡号是否已确认查不到，即数据库里没有这张卡 */
export function absentCard(id: number): boolean {
  return absent.has(id);
}

/** 联网补齐缓存中缺失的卡片信息，返回新取到的张数 */
export async function cacheCardInfos(ids: number[]): Promise<number> {
  const wanted = [...new Set(ids)].filter((id) => !cache.has(id) && !absent.has(id));
  let added = 0;

  for (let i = 0; i < wanted.length; i += BATCH_SIZE) {
    const batch = wanted.slice(i, i + BATCH_SIZE);
    const found = await fetchCards(batch);
    if (!found) return added; // 这一批没成功，剩下的留到下次变动再补

    const got = new Set<number>();
    for (const [requested, info] of found) {
      cache.set(info.id, info);
      if (info.id !== requested) aliases.set(requested, info.id);
      got.add(requested);
      added++;
    }
    for (const id of batch) {
      if (!got.has(id)) absent.add(id);
    }
  }
  return added;
}

/**
 * 一次取回一批卡片，返回“请求的 id -> 卡片信息”。
 * 接口以请求的 id 作键，而异画的请求 id 与其返回的 id 并不相同，
 * 故不能拿返回的 id 当键，否则对应关系就丢了。
 * 请求失败时返回 null（与“这一批都查不到”区分开）。
 */
async function fetchCards(ids: number[]): Promise<Map<number, CardInfo> | null> {
  try {
    const res = await fetch(`${API}cardset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, RawCard>;
    const found = new Map<number, CardInfo>();
    for (const [key, raw] of Object.entries(data)) {
      const requested = Number(key);
      if (!Number.isFinite(requested) || typeof raw.id !== "number") continue;
      found.set(requested, toCardInfo(raw));
    }
    return found;
  } catch {
    return null;
  }
}

/**
 * 取中文名：按“官方简中译名 > 常见译名”的顺序取第一个非空的。
 * 官方简中的字段名统一是 sc_name；后面几个都是常见译名，
 * 叫法不一只是两个接口的字段名没对齐（检索接口叫 cn_name，cardset 叫 name）。
 */
function pickCnName(...candidates: Array<string | undefined>): string {
  for (const name of candidates) {
    if (name) return name;
  }
  return "";
}

/** 接口返回的原始条目 -> 展示与排序所需的卡片信息 */
function toCardInfo(raw: RawCard): CardInfo {
  return {
    id: raw.id ?? 0,
    cn_name: pickCnName(raw.text?.sc_name, raw.text?.cn_name, raw.text?.name),
    jp_name: raw.text?.jp_name ?? "",
    type: raw.data?.type ?? 0,
    level: raw.data?.level ?? 0,
  };
}

/** 按关键词检索卡片，支持中文名/日文名/英文名/卡号 */
export async function searchCards(query: string): Promise<CardInfo[]> {
  const res = await fetch(`${API}?search=${encodeURIComponent(query)}`);
  if (!res.ok) {
    throw new Error(`检索接口返回 HTTP ${res.status}`);
  }
  const data = (await res.json()) as { result?: RawSearchHit[] };
  const hits = Array.isArray(data.result) ? data.result : [];

  return hits.map((h) => {
    const info: CardInfo = {
      id: h.id ?? 0,
      cn_name: pickCnName(h.sc_name, h.cn_name, h.name),
      jp_name: h.jp_name ?? "",
      type: h.data?.type ?? 0,
      level: h.data?.level ?? 0,
    };
    cache.set(info.id, info); // 一并写入缓存，排序时即可命中
    absent.delete(info.id);
    return info;
  });
}
