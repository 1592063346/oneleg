// 把当前构筑填进官方比赛卡表 PDF（sources/deckform_blank.pdf）
//
// 这份表没有表单域（/AcroForm 是空的），所以不是“填字段”，而是在量好的坐标上盖字。
// 表格是等距网格（行高 15pt），下面的坐标全部实测自空白表，更换表格后需重新测量。
//
// 中日文卡名没有现成字体可用：表内自带的 CJK 字体是 9KB / 16KB 的子集，只含表上那几个字。
// 于是改为用 canvas 借系统字体把文字画成整页透明 PNG，再贴回 PDF，省掉往仓库塞字体文件。

import type { DeckData } from "../core/types.js";
import { TYPE, cacheCardInfos, cachedCardInfo } from "./cards.js";

/** 导出语言 */
export type DeckFormLang = "jp" | "sc";

/** 空白比赛卡表的位置 */
const FORM_URL = "./sources/deckform_blank.pdf";

/** 画布相对 PDF 的放大倍数：3 倍约合 216dpi，打印够用，再大只是徒增体积 */
const SCALE = 3;

/** 表格行高 */
const ROW_H = 15;
/** 主卡组三栏首行距页顶的距离 */
const MAIN_TOP = 161;
/** 额外/副卡组两栏首行距页顶的距离 */
const EXTRA_TOP = 503;
/** 卡名格左侧留白 */
const NAME_PAD = 3;
/** 全表统一的字号。写不下时只压窄字面，字号不变，故同一行内的字高始终一致 */
const FONT_SIZE = 9;

/** 一个格子的位置（top 为距页顶的距离，与实测值同一坐标系） */
interface Cell {
  x: number;
  w: number;
  top: number;
  h: number;
  align: "left" | "center";
}

/** 一栏的几何：数量小格 + 卡名长格 + 行数 */
interface Column {
  countX: number;
  countW: number;
  nameX: number;
  nameW: number;
  firstTop: number;
  rows: number;
}

// 以下坐标均实测自 sources/deckform_blank.pdf，单位 pt
const MONSTERS: Column = { countX: 20, countW: 22, nameX: 43, nameW: 162.09, firstTop: MAIN_TOP, rows: 20 };
const SPELLS: Column = { countX: 205.09, countW: 22, nameX: 228.09, nameW: 162.09, firstTop: MAIN_TOP, rows: 20 };
const TRAPS: Column = { countX: 390.18, countW: 22, nameX: 413.18, nameW: 162.1, firstTop: MAIN_TOP, rows: 20 };
const EXTRA: Column = { countX: 20, countW: 22, nameX: 43, nameW: 162.09, firstTop: EXTRA_TOP, rows: 15 };
const SIDE: Column = { countX: 205.09, countW: 22, nameX: 228.09, nameW: 162.09, firstTop: EXTRA_TOP, rows: 15 };

/** 各栏下方的合计格：只有数量小格，右侧长格印着 “<<< Total xxx Cards” */
const TOTAL_MONSTER: Cell = { x: 20, w: 22, top: MAIN_TOP + ROW_H * 20, h: ROW_H, align: "center" };
const TOTAL_SPELL: Cell = { x: 205.09, w: 22, top: MAIN_TOP + ROW_H * 20, h: ROW_H, align: "center" };
const TOTAL_TRAP: Cell = { x: 390.18, w: 22, top: MAIN_TOP + ROW_H * 20, h: ROW_H, align: "center" };
const TOTAL_EXTRA: Cell = { x: 20, w: 22, top: EXTRA_TOP + ROW_H * 15, h: ROW_H, align: "center" };
const TOTAL_SIDE: Cell = { x: 205.09, w: 22, top: EXTRA_TOP + ROW_H * 15, h: ROW_H, align: "center" };

/** 右下角 Main / Extra / Side Deck Total 三格 */
const DECK_TOTAL_H = 16;
const DECK_TOTAL_MAIN: Cell = { x: 412.18, w: 54.37, top: 512, h: DECK_TOTAL_H, align: "center" };
const DECK_TOTAL_EXTRA: Cell = { x: 466.55, w: 54.36, top: 512, h: DECK_TOTAL_H, align: "center" };
const DECK_TOTAL_SIDE: Cell = { x: 520.91, w: 54.37, top: 512, h: DECK_TOTAL_H, align: "center" };

/** 按导出语言挑字体栈：优先系统里对应语言的字体，没有就退到通用无衬线 */
const FONT_STACK: Record<DeckFormLang, string> = {
  jp: '"Yu Gothic", "MS Gothic", "Hiragino Kaku Gothic ProN", "Noto Sans CJK JP", sans-serif',
  sc: '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
};

/** 按导出语言取卡名；该语言没名字就退到另一种，两种都没有就用卡片密码 */
function cardName(id: number, lang: DeckFormLang): string {
  const info = cachedCardInfo(id);
  if (!info) return String(id);
  const primary = lang === "jp" ? info.jp_name : info.cn_name;
  const fallback = lang === "jp" ? info.cn_name : info.jp_name;
  return primary || fallback || String(id);
}

/** 构筑已排序，同一张卡必然相邻，直接并成“一行一张卡 + 数量” */
function groupById(ids: number[]): Array<{ id: number; count: number }> {
  const rows: Array<{ id: number; count: number }> = [];
  for (const id of ids) {
    const last = rows[rows.length - 1];
    if (last && last.id === id) last.count++;
    else rows.push({ id, count: 1 });
  }
  return rows;
}

/** 往画布的一个格子里写一行字：超出格宽时横向压窄字面，字高不变 */
function paint(ctx: CanvasRenderingContext2D, cell: Cell, text: string, font: string): void {
  if (!text) return;
  const maxW = (cell.w - NAME_PAD * 2) * SCALE;
  ctx.font = `${FONT_SIZE * SCALE}px ${font}`;
  const natural = ctx.measureText(text).width;

  ctx.textAlign = cell.align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#000";

  ctx.save();
  ctx.translate(
    (cell.align === "center" ? cell.x + cell.w / 2 : cell.x + NAME_PAD) * SCALE,
    (cell.top + cell.h / 2) * SCALE
  );
  // 压缩围绕锚点进行，故居中格压缩后仍居中
  if (natural > maxW) ctx.scale(maxW / natural, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** 填一栏：超出该栏行数的卡片直接丢弃（表格行数固定） */
function paintColumn(
  ctx: CanvasRenderingContext2D,
  col: Column,
  ids: number[],
  lang: DeckFormLang,
  font: string
): void {
  groupById(ids)
    .slice(0, col.rows)
    .forEach((row, i) => {
      const top = col.firstTop + ROW_H * i;
      const base = { top, h: ROW_H };
      paint(ctx, { ...base, x: col.countX, w: col.countW, align: "center" }, String(row.count), font);
      paint(ctx, { ...base, x: col.nameX, w: col.nameW, align: "left" }, cardName(row.id, lang), font);
    });
}

/** 把整个构筑画到画布上 */
function paintDeck(
  ctx: CanvasRenderingContext2D,
  deck: DeckData,
  lang: DeckFormLang
): void {
  const font = FONT_STACK[lang];

  // 主卡组按类型拆到三栏；取不到卡片信息的按怪兽处理（表上没有第四栏可放）
  const monsters: number[] = [];
  const spells: number[] = [];
  const traps: number[] = [];
  for (const id of deck.main) {
    const type = cachedCardInfo(id)?.type;
    if (type === undefined) monsters.push(id);
    else if (type & TYPE.spell) spells.push(id);
    else if (type & TYPE.trap) traps.push(id);
    else monsters.push(id);
  }

  paintColumn(ctx, MONSTERS, monsters, lang, font);
  paintColumn(ctx, SPELLS, spells, lang, font);
  paintColumn(ctx, TRAPS, traps, lang, font);
  paintColumn(ctx, EXTRA, deck.extra, lang, font);
  paintColumn(ctx, SIDE, deck.side, lang, font);

  const totals: Array<[Cell, number]> = [
    [TOTAL_MONSTER, monsters.length],
    [TOTAL_SPELL, spells.length],
    [TOTAL_TRAP, traps.length],
    [TOTAL_EXTRA, deck.extra.length],
    [TOTAL_SIDE, deck.side.length],
    [DECK_TOTAL_MAIN, deck.main.length],
    [DECK_TOTAL_EXTRA, deck.extra.length],
    [DECK_TOTAL_SIDE, deck.side.length],
  ];
  for (const [cell, count] of totals) paint(ctx, cell, String(count), font);
}

/** canvas -> PNG 字节 */
function toPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("画布导出图片失败"));
        return;
      }
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
    }, "image/png");
  });
}

function downloadPdf(bytes: Uint8Array, filename: string): void {
  // 拷一份紧凑的副本再交给 Blob：pdf-lib 返回的视图底层可能是 SharedArrayBuffer
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 生成填好的比赛卡表并下载 */
export async function exportDeckForm(deck: DeckData, lang: DeckFormLang): Promise<void> {
  // 卡名与类型都来自卡片信息缓存，缺的先补齐（正常情况下同步时已经查过）
  await cacheCardInfos([...deck.main, ...deck.extra, ...deck.side]);

  // 用到才加载：pdf-lib 体积远大于本站自身的脚本
  const { PDFDocument } = await import("pdf-lib");

  const res = await fetch(FORM_URL);
  if (!res.ok) throw new Error(`读取空白卡表失败（HTTP ${res.status}）`);
  const doc = await PDFDocument.load(await res.arrayBuffer());
  const page = doc.getPages()[0];
  const pageW = page.getWidth();
  const pageH = page.getHeight();

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(pageW * SCALE);
  canvas.height = Math.round(pageH * SCALE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器未能创建画布");

  paintDeck(ctx, deck, lang);

  const image = await doc.embedPng(await toPngBytes(canvas));
  // 画布与页面同样大小、同样朝向，直接铺满整页即可
  page.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });

  downloadPdf(await doc.save(), "deckform.pdf");
}

/**
 * 原样下载一张空白比赛卡表，供线下手写。
 * 不走 pdf-lib：文件本身就是最终形态，无需重新生成。
 */
export async function downloadBlankForm(): Promise<void> {
  const res = await fetch(FORM_URL);
  if (!res.ok) throw new Error(`读取空白卡表失败（HTTP ${res.status}）`);
  downloadPdf(new Uint8Array(await res.arrayBuffer()), "deckform_blank.pdf");
}
