// 正文里的单卡条目块：@[卡片关键字](说明文字)。
// 关键字交给卡片检索取第一张卡，呈现同构筑导出页的检索结果条目；说明文字按 markdown 渲染于其下。
// marked 只产出占位的框与说明文字，卡片在渲染后检索并补进 DOM。

import type { TokenizerAndRendererExtension } from "marked";
import { escapeHtml } from "../../../core/html.js";
import { t } from "../../../core/i18n.js";
import { searchCards, type CardInfo } from "../../../domain/cards.js";
import { buildCardBrief } from "../../../views/shared.js";

/** 检索结果按关键字缓存：站内翻页与主题切换都会重绘正文，不必重复请求 */
const hits = new Map<string, Promise<CardInfo | null>>();

/** 注册只做一次（marked 为全局单例），重复渲染复用同一个 promise */
let ready: Promise<void> | null = null;

/** 让 marked 认单卡条目块 */
export function configureCardEntry(): Promise<void> {
  if (!ready) {
    ready = import("marked").then(({ marked }) => {
      marked.use({ extensions: [cardEntry] });
    });
  }
  return ready;
}

/**
 * 块级语法，须独占一行起头。说明文字允许跨行，也允许含括号（如内嵌链接），
 * 故按括号配对找结尾，反斜杠转义的括号不计。
 */
const cardEntry: TokenizerAndRendererExtension = {
  name: "cardEntry",
  level: "block",
  start(src) {
    const index = src.search(/^@\[/m);
    return index < 0 ? undefined : index;
  },
  tokenizer(src) {
    const head = /^@\[([^\]\n]+)\]\(/.exec(src);
    if (!head) return undefined;
    const end = closingParen(src, head[0].length);
    if (end < 0) return undefined;
    const tail = /^[ \t]*(?:\n+|$)/.exec(src.slice(end + 1));
    if (!tail) return undefined;
    const text = src.slice(head[0].length, end).trim();
    return {
      type: "cardEntry",
      raw: src.slice(0, end + 1) + tail[0],
      keyword: head[1].trim(),
      tokens: this.lexer.blockTokens(text, []),
    };
  },
  renderer(token) {
    const text = this.parser.parse(token.tokens ?? []);
    return (
      `<div class="card-entry" data-keyword="${escapeHtml(String(token.keyword))}">` +
      `<div class="card-entry-text">${text}</div></div>\n`
    );
  },
};

/** 从左括号之后的 from 起找与之配对的右括号，找不到返回 -1 */
function closingParen(src: string, from: number): number {
  let depth = 1;
  for (let i = from; i < src.length; i++) {
    const ch = src[i];
    if (ch === "\\") i++;
    else if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return i;
  }
  return -1;
}

/** 为正文里的单卡条目块检索卡片并填入 */
export function renderCardEntries(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(".card-entry").forEach((box) => {
    const keyword = box.dataset.keyword ?? "";
    const slot = document.createElement("div");
    slot.className = "card-entry-card";
    slot.textContent = t("common.loading");
    box.prepend(slot);

    findCard(keyword).then(
      (hit) => {
        if (!hit) {
          slot.textContent = t("post.cardNotFound", { keyword });
          return;
        }
        // 卡名一律取中文名，不随界面语言切换
        slot.replaceChildren(...buildCardBrief(hit, hit.cn_name));
      },
      (err: unknown) => {
        slot.textContent = t("post.cardFailed", {
          msg: err instanceof Error ? err.message : String(err),
        });
      }
    );
  });
}

/** 取检索结果的第一张卡；没有结果为 null。失败不缓存，下次重绘可重试 */
function findCard(keyword: string): Promise<CardInfo | null> {
  let pending = hits.get(keyword);
  if (!pending) {
    pending = searchCards(keyword).then((list) => list[0] ?? null);
    pending.catch(() => hits.delete(keyword));
    hits.set(keyword, pending);
  }
  return pending;
}
