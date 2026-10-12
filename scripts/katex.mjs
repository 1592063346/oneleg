// 把 KaTeX 的样式与字体从 node_modules 拷进 dist/，供文章里的公式使用。
// 由 npm run build / watch 调用，不必手动执行。
// 代码侧只在文章确实写了公式时才注入这份样式（见 src/posts/render/math.ts）。

import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = (rel) => fileURLToPath(new URL("../node_modules/katex/dist/" + rel, import.meta.url));
const out = (rel) => fileURLToPath(new URL("../dist/" + rel, import.meta.url));

/** 只带 woff2：浏览器认 woff2 就不会再取后面的回退，故把 CSS 里对应的 woff/ttf 一并去掉 */
const css = readFileSync(src("katex.min.css"), "utf8").replace(
  /,url\(fonts\/[^)]+\.woff\) format\("woff"\),url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g,
  ""
);
writeFileSync(out("katex.css"), css, "utf8");

mkdirSync(out("fonts"), { recursive: true });
let fonts = 0;
for (const name of readdirSync(src("fonts"))) {
  if (!name.endsWith(".woff2")) continue;
  copyFileSync(src("fonts/" + name), out("fonts/" + name));
  fonts += 1;
}

console.log(`dist/katex.css, dist/fonts/ <- katex, ${fonts} fonts`);
