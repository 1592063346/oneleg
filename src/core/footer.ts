// 页脚：左侧站点信息，右侧作者信息

import type { State, AppActions } from "./config.js";
import { sitePath } from "./config.js";
import { navigateToSite } from "./router.js";
import { LAST_UPDATED } from "./buildInfo.js";

/** 链接之间的分隔点。由 CSS 画成圆点，不写进文本内容，免得被复制或被读屏念出 */
const DOT = '<span class="footer-dot" aria-hidden="true"></span>';

export function buildFooter(state: State, actions: AppActions): HTMLElement {
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="footer-col">
      <p class="footer-line"><a class="footer-faq" href="${sitePath("faq")}">关于网站</a>${DOT}<a href="https://github.com/1592063346/oneleg">网站仓库</a></p>
      <p class="footer-line footer-updated"></p>
      <p class="footer-line">卡片数据支持：<a href="https://ygocdb.com/">百鸽</a></p>
    </div>
    <div class="footer-col footer-right">
      <p class="footer-line">Created by <strong>Imagine076</strong></p>
      <p class="footer-line"><a href="https://space.bilibili.com/353773164">BiliBili</a>${DOT}<a href="https://qm.qq.com/q/4VHZybgazK">QQ</a></p>
    </div>
  `;

  footer.querySelector<HTMLElement>(".footer-updated")!.textContent = `最后更新于 ${LAST_UPDATED}`;

  // “关于网站”指向本站的 /faq，故与站点菜单走同一条站内跳转路径；
  // 组合键或中键点击（新标签页打开等）仍交给浏览器默认行为
  footer.querySelector<HTMLAnchorElement>(".footer-faq")!.addEventListener("click", (ev) => {
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    navigateToSite("faq", state, actions);
  });

  return footer;
}
