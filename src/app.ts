import type { Match, MatchType, Player } from "./types.js";
import { MATCH_TYPES } from "./types.js";
import { allDeckNames, loadData, totalDecks } from "./data.js";
import { buildColorMap, seriesColor } from "./palette.js";
import { renderPie } from "./pie.js";
import { renderLine } from "./line.js";

type View = "pie" | "trend";

interface State {
  matches: Match[];
  names: string[];
  colorMap: Map<string, number>;
  view: View;
  selectedMatch: number; // 饼图选中的比赛索引
  selectedDecks: string[]; // 趋势图已添加的卡组（有序）
  selectedTypes: Set<MatchType>; // 趋势图选中的比赛类型
}

const app = document.getElementById("app")!;

async function main(): Promise<void> {
  let matches: Match[];
  try {
    matches = await loadData();
  } catch (err) {
    app.innerHTML = `<div class="error">加载数据失败：${
      err instanceof Error ? err.message : String(err)
    }<br><small>请通过本地服务器访问（例如 npm run serve），而非直接双击打开文件。</small></div>`;
    return;
  }

  const names = allDeckNames(matches);
  const state: State = {
    matches,
    names,
    colorMap: buildColorMap(names),
    view: "pie",
    selectedMatch: matches.length - 1, // 默认最近一场
    selectedDecks: [], // 趋势图默认空，由用户搜索添加
    selectedTypes: new Set(MATCH_TYPES), // 默认全部类型
  };

  renderShell(state);
  // 主题切换后重绘（颜色跟随主题）
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => renderBody(state));
}

function renderShell(state: State): void {
  app.innerHTML = "";

  const nav = document.createElement("nav");
  nav.className = "menu";
  const title = document.createElement("span");
  title.className = "brand";
  title.textContent = "万籁阁游戏王比赛数据一览";
  nav.appendChild(title);

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
  updateDropdownBtn(btn, state.matches[state.selectedMatch]);

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
    const typeBadge = document.createElement("span");
    typeBadge.className = `type-tag type-tag-${matchTypeColor(m.type)}`;
    typeBadge.textContent = m.type;
    li.append(dateSpan, typeBadge);
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
  const rankings = buildRankings(match);
  wrap.appendChild(renderPie(match, state.colorMap, rankings));
  return wrap;
}

function buildRankings(match: Match): HTMLElement {
  const rankings = document.createElement("div");
  rankings.className = "rankings";
  rankings.appendChild(buildRankingLine("🥇 冠军", match["1st"]));
  rankings.appendChild(buildRankingLine("🥈 亚军", match["2nd"]));
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
    const deckBadge = document.createElement("span");
    deckBadge.className = "deck-badge";
    deckBadge.textContent = p.deck;
    item.append(playerName, " ", deckBadge);
    top4List.appendChild(item);
  });
  top4.appendChild(top4List);
  rankings.appendChild(top4);
  return rankings;
}

function matchTypeColor(type: MatchType): string {
  return { 积分赛: "purple", 娱乐赛: "green", 王中王邀请赛: "orange" }[type] || "";
}

function buildRankingLine(label: string, player: Player): HTMLElement {
  const line = document.createElement("div");
  line.className = "ranking-line";
  const rankLabel = document.createElement("span");
  rankLabel.className = "rank-label";
  rankLabel.textContent = label;
  const item = document.createElement("div");
  item.className = "rank-item";
  const playerName = document.createElement("span");
  playerName.textContent = player.id;
  const deckBadge = document.createElement("span");
  deckBadge.className = "deck-badge";
  deckBadge.textContent = player.deck;
  item.append(playerName, " ", deckBadge);
  line.append(rankLabel, item);
  return line;
}

function updateDropdownBtn(btn: HTMLButtonElement, match: Match | undefined): void {
  if (!match) {
    btn.textContent = "（无比赛）";
    return;
  }
  btn.innerHTML = "";
  const dateSpan = document.createElement("span");
  dateSpan.textContent = match.date;
  const typeBadge = document.createElement("span");
  typeBadge.className = `type-tag type-tag-${matchTypeColor(match.type)}`;
  typeBadge.textContent = match.type;
  const arrow = document.createElement("span");
  arrow.className = "dropdown-arrow";
  arrow.textContent = "▼";
  btn.append(dateSpan, typeBadge, arrow);
}

function metaBadge(label: string, value: string): HTMLElement {
  const badge = document.createElement("span");
  badge.className = "badge";
  // 如果是类型徽章，加上对应颜色类
  if (label === "类型" && MATCH_TYPES.includes(value as MatchType)) {
    badge.classList.add(`badge-${matchTypeColor(value as MatchType)}`);
  }
  badge.innerHTML = `<span class="badge-k">${label}</span><span class="badge-v"></span>`;
  badge.querySelector(".badge-v")!.textContent = value;
  return badge;
}

function buildTrendView(state: State): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "trend-view";

  // 类型筛选
  const typeRow = document.createElement("div");
  typeRow.className = "controls type-filter";
  const typeLabel = document.createElement("span");
  typeLabel.className = "controls-label";
  typeLabel.textContent = "比赛类型：";
  typeRow.appendChild(typeLabel);
  MATCH_TYPES.forEach((t) => {
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
  searchRow.append(sLabel, input, datalist);
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
  const matches = state.matches.filter((m) => state.selectedTypes.has(m.type));
  host.appendChild(renderLine(matches, state.selectedDecks, state.colorMap));
}

main();
