// 正文里的构筑块：语言标为 ydk 的代码块渲染为卡组构筑。
// 头栏沿用代码块（复制的是 ydk 原文），构筑的呈现与卡组预览弹窗一致。

import { cacheCardInfos } from "../../../domain/cards.js";
import { createDeckSection, dropAbsentCards, parseYdk } from "../../../domain/deck.js";
import { t } from "../../../core/i18n.js";
import { buildCodeHead } from "./code.js";

/** 卡图沿用日文版，与构筑导出页一致 */
const ENV = "ocg";

/** 把正文里的 ydk 代码块换成构筑。须在代码高亮与 decorateCodeBlocks 之前调用 */
export function renderDeckBlocks(root: HTMLElement): void {
  root.querySelectorAll("pre > code.language-ydk").forEach((code) => {
    const text = code.textContent ?? "";
    const deck = parseYdk(text);
    // 识别不出卡片的仍按普通代码块显示
    if (deck.main.length + deck.extra.length + deck.side.length === 0) return;

    const body = document.createElement("div");
    body.className = "ydk-deck";
    const note = document.createElement("div");
    note.className = "builder-note";
    note.textContent = t("common.loading");
    body.appendChild(note);

    const wrap = document.createElement("div");
    wrap.className = "code-block";
    wrap.append(buildCodeHead("ydk", text), body);
    code.parentElement!.replaceWith(wrap);

    // 与卡组预览弹窗相同：先补齐卡片信息（先行卡借此换到常规卡图），再剔除查不到的卡号
    void cacheCardInfos([...deck.main, ...deck.extra, ...deck.side]).then(() => {
      dropAbsentCards(deck);
      const sections: Array<[string, number[]]> = [
        [t("deck.main"), deck.main],
        [t("deck.extra"), deck.extra],
        [t("deck.side"), deck.side],
      ];
      body.replaceChildren(
        ...sections
          .filter(([, ids]) => ids.length > 0)
          .map(([name, ids]) => createDeckSection(name, ids, ENV))
      );
    });
  });
}
