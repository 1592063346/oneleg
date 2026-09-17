// 上位卡组统计视图（趋势折线图 + 日期/类型筛选 + 卡组搜索）

import type { State } from "../core/config.js";
import { seriesColor } from "../core/palette.js";
import { renderLine } from "../chart/lineChart.js";
import { matchTypeColor } from "./shared.js";

export function buildTrendView(state: State): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "trend-view";

  // 日期区间筛选
  const dateRow = document.createElement("div");
  dateRow.className = "controls date-filter";
  const dateLabel = document.createElement("span");
  dateLabel.className = "controls-label";
  dateLabel.textContent = "比赛日期：";

  const startInput = document.createElement("input");
  startInput.type = "date";
  startInput.className = "date-input";
  if (state.dateRange) startInput.value = state.dateRange.start;

  const dateSep = document.createElement("span");
  dateSep.textContent = " 至 ";
  dateSep.className = "date-separator";

  const endInput = document.createElement("input");
  endInput.type = "date";
  endInput.className = "date-input";
  if (state.dateRange) endInput.value = state.dateRange.end;

  const clearBtn = document.createElement("button");
  clearBtn.className = "date-clear-btn";
  clearBtn.textContent = "清除";
  clearBtn.addEventListener("click", () => {
    state.dateRange = null;
    startInput.value = "";
    endInput.value = "";
    renderTrendChart(state, chartHost);
  });

  const updateDateRange = () => {
    const start = startInput.value;
    const end = endInput.value;
    if (start && end) {
      state.dateRange = { start, end };
    } else if (!start && !end) {
      state.dateRange = null;
    }
    renderTrendChart(state, chartHost);
  };

  startInput.addEventListener("change", updateDateRange);
  endInput.addEventListener("change", updateDateRange);

  dateRow.append(dateLabel, startInput, dateSep, endInput, clearBtn);
  wrap.appendChild(dateRow);

  // 类型筛选
  const typeRow = document.createElement("div");
  typeRow.className = "controls type-filter";
  const typeLabel = document.createElement("span");
  typeLabel.className = "controls-label";
  typeLabel.textContent = "比赛类型：";
  typeRow.appendChild(typeLabel);
  state.config.matchTypes.forEach((t) => {
    const chip = document.createElement("label");
    chip.className = `chip chip-type-${matchTypeColor(t)}`;
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = state.selectedTypes.has(t);
    cb.addEventListener("change", () => {
      if (cb.checked) state.selectedTypes.add(t);
      else state.selectedTypes.delete(t);
      renderTrendChart(state, chartHost);
    });
    const span = document.createElement("span");
    span.textContent = t;
    chip.append(cb, span);
    typeRow.appendChild(chip);
  });
  wrap.appendChild(typeRow);

  // 卡组搜索添加（自绘补全下拉）。
  // 不用原生 datalist 的原因：Chrome 里点击候选项只发 input 不发 change，
  // 选中后要等输入框失焦才会生效；且它的下拉箭头占位无法用 display:none 收起。
  const searchRow = document.createElement("div");
  searchRow.className = "controls deck-search";
  const sLabel = document.createElement("span");
  sLabel.className = "controls-label";
  sLabel.textContent = "添加卡组：";

  const picker = document.createElement("div");
  picker.className = "deck-picker";

  const input = document.createElement("input");
  input.type = "search"; // 保留原生清除按钮（×）
  input.className = "deck-input";
  input.placeholder = "搜索卡组名并添加…";
  input.autocomplete = "off";
  input.spellcheck = false;

  const suggestWrap = document.createElement("div");
  suggestWrap.className = "deck-suggest-list";
  suggestWrap.style.display = "none";
  const suggestList = document.createElement("ul");
  suggestWrap.appendChild(suggestList);

  let options: string[] = []; // 当前候选：未添加的上位卡组，按输入过滤后
  let activeIndex = -1; // 键盘高亮的候选下标
  let itemEls: HTMLElement[] = []; // 与 options 一一对应的候选项元素

  const closeSuggest = () => {
    suggestWrap.style.display = "none";
    activeIndex = -1;
  };

  /** 添加卡组、收起下拉，并主动把焦点交出去（不让输入框留在激活态） */
  const commit = (name: string) => {
    if (!state.selectedDecks.includes(name)) {
      state.selectedDecks.push(name);
      renderChips(chipRow, state, chartHost);
      renderTrendChart(state, chartHost);
    }
    input.value = "";
    closeSuggest();
    input.blur();
  };

  /** 高亮第 i 项，并把列表滚到该项可见（只滚列表自身，不牵动页面滚动） */
  const setActive = (i: number) => {
    activeIndex = i;
    itemEls.forEach((el, k) => el.classList.toggle("active", k === i));
    const el = itemEls[i];
    if (!el) return;
    const top = suggestWrap.scrollTop;
    const bottom = top + suggestWrap.clientHeight;
    if (el.offsetTop < top) {
      suggestWrap.scrollTop = el.offsetTop;
    } else if (el.offsetTop + el.offsetHeight > bottom) {
      suggestWrap.scrollTop = el.offsetTop + el.offsetHeight - suggestWrap.clientHeight;
    }
  };

  /** 只在候选变化时重建列表；仅切换高亮不走这里，以便保住滚动位置 */
  const renderSuggest = () => {
    suggestList.innerHTML = "";
    itemEls = [];
    if (options.length === 0) {
      const empty = document.createElement("li");
      empty.className = "deck-suggest-empty";
      empty.textContent = input.value.trim() ? "无匹配的卡组名" : "已添加全部上位卡组";
      suggestList.appendChild(empty);
      return;
    }
    options.forEach((name) => {
      const li = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = seriesColor(state.colorMap.get(name) ?? 0);
      const label = document.createElement("span");
      label.textContent = name;
      li.append(swatch, label);
      li.addEventListener("click", () => commit(name));
      itemEls.push(li);
      suggestList.appendChild(li);
    });
  };

  /** 重新计算候选并展开下拉；resetActive 为 true 时把高亮重置到第一项 */
  const openSuggest = (resetActive: boolean) => {
    const q = input.value.trim().toLowerCase();
    options = state.trendDeckNames
      .filter((n) => !state.selectedDecks.includes(n))
      .filter((n) => !q || n.toLowerCase().includes(q));
    const next = resetActive
      ? options.length > 0
        ? 0
        : -1
      : Math.min(activeIndex, options.length - 1);
    renderSuggest();
    suggestWrap.style.display = "block"; // 先展开：setActive 要读 clientHeight
    setActive(next);
  };

  input.addEventListener("input", () => openSuggest(true));
  input.addEventListener("focus", () => openSuggest(true));
  input.addEventListener("blur", () => closeSuggest());
  // 下拉被 Esc 收起、但输入框仍聚焦时，再点它不会触发 focus，这里补上
  input.addEventListener("click", () => {
    if (suggestWrap.style.display === "none") openSuggest(true);
  });
  // 拦下 mousedown，否则输入框会先失焦、候选项的 click 就落空了
  suggestWrap.addEventListener("mousedown", (ev) => ev.preventDefault());

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      if (options.length === 0 || suggestWrap.style.display === "none") return;
      ev.preventDefault();
      const delta = ev.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + delta + options.length) % options.length);
      return;
    }
    if (ev.key === "Enter") {
      ev.preventDefault();
      if (suggestWrap.style.display === "none") openSuggest(true);
      if (activeIndex >= 0 && options[activeIndex]) commit(options[activeIndex]);
      return;
    }
    if (ev.key === "Escape") closeSuggest();
  });

  picker.append(input, suggestWrap);

  // "查看全部上位卡组"按钮
  const showAllBtn = document.createElement("button");
  showAllBtn.className = "deck-action-btn";
  showAllBtn.textContent = "查看全部上位卡组";
  showAllBtn.addEventListener("click", () => {
    closeSuggest();
    input.value = "";
    // 清空当前已展示卡组
    state.selectedDecks = [];

    // 获取当前筛选条件下的所有比赛
    let matches = state.matches.filter((m) => state.selectedTypes.has(m.type));
    if (state.dateRange) {
      const { start, end } = state.dateRange;
      const startFormatted = start.replace(/-/g, "/");
      const endFormatted = end.replace(/-/g, "/");
      matches = matches.filter((m) => m.date >= startFormatted && m.date <= endFormatted);
    }

    // 收集所有上位卡组（去重）
    const allDecks = new Set<string>();
    matches.forEach((m) => {
      allDecks.add(m["1st"].deck);
      if (m["2nd"]) allDecks.add(m["2nd"].deck);
      if (m["3_4th"]) m["3_4th"].forEach((p) => allDecks.add(p.deck));
    });

    // 添加到已展示卡组（按字母顺序）
    state.selectedDecks = Array.from(allDecks).sort();
    renderChips(chipRow, state, chartHost);
    renderTrendChart(state, chartHost);
  });

  // "清空卡组"按钮
  const clearDecksBtn = document.createElement("button");
  clearDecksBtn.className = "deck-action-btn deck-action-clear";
  clearDecksBtn.textContent = "清空卡组";
  clearDecksBtn.addEventListener("click", () => {
    closeSuggest();
    state.selectedDecks = [];
    renderChips(chipRow, state, chartHost);
    renderTrendChart(state, chartHost);
  });

  searchRow.append(sLabel, picker, showAllBtn, clearDecksBtn);
  wrap.appendChild(searchRow);

  const chartHost = document.createElement("div");
  chartHost.className = "chart-host";

  // 已添加卡组标签
  const chipRow = document.createElement("div");
  chipRow.className = "selected-chips";
  renderChips(chipRow, state, chartHost);
  wrap.appendChild(chipRow);

  wrap.appendChild(chartHost);
  renderTrendChart(state, chartHost);

  return wrap;
}

function renderChips(host: HTMLElement, state: State, chartHost: HTMLElement): void {
  host.innerHTML = "";
  if (state.selectedDecks.length === 0) return;
  state.selectedDecks.forEach((name) => {
    const chip = document.createElement("span");
    chip.className = "picked-chip";
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = seriesColor(state.colorMap.get(name) ?? 0);
    const label = document.createElement("span");
    label.textContent = name;
    const rm = document.createElement("button");
    rm.className = "chip-remove";
    rm.setAttribute("aria-label", `移除 ${name}`);
    rm.textContent = "×";
    rm.addEventListener("click", () => {
      state.selectedDecks = state.selectedDecks.filter((n) => n !== name);
      renderChips(host, state, chartHost);
      renderTrendChart(state, chartHost);
    });
    chip.append(swatch, label, rm);
    host.appendChild(chip);
  });
}

function renderTrendChart(state: State, host: HTMLElement): void {
  host.innerHTML = "";
  let matches = state.matches.filter((m) => state.selectedTypes.has(m.type));

  // 应用日期区间筛选
  if (state.dateRange) {
    const { start, end } = state.dateRange;
    // 将输入的日期格式（YYYY-MM-DD）转换为斜杠格式（YYYY/MM/DD）以匹配数据
    const startFormatted = start.replace(/-/g, "/");
    const endFormatted = end.replace(/-/g, "/");
    matches = matches.filter((m) => m.date >= startFormatted && m.date <= endFormatted);
  }

  host.appendChild(renderLine(matches, state.selectedDecks, state.colorMap));
}
