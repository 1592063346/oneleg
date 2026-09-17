// 比赛详情视图（比赛下拉选择 + 排名 + 环境饼图）

import type { Match, Player } from "../core/types.js";
import type { State, AppActions } from "../core/config.js";
import { totalDecks } from "../core/data.js";
import { renderPie } from "../chart/pie/index.js";
import { createExportButton } from "../chart/exportImage.js";
import { loadDeckFile, createDeckModal } from "../domain/deck.js";
import { syncUrl } from "../core/router.js";
import { matchTypeColor } from "./shared.js";

/**
 * 当前展开的比赛下拉列表（同一时刻至多一个）。
 * 点击页面其他位置时关闭，监听器只在模块加载时注册一次，
 * 避免每次重绘都往 document 上挂一个永不移除的监听。
 */
let openMatchList: HTMLElement | null = null;

document.addEventListener("click", () => {
  if (!openMatchList) return;
  openMatchList.style.display = "none";
  openMatchList = null;
});

export function buildPieView(state: State, actions: AppActions): HTMLElement {
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
      syncUrl(state);
      actions.renderBody(state);
    });
    list.appendChild(li);
  }
  listWrap.appendChild(list);

  btn.addEventListener("click", (ev) => {
    ev.stopPropagation(); // 阻止冒泡到 document，否则会被"点击其他位置"的监听立即关闭
    const isOpen = listWrap.style.display === "block";
    if (openMatchList && openMatchList !== listWrap) openMatchList.style.display = "none";
    listWrap.style.display = isOpen ? "none" : "block";
    openMatchList = isOpen ? null : listWrap;
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

  // 亚军（可选）
  if (match["2nd"]) {
    rankings.appendChild(buildRankingLine("🥈 亚军", match["2nd"], match, state));
  }

  // 四强（可选）
  if (match["3_4th"] && match["3_4th"].length > 0) {
    const top4 = document.createElement("div");
    top4.className = "ranking-line";
    const top4Label = document.createElement("span");
    top4Label.className = "rank-label";
    top4Label.textContent = "🥉 四强";
    top4.appendChild(top4Label);
    const top4List = document.createElement("div");
    top4List.className = "rank-players";
    match["3_4th"].forEach((p) => {
      top4List.appendChild(buildPlayerItem(p, match, state));
    });
    top4.appendChild(top4List);
    rankings.appendChild(top4);
  }

  return rankings;
}

function buildRankingLine(label: string, player: Player, match: Match, state: State): HTMLElement {
  const line = document.createElement("div");
  line.className = "ranking-line";
  const rankLabel = document.createElement("span");
  rankLabel.className = "rank-label";
  rankLabel.textContent = label;
  line.append(rankLabel, buildPlayerItem(player, match, state));
  return line;
}

function buildPlayerItem(player: Player, match: Match, state: State): HTMLElement {
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
        const modal = createDeckModal(deck, match.env ?? "ocg");
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
  return item;
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
  if (label === "类型" && matchTypeColor(value as Match["type"])) {
    badge.classList.add(`badge-${matchTypeColor(value as Match["type"])}`);
  }
  badge.innerHTML = `<span class="badge-k">${label}</span><span class="badge-v"></span>`;
  badge.querySelector(".badge-v")!.textContent = value;
  return badge;
}
