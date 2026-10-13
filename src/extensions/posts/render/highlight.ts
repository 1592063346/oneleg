// 代码块的语法高亮。
// highlight.js 与它的语言包加起来不小，故本模块由 view 动态引入，且只在正文确实有代码块时引入。

import hljs from "highlight.js/lib/common";

export function highlightCodeBlocks(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("code").forEach((code) => {
    const lang = /language-([\w+#.-]+)/.exec(code.className)?.[1];
    // 语言包之外的语言按纯文本处理，不交给 highlight.js 去报错
    if (!lang || !hljs.getLanguage(lang)) return;
    hljs.highlightElement(code);
  });
}
