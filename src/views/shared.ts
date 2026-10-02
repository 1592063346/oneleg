// 视图间共享的小工具

import type { MatchType } from "../core/types.js";

/** 比赛类型对应的颜色标识（用于徽章、标签、类型筛选） */
export function matchTypeColor(type: MatchType): string {
  return (
    {
      // 主站
      积分赛: "purple",
      娱乐赛: "green",
      王中王邀请赛: "orange",
      特殊规则赛: "brown",
      // 分站（国内赛事数据站）
      城市巡回赛: "blue",
      YCS: "purple",
      特别大会: "green",
      "WCQ 预选赛": "orange",
      WCQ: "red",
    }[type] || ""
  );
}

/**
 * 当前展开的下拉（构筑页的导出语言与禁限卡表、卡表页的选择卡表共用，同一时刻至多一个）。
 * 点击页面其他位置时收起；监听器只在模块加载时注册一次，
 * 避免每次重绘都往 document 上挂一个永不移除的监听。
 */
let openDropdownList: HTMLElement | null = null;

document.addEventListener("click", () => {
  if (!openDropdownList) return;
  openDropdownList.style.display = "none";
  openDropdownList = null;
});

/**
 * 通用下拉，结构沿用主站的“选择比赛”。
 * items 为候选（值 + 显示文字），onPick 在选中后回调。
 * renderExtra 返回的节点追加在名称之后（如禁卡表的“查看”），可省略。
 */
export function buildDropdown<T>(
  items: Array<{ value: T; label: string }>,
  current: T,
  onPick: (value: T) => void,
  renderExtra?: (item: { value: T; label: string }) => Node | null
): HTMLElement {
  const dropdown = document.createElement("div");
  dropdown.className = "match-dropdown";

  const btn = document.createElement("button");
  btn.className = "match-dropdown-btn";
  btn.type = "button";

  let selected = current;
  const setLabel = (): void => {
    const text = document.createElement("span");
    text.textContent = items.find((item) => item.value === selected)?.label ?? "";
    const arrow = document.createElement("span");
    arrow.className = "dropdown-arrow";
    arrow.textContent = "▼";
    btn.replaceChildren(text, arrow);
  };
  setLabel();

  const listWrap = document.createElement("div");
  listWrap.className = "match-dropdown-list";
  listWrap.style.display = "none";
  const list = document.createElement("ul");
  items.forEach((item) => {
    const li = document.createElement("li");
    if (item.value === selected) li.classList.add("active");
    const name = document.createElement("span");
    name.textContent = item.label;
    li.appendChild(name);
    const extra = renderExtra?.(item);
    if (extra) li.appendChild(extra);
    li.addEventListener("click", () => {
      selected = item.value;
      onPick(item.value);
      setLabel();
      items.forEach((each, i) =>
        list.children[i].classList.toggle("active", each.value === selected)
      );
      listWrap.style.display = "none";
      openDropdownList = null;
    });
    list.appendChild(li);
  });
  listWrap.appendChild(list);

  btn.addEventListener("click", (ev) => {
    ev.stopPropagation(); // 阻止冒泡到 document，否则会被“点击其他位置”的监听立即关闭
    const isOpen = listWrap.style.display === "block";
    if (openDropdownList && openDropdownList !== listWrap) openDropdownList.style.display = "none";
    listWrap.style.display = isOpen ? "none" : "block";
    openDropdownList = isOpen ? null : listWrap;
  });

  dropdown.append(btn, listWrap);
  return dropdown;
}
