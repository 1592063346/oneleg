// 正文里的代码块：左上角标出语言，右上角给一个复制入口。
// marked 只给出 <code class="language-xxx">，故标注与按钮都在渲染后补进 DOM。

import { copyText } from "../../../core/clipboard.js";
import { t } from "../../../core/i18n.js";

/** 给一段正文里的所有代码块加上头栏 */
export function decorateCodeBlocks(root: HTMLElement): void {
  root.querySelectorAll("pre").forEach((pre) => {
    const code = pre.querySelector("code");
    if (!code) return;

    // 未标语言的代码块（缩进式，或 ``` 后没写语言）只给复制入口
    const lang = /language-([\w+#.-]+)/.exec(code.className)?.[1];
    const wrap = document.createElement("div");
    wrap.className = "code-block";
    pre.replaceWith(wrap);
    wrap.append(buildCodeHead(lang, code.textContent ?? ""), pre);
  });
}

/** 头栏：语言标注（可省略）与复制按钮。构筑块与代码块共用 */
export function buildCodeHead(lang: string | undefined, text: string): HTMLElement {
  const head = document.createElement("div");
  head.className = "code-head";
  if (lang) {
    const label = document.createElement("span");
    label.className = "code-lang";
    label.textContent = lang;
    head.appendChild(label);
  }
  head.appendChild(buildCopyButton(text));
  return head;
}

function buildCopyButton(text: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "code-copy";
  btn.textContent = t("post.copyCode");

  let timer = 0;
  btn.addEventListener("click", async () => {
    if (!(await copyText(text))) {
      prompt(t("post.copyPrompt"), text);
      return;
    }
    window.clearTimeout(timer);
    btn.textContent = t("post.copied");
    timer = window.setTimeout(() => {
      btn.textContent = t("post.copyCode");
    }, 1500);
  });
  return btn;
}
