// 构筑 ⇄ URL 参数的编解码：把主/额外/副三个区的卡片 id 压成一个 URL 安全字符串

import type { DeckData } from "../core/types.js";
import { DECK_LIMITS } from "./deck.js";

/** 编码格式版本，写在首字节，便于日后换格式时区分 */
const VERSION = 1;
/** 卡号范围，与 parseYdk 一致 */
const MIN_ID = 1;
const MAX_ID = 99999999;

/**
 * 构筑 -> 字符串。
 * 字节布局为 [版本, 主卡组张数, 额外卡组张数, 各区的 id 增量...]，
 * 区内先升序，故增量非负、同名卡增量为 0，varint 大多只占 1-2 字节。
 * 副卡组张数由剩余字节数推出，最后再 base64url 去掉 padding，
 * 结果不含 + / 与 =，放进查询参数无须转义。
 */
export function encodeDeck(deck: DeckData): string {
  const main = sortIds(deck.main);
  const extra = sortIds(deck.extra);
  const side = sortIds(deck.side);

  const bytes = [VERSION, main.length, extra.length];
  for (const section of [main, extra, side]) {
    let prev = 0;
    for (const id of section) {
      writeVarint(bytes, id - prev);
      prev = id;
    }
  }
  return toBase64Url(Uint8Array.from(bytes));
}

/** 字符串 -> 构筑；版本、内容或长度有任何不对即返回 null */
export function decodeDeck(code: string): DeckData | null {
  const bytes = fromBase64Url(code);
  if (!bytes || bytes.length < 3 || bytes[0] !== VERSION) return null;
  if (bytes[1] > DECK_LIMITS.main || bytes[2] > DECK_LIMITS.extra) return null;

  const cur = { i: 3 }; // 读到哪里了
  const main = readSection(bytes, cur, bytes[1]);
  const extra = readSection(bytes, cur, bytes[2]);
  const side = readSection(bytes, cur, -1); // 读到字节用完
  if (!main || !extra || !side || side.length > DECK_LIMITS.side) return null;

  return { main, extra, side, fileName: "deck" };
}

/** 升序排列，并滤掉越界卡号，保证编出来的串一定能被解回来 */
function sortIds(ids: number[]): number[] {
  return ids.filter((id) => id >= MIN_ID && id <= MAX_ID).sort((a, b) => a - b);
}

function writeVarint(out: number[], value: number): void {
  let rest = value;
  while (rest >= 0x80) {
    out.push((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  out.push(rest);
}

/** 读一区。count 为 -1 表示一直读到字节用完（副卡组） */
function readSection(
  bytes: Uint8Array,
  cur: { i: number },
  count: number
): number[] | null {
  const ids: number[] = [];
  let prev = 0;
  for (let n = 0; count < 0 ? cur.i < bytes.length : n < count; n++) {
    const delta = readVarint(bytes, cur);
    if (delta === null) return null;
    const id = prev + delta; // 增量非负，故 id 单调不减
    if (id < MIN_ID || id > MAX_ID) return null;
    ids.push(id);
    prev = id;
  }
  return ids;
}

/** 读一个 varint；字节不够或长过 5 字节则返回 null */
function readVarint(bytes: Uint8Array, cur: { i: number }): number | null {
  let value = 0;
  let weight = 1;
  for (let n = 0; n < 5; n++) {
    if (cur.i >= bytes.length) return null;
    const byte = bytes[cur.i++];
    value += (byte & 0x7f) * weight;
    if ((byte & 0x80) === 0) return value;
    weight *= 128;
  }
  return null;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** atob 对非法长度会抛错，正好当作一层校验 */
function fromBase64Url(code: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(code)) return null;
  try {
    const binary = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}
