// 数学公式：$...$ 行内，$$...$$ 独立成块，均交给 KaTeX 排版。
//
// KaTeX 的代码、样式与字体加起来不小，故本模块由 view 动态引入，且只在文章确实写了 $ 时引入；
// 样式与字体在构建时由 scripts/katex.mjs 从 node_modules 拷进 dist/，不依赖外部站点。

import katex from "katex";
import type { TokenizerAndRendererExtension } from "marked";

/** 样式表地址。站内资源以站点根为基准，见 index.html 的 base */
const CSS_URL = "./dist/katex.css";

/** 注册与样式注入只做一次，重复渲染复用同一个 promise */
let ready: Promise<void> | null = null;

/** 让 marked 认公式。首次调用才注入样式 */
export function configureMarked(): Promise<void> {
  if (!ready) ready = init();
  return ready;
}

async function init(): Promise<void> {
  const { marked } = await import("marked");
  marked.use({ extensions: [blockMath, inlineMath] });
  await injectCss();
}

/** 独立成块的公式，整行给出，不裹进段落 */
const blockMath: TokenizerAndRendererExtension = {
  name: "blockMath",
  level: "block",
  start(src) {
    return src.indexOf("$$");
  },
  tokenizer(src) {
    const match = /^\$\$([\s\S]+?)\$\$[ \t]*(?:\n+|$)/.exec(src);
    if (!match) return undefined;
    return { type: "blockMath", raw: match[0], text: match[1].trim() };
  },
  renderer(token) {
    return renderMath(String(token.text), true);
  },
};

/**
 * 行内公式。行内的 $$...$$ 也在这里兜住：段落中间写的行间公式不该只当成普通文字，
 * 故先试行间再试行内，两者都不成则交回 marked 按普通文字处理。
 */
const inlineMath: TokenizerAndRendererExtension = {
  name: "inlineMath",
  level: "inline",
  start(src) {
    return src.indexOf("$");
  },
  tokenizer(src) {
    const display = /^\$\$([\s\S]+?)\$\$/.exec(src);
    if (display) {
      return { type: "inlineMath", raw: display[0], text: display[1].trim(), displayMode: true };
    }
    // 反斜杠转义的 \$ 不算定界符，故正文里的美元符号写成 \$ 即可
    const inline = /^\$(?!\$)((?:\\.|[^\\$\n])+?)\$/.exec(src);
    if (!inline) return undefined;
    return { type: "inlineMath", raw: inline[0], text: inline[1] };
  },
  renderer(token) {
    return renderMath(String(token.text), token.displayMode === true);
  },
};

function renderMath(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, { displayMode, throwOnError: false });
}

let css: Promise<void> | null = null;

function injectCss(): Promise<void> {
  if (!css) {
    css = new Promise<void>((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = CSS_URL;
      link.addEventListener("load", () => resolve());
      link.addEventListener("error", () => resolve());
      document.head.appendChild(link);
    });
  }
  return css;
}
