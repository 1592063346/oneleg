// 上位卡组统计视图（趋势折线图 + 日期/类型筛选 + 卡组搜索）

import type { State } from "../config.js";
import { seriesColor } from "../palette.js";
import { renderLine } from "../line.js";
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

  // 卡组搜索添加
  const searchRow = document.createElement("div");
  searchRow.className = "controls deck-search";
  const sLabel = document.createElement("span");
  sLabel.className = "controls-label";
  sLabel.textContent = "添加卡组：";
  const input = document.createElement("input");
  input.type = "search";
  input.className = "deck-input";
  input.placeholder = "搜索卡组名并回车添加…";
  input.setAttribute("list", "deck-options");
  const datalist = document.createElement("datalist");
  datalist.id = "deck-options";
  state.trendDeckNames.forEach((n) => {
    const opt = document.createElement("option");
    opt.value = n;
    datalist.appendChild(opt);
  });

  const addDeck = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    if (!state.trendDeckNames.includes(name)) return; // 只接受已存在的上位卡组
    if (!state.selectedDecks.includes(name)) {
      state.selectedDecks.push(name);
      renderChips(chipRow, state, chartHost);
      renderTrendChart(state, chartHost);
    }
    input.value = "";
  };
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      addDeck(input.value);
    }
  });
  // 从 datalist 选中时（change）也直接添加
  input.addEventListener("change", () => {
    if (state.trendDeckNames.includes(input.value.trim())) addDeck(input.value);
  });

  // "查看全部上位卡组"按钮
  const showAllBtn = document.createElement("button");
  showAllBtn.className = "deck-action-btn";
  showAllBtn.textContent = "查看全部上位卡组";
  showAllBtn.addEventListener("click", () => {
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
    state.selectedDecks = [];
    renderChips(chipRow, state, chartHost);
    renderTrendChart(state, chartHost);
  });

  searchRow.append(sLabel, input, datalist, showAllBtn, clearDecksBtn);
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
