// “关于网站”视图

import { t, type MsgKey } from "../core/i18n.js";

/**
 * 问答条目，给出问与答的文案键。
 * 正文含内联链接，故整段以 HTML 片段存在 i18n.ts，这里只按段落套上标记。
 */
const FAQ_ITEMS: ReadonlyArray<readonly [MsgKey, MsgKey]> = [
  ["faq.q1", "faq.a1"],
  ["faq.q2", "faq.a2"],
  ["faq.q3", "faq.a3"],
  ["faq.q4", "faq.a4"],
];

/** 相关链接：地址固定，仅标签随语言变 */
const FAQ_LINKS: ReadonlyArray<readonly [string, MsgKey]> = [
  ["https://space.bilibili.com/3706978180270726/", "faq.link.oneleg"],
  ["https://space.bilibili.com/519200091/", "faq.link.ygo"],
  ["https://ygocdb.com/", "faq.link.ygocdb"],
];

export function buildFaqView(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "faq-view";

  wrap.appendChild(heading("FAQ"));

  FAQ_ITEMS.forEach(([question, answer]) => {
    const item = document.createElement("div");
    item.className = "faq-item";

    const qLine = document.createElement("p");
    const qStrong = document.createElement("strong");
    qStrong.textContent = t(question);
    qLine.appendChild(qStrong);

    const aLine = document.createElement("p");
    aLine.innerHTML = t(answer); // 正文含内联链接

    item.append(qLine, aLine);
    wrap.appendChild(item);
  });

  wrap.appendChild(heading(t("faq.links")));

  const list = document.createElement("ul");
  list.className = "faq-links";
  FAQ_LINKS.forEach(([href, label]) => {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = t(label);
    li.appendChild(link);
    list.appendChild(li);
  });
  wrap.appendChild(list);

  return wrap;
}

function heading(text: string): HTMLElement {
  const h = document.createElement("h3");
  h.textContent = text;
  return h;
}
