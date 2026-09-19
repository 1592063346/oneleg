// 页脚：左侧站点信息，右侧作者信息

/** 链接之间的分隔点。由 CSS 画成圆点，不写进文本内容，免得被复制或被读屏念出 */
const DOT = '<span class="footer-dot" aria-hidden="true"></span>';

export function buildFooter(): HTMLElement {
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="footer-col">
      <p class="footer-line"><a href="https://onelegocg.top/faq">关于网站</a>${DOT}<a href="https://github.com/1592063346/oneleg">网站仓库</a></p>
      <p class="footer-line">卡片数据支持：<a href="https://ygocdb.com/">百鸽</a></p>
    </div>
    <div class="footer-col footer-right">
      <p class="footer-line">Created by <strong>Imagine076</strong></p>
      <p class="footer-line"><a href="https://space.bilibili.com/353773164">BiliBili</a>${DOT}<a href="https://qm.qq.com/q/4VHZybgazK">QQ</a></p>
    </div>
  `;
  return footer;
}
