// 共享的悬浮提示层（单例）

let tip: HTMLDivElement | null = null;

function ensure(): HTMLDivElement {
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "viz-tooltip";
    tip.setAttribute("role", "status");
    tip.style.display = "none";
    document.body.appendChild(tip);
  }
  return tip;
}

/** 显示提示，内容为 HTML，位置跟随鼠标 */
export function showTooltip(html: string, clientX: number, clientY: number): void {
  const t = ensure();
  t.innerHTML = html;
  t.style.display = "block";
  const pad = 14;
  const rect = t.getBoundingClientRect();
  let x = clientX + pad;
  let y = clientY + pad;
  if (x + rect.width > window.innerWidth) x = clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight) y = clientY - rect.height - pad;
  t.style.left = `${Math.max(4, x)}px`;
  t.style.top = `${Math.max(4, y)}px`;
}

/** 隐藏提示 */
export function hideTooltip(): void {
  if (tip) tip.style.display = "none";
}
