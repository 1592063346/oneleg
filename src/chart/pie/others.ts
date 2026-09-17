// 饼图下方的 others 明细列表

import type { DeckCount } from "../../core/types.js";
import { escapeHtml } from "../../core/html.js";

export function buildOthersDetail(others: DeckCount[], othersSum: number): HTMLElement {
  const box = document.createElement("div");
  box.className = "others-detail";
  const h = document.createElement("h3");
  h.textContent = `others 详情（共 ${others.length} 种 / ${othersSum} 个卡组）`;
  box.appendChild(h);

  const list = document.createElement("ul");
  list.className = "others-list";
  for (const d of [...others].sort((a, b) => b.num - a.num || a.name.localeCompare(b.name))) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${escapeHtml(d.name)}</span><span class="others-num">${d.num}</span>`;
    list.appendChild(li);
  }
  box.appendChild(list);
  return box;
}
