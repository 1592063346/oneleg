import type { Match, MatchType, Player } from "./types.js";
import { MATCH_TYPES, EVENT_MATCH_TYPES } from "./types.js";
import { allDeckNames, loadData, totalDecks } from "./data.js";
import { buildColorMap, seriesColor } from "./palette.js";
import { renderPie } from "./pie.js";
import { renderLine } from "./line.js";
import { createExportButton } from "./export.js";
import { loadDeckFile, createDeckModal } from "./deck.js";

type View = "pie" | "trend";
type Site = "main" | "event";

/** 站点配置：主站与国内赛事数据站（分站）的差异集中在此 */
interface SiteConfig {
  site: Site;
  title: string;
  toggleLabel: string; // 标题旁切换按钮文案
  dataPath: string;
  deckDir: string;
  matchTypes: MatchType[];
  hasTrend: boolean; // 是否有“上位卡组统计”模式
  showNameInDropdown: boolean; // 比赛下拉是否显示名称
}

const SITE_CONFIGS: Record<Site, SiteConfig> = {
  main: {
    site: "main",
    title: "万籁阁游戏王 OCG 比赛数据站",
    toggleLabel: "切换至国内大赛数据站",
    dataPath: "./data/data.json",
    deckDir: "./data/deck",
    matchTypes: MATCH_TYPES,
    hasTrend: true,
    showNameInDropdown: false,
  },
  event: {
    site: "event",
    title: "中国大陆游戏王 OCG 赛事数据站",
    toggleLabel: "回到主站",
    dataPath: "./data/event_data.json",
    deckDir: "./data/event_deck",
    matchTypes: EVENT_MATCH_TYPES,
    hasTrend: false,
    showNameInDropdown: true,
  },
};

interface State {
  config: SiteConfig;
  matches: Match[];
  names: string[];
  colorMap: Map<string, number>;
  view: View;
  selectedMatch: number; // 饼图选中的比赛索引
  selectedDecks: string[]; // 趋势图已添加的卡组（有序）
  selectedTypes: Set<MatchType>; // 趋势图选中的比赛类型
  dateRange: { start: string; end: string } | null; // 趋势图日期区间筛选
}

const app = document.getElementById("app")!;
let currentState: State | null = null;

async function loadSite(site: Site): Promise<void> {
  const config = SITE_CONFIGS[site];
  app.innerHTML = `<p class="empty-note">正在加载…</p>`;

  let matches: Match[];
  try {
    matches = await loadData(config.dataPath);
  } catch (err) {
    app.innerHTML = `<div class="error">加载数据失败：${
      err instanceof Error ? err.message : String(err)
    }<br><small>请通过本地服务器访问（例如 npm run serve），而非直接双击打开文件。</small></div>`;
    return;
  }

  const names = allDeckNames(matches);
  const state: State = {
    config,
    matches,
    names,
    colorMap: buildColorMap(names),
    view: "pie",
    selectedMatch: matches.length - 1, // 默认最近一场
    selectedDecks: [], // 趋势图默认空，由用户搜索添加
    selectedTypes: new Set(config.matchTypes), // 默认全部类型
    dateRange: null, // 默认不限制日期
  };
  currentState = state;
  renderShell(state);
}

async function main(): Promise<void> {
  await loadSite("main");
  // 主题切换后重绘（颜色跟随主题）
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (currentState) renderBody(currentState);
    });
}

function renderShell(state: State): void {
  app.innerHTML = "";

  const nav = document.createElement("nav");
  nav.className = "menu";

  // 标题 + 切换按钮
  const brandWrap = document.createElement("div");
  brandWrap.className = "brand-wrap";
  const title = document.createElement("span");
  title.className = "brand";
  title.textContent = state.config.title;
  const toggleBtn = document.createElement("button");
  toggleBtn.className = "site-toggle";
  toggleBtn.textContent = state.config.toggleLabel;
  toggleBtn.addEventListener("click", () => {
    loadSite(state.config.site === "main" ? "event" : "main");
  });
  brandWrap.append(title, toggleBtn);
  nav.appendChild(brandWrap);

  // 模式切换（仅主站有“上位卡组统计”）
  if (state.config.hasTrend) {
    const tabs = document.createElement("div");
    tabs.className = "tabs";
    (["pie", "trend"] as View[]).forEach((v) => {
      const btn = document.createElement("button");
      btn.textContent = v === "pie" ? "比赛详情" : "上位卡组统计";
      btn.className = "tab" + (state.view === v ? " active" : "");
      btn.addEventListener("click", () => {
        state.view = v;
        renderShell(state);
      });
      tabs.appendChild(btn);
    });
    nav.appendChild(tabs);
  }

  app.appendChild(nav);

  const body = document.createElement("main");
  body.id = "view-body";
  body.className = "view-body";
  app.appendChild(body);

  renderBody(state);
}

function renderBody(state: State): void {
  const body = document.getElementById("view-body");
  if (!body) return;
  body.innerHTML = "";
  if (state.view === "pie") {
    body.appendChild(buildPieView(state));
  } else {
    body.appendChild(buildTrendView(state));
  }
}

// —— 视图构建 ——

function buildPieView(state: State): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "pie-view";

  const controls = document.createElement("div");
  controls.className = "controls";
  const label = document.createElement("span");
  label.className = "controls-label";
  label.textContent = "选择比赛：";
  controls.appendChild(label);

  // 自定义下拉：显示当前选中项 + 类型徽章
  const dropdown = document.createElement("div");
  dropdown.className = "match-dropdown";
  const btn = document.createElement("button");
  btn.className = "match-dropdown-btn";
  btn.type = "button";
  updateDropdownBtn(btn, state.matches[state.selectedMatch], state);

  const listWrap = document.createElement("div");
  listWrap.className = "match-dropdown-list";
  listWrap.style.display = "none";
  const list = document.createElement("ul");
  // 倒序遍历：最新的比赛在上面
  for (let i = state.matches.length - 1; i >= 0; i--) {
    const m = state.matches[i];
    const li = document.createElement("li");
    if (i === state.selectedMatch) li.classList.add("active");
    const dateSpan = document.createElement("span");
    dateSpan.textContent = m.date;
    li.appendChild(dateSpan);
    // 分站：日期后附带比赛名称
    if (state.config.showNameInDropdown) {
      const nameSpan = document.createElement("span");
      nameSpan.className = "match-dropdown-name";
      nameSpan.textContent = m.title || "";
      li.appendChild(nameSpan);
    }
    const typeBadge = document.createElement("span");
    typeBadge.className = `type-tag type-tag-${matchTypeColor(m.type)}`;
    typeBadge.textContent = m.type;
    li.appendChild(typeBadge);
    li.addEventListener("click", () => {
      state.selectedMatch = i;
      renderBody(state);
    });
    list.appendChild(li);
  }
  listWrap.appendChild(list);

  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const isOpen = listWrap.style.display === "block";
    listWrap.style.display = isOpen ? "none" : "block";
  });
  document.addEventListener("click", () => {
    listWrap.style.display = "none";
  });

  dropdown.append(btn, listWrap);
  controls.appendChild(dropdown);
  wrap.appendChild(controls);

  const match = state.matches[state.selectedMatch];
  if (!match) {
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = "暂无比赛数据。";
    wrap.appendChild(note);
    return wrap;
  }

  const header = document.createElement("div");
  header.className = "detail-header";

  const h = document.createElement("h2");
  h.textContent = match.title || match.date;
  header.appendChild(h);

  const meta = document.createElement("div");
  meta.className = "meta-row";
  meta.append(
    metaBadge("类型", match.type),
    metaBadge("日期", match.date),
    metaBadge("参赛人数", `${totalDecks(match)} 人`)
  );
  header.appendChild(meta);
  wrap.appendChild(header);

  // 排名展示：传递给 renderPie 以合并到同一框内
  const rankings = buildRankings(match, state);
  const pieContainer = renderPie(match, state.colorMap, rankings);

  // 添加导出按钮到饼图部分（而非整个容器）
  const chartWrap = pieContainer.querySelector("[data-export-target]");
  if (chartWrap) {
    const exportBtn = createExportButton(chartWrap as HTMLElement, match.title);
    chartWrap.appendChild(exportBtn);
  }

  wrap.appendChild(pieContainer);
  return wrap;
}

function buildRankings(match: Match, state: State): HTMLElement {
  const rankings = document.createElement("div");
  rankings.className = "rankings";
  rankings.appendChild(buildRankingLine("🥇 冠军", match["1st"], match, state));
  rankings.appendChild(buildRankingLine("🥈 亚军", match["2nd"], match, state));
  const top4 = document.createElement("div");
  top4.className = "ranking-line";
  const top4Label = document.createElement("span");
  top4Label.className = "rank-label";
  top4Label.textContent = "🥉 四强";
  top4.appendChild(top4Label);
  const top4List = document.createElement("div");
  top4List.className = "rank-players";
  match["3_4th"].forEach((p) => {
    const item = document.createElement("div");
    item.className = "rank-item";
    const playerName = document.createElement("span");
    playerName.textContent = p.id;

    // 卡组徽章：如果有 deck_file，则包含可点击的"查看构筑"链接
    const deckBadge = document.createElement("span");
    deckBadge.className = "deck-badge";

    if (p.deck_file) {
      const deckName = document.createElement("span");
      deckName.textContent = p.deck;
      const divider = document.createElement("span");
      divider.className = "deck-badge-divider";
      const previewLink = document.createElement("span");
      previewLink.className = "deck-preview-link";
      previewLink.textContent = "查看构筑";
      previewLink.addEventListener("click", async (e) => {
        e.stopPropagation();
        previewLink.textContent = "加载中...";
        const deck = await loadDeckFile(match.date, p.id, state.config.deckDir);
        if (deck) {
          const modal = createDeckModal(deck);
          document.body.appendChild(modal);
        } else {
          alert("无法加载卡组文件");
        }
        previewLink.textContent = "查看构筑";
      });
      deckBadge.append(deckName, divider, previewLink);
    } else {
      deckBadge.textContent = p.deck;
    }

    item.append(playerName, " ", deckBadge);
    top4List.appendChild(item);
  });
  top4.appendChild(top4List);
  rankings.appendChild(top4);
  return rankings;
}

function matchTypeColor(type: MatchType): string {
  return {
    // 主站
    积分赛: "purple",
    娱乐赛: "green",
    王中王邀请赛: "orange",
    // 分站（国内赛事数据站）
    城市巡回赛: "blue",
    特别大会: "green",
    "WCQ 预选赛": "orange",
    WCQ: "red",
  }[type] || "";
}

function buildRankingLine(label: string, player: Player, match: Match, state: State): HTMLElement {
  const line = document.createElement("div");
  line.className = "ranking-line";
  const rankLabel = document.createElement("span");
  rankLabel.className = "rank-label";
  rankLabel.textContent = label;
  const item = document.createElement("div");
  item.className = "rank-item";
  const playerName = document.createElement("span");
  playerName.textContent = player.id;

  // 卡组徽章：如果有 deck_file，则包含可点击的"查看构筑"链接
  const deckBadge = document.createElement("span");
  deckBadge.className = "deck-badge";

  if (player.deck_file) {
    const deckName = document.createElement("span");
    deckName.textContent = player.deck;
    const divider = document.createElement("span");
    divider.className = "deck-badge-divider";
    const previewLink = document.createElement("span");
    previewLink.className = "deck-preview-link";
    previewLink.textContent = "查看构筑";
    previewLink.addEventListener("click", async (e) => {
      e.stopPropagation();
      previewLink.textContent = "加载中...";
      const deck = await loadDeckFile(match.date, player.id, state.config.deckDir);
      if (deck) {
        const modal = createDeckModal(deck);
        document.body.appendChild(modal);
      } else {
        alert("无法加载卡组文件");
      }
      previewLink.textContent = "查看构筑";
    });
    deckBadge.append(deckName, divider, previewLink);
  } else {
    deckBadge.textContent = player.deck;
  }

  item.append(playerName, " ", deckBadge);
  line.append(rankLabel, item);
  return line;
}

function updateDropdownBtn(btn: HTMLButtonElement, match: Match | undefined, state: State): void {
  if (!match) {
    btn.textContent = "（无比赛）";
    return;
  }
  btn.innerHTML = "";
  const dateSpan = document.createElement("span");
  dateSpan.textContent = match.date;
  btn.appendChild(dateSpan);
  // 分站：日期后附带比赛名称
  if (state.config.showNameInDropdown) {
    const nameSpan = document.createElement("span");
    nameSpan.className = "match-dropdown-name";
    nameSpan.textContent = match.title || "";
    btn.appendChild(nameSpan);
  }
  const typeBadge = document.createElement("span");
  typeBadge.className = `type-tag type-tag-${matchTypeColor(match.type)}`;
  typeBadge.textContent = match.type;
  const arrow = document.createElement("span");
  arrow.className = "dropdown-arrow";
  arrow.textContent = "▼";
  btn.append(typeBadge, arrow);
}

function metaBadge(label: string, value: string): HTMLElement {
  const badge = document.createElement("span");
  badge.className = "badge";
  // 如果是类型徽章，加上对应颜色类
  if (label === "类型" && matchTypeColor(value as MatchType)) {
    badge.classList.add(`badge-${matchTypeColor(value as MatchType)}`);
  }
  badge.innerHTML = `<span class="badge-k">${label}</span><span class="badge-v"></span>`;
  badge.querySelector(".badge-v")!.textContent = value;
  return badge;
}

function buildTrendView(state: State): HTMLElement {
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
  state.names.forEach((n) => {
    const opt = document.createElement("option");
    opt.value = n;
    datalist.appendChild(opt);
  });

  const addDeck = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    if (!state.names.includes(name)) return; // 只接受已存在的卡组
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
    if (state.names.includes(input.value.trim())) addDeck(input.value);
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
      const startFormatted = start.replace(/-/g, '/');
      const endFormatted = end.replace(/-/g, '/');
      matches = matches.filter((m) => m.date >= startFormatted && m.date <= endFormatted);
    }

    // 收集所有上位卡组（去重）
    const allDecks = new Set<string>();
    matches.forEach((m) => {
      allDecks.add(m["1st"].deck);
      allDecks.add(m["2nd"].deck);
      m["3_4th"].forEach((p) => allDecks.add(p.deck));
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
    const startFormatted = start.replace(/-/g, '/');
    const endFormatted = end.replace(/-/g, '/');
    matches = matches.filter((m) => m.date >= startFormatted && m.date <= endFormatted);
  }

  host.appendChild(renderLine(matches, state.selectedDecks, state.colorMap));
}

main();
