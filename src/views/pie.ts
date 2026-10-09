// 比赛详情视图（比赛下拉选择 + 排名 + 环境饼图）

import type { Match, Player } from "../core/types.js";
import type { State, AppActions } from "../core/config.js";
import { totalDecks } from "../core/data.js";
import { deckName, matchDisc, matchTitle, matchTypeName, t } from "../core/i18n.js";
import { renderPie } from "../chart/pie/index.js";
import { loadDeckFile, createDeckModal, dropAbsentCards } from "../domain/deck.js";
import { cacheCardInfos } from "../domain/cards.js";
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
  label.textContent = t("pie.selectMatch");
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
      nameSpan.textContent = matchTitle(m);
      li.appendChild(nameSpan);
    }
    const typeBadge = document.createElement("span");
    typeBadge.className = `type-tag type-tag-${matchTypeColor(m.type)}`;
    typeBadge.textContent = matchTypeName(m.type);
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
    // 展开后把当前选中项滚到中间。隐藏时量不到尺寸，故须放在设置 display 之后
    if (!isOpen) {
      const active = list.querySelector<HTMLElement>("li.active");
      if (active) {
        listWrap.scrollTop = active.offsetTop - (listWrap.clientHeight - active.offsetHeight) / 2;
      }
    }
  });

  dropdown.append(btn, listWrap);
  controls.appendChild(dropdown);
  wrap.appendChild(controls);

  const match = state.matches[state.selectedMatch];
  if (!match) {
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = t("pie.noMatch");
    wrap.appendChild(note);
    return wrap;
  }

  const header = document.createElement("div");
  header.className = "detail-header";

  const h = document.createElement("h2");
  h.textContent = matchTitle(match) || match.date;
  header.appendChild(h);

  const meta = document.createElement("div");
  meta.className = "meta-row";
  meta.append(
    metaBadge(t("pie.meta.type"), matchTypeName(match.type), matchTypeColor(match.type)),
    metaBadge(t("pie.meta.date"), match.date),
    metaBadge(t("pie.meta.players"), t("pie.meta.playersValue", { n: totalDecks(match) }))
  );
  header.appendChild(meta);
  wrap.appendChild(header);

  // 比赛描述：置于信息行与饼图之间，内容按 HTML 解析
  const disc = matchDisc(match);
  if (disc) {
    const desc = document.createElement("div");
    desc.className = "match-desc";
    desc.innerHTML = disc;
    wrap.appendChild(desc);
  }

  // 排名展示：传递给 renderPie 以合并到同一框内
  const rankings = buildRankings(match, state);
  const pieContainer = renderPie(match, state.colorMap, rankings);

  wrap.appendChild(pieContainer);
  return wrap;
}

function buildRankings(match: Match, state: State): HTMLElement {
  const rankings = document.createElement("div");
  rankings.className = "rankings";
  rankings.appendChild(buildRankingLine(t("rank.first"), match["1st"], match, state));

  // 亚军（可选）
  if (match["2nd"]) {
    rankings.appendChild(buildRankingLine(t("rank.second"), match["2nd"], match, state));
  }

  // 四强（可选）
  if (match["3_4th"] && match["3_4th"].length > 0) {
    const top4 = document.createElement("div");
    top4.className = "ranking-line";
    const top4Label = document.createElement("span");
    top4Label.className = "rank-label";
    top4Label.textContent = t("rank.top4");
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
    const badgeName = document.createElement("span");
    badgeName.textContent = deckName(player.deck);
    const divider = document.createElement("span");
    divider.className = "deck-badge-divider";
    const previewLink = document.createElement("span");
    previewLink.className = "deck-preview-link";
    previewLink.textContent = t("deck.view");
    previewLink.addEventListener("click", async (e) => {
      e.stopPropagation();
      previewLink.textContent = t("common.loading");
      const deck = await loadDeckFile(match.date, player.id, state.config.deckDir);
      if (deck) {
        // 先补齐卡片信息：先行卡的临时编号借此换成官方密码，卡图才能落到常规图库；
        // 顺带剔除数据库里查不到的卡号
        await cacheCardInfos([...deck.main, ...deck.extra, ...deck.side]);
        dropAbsentCards(deck);
        const modal = createDeckModal(deck, match.env ?? "ocg");
        document.body.appendChild(modal);
      } else {
        alert(t("deck.loadFailed"));
      }
      previewLink.textContent = t("deck.view");
    });
    deckBadge.append(badgeName, divider, previewLink);
  } else {
    deckBadge.textContent = deckName(player.deck);
  }

  item.append(playerName, " ", deckBadge);
  return item;
}

function updateDropdownBtn(btn: HTMLButtonElement, match: Match | undefined, state: State): void {
  if (!match) {
    btn.textContent = t("pie.noMatchOption");
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
    nameSpan.textContent = matchTitle(match);
    btn.appendChild(nameSpan);
  }
  const typeBadge = document.createElement("span");
  typeBadge.className = `type-tag type-tag-${matchTypeColor(match.type)}`;
  typeBadge.textContent = matchTypeName(match.type);
  const arrow = document.createElement("span");
  arrow.className = "dropdown-arrow";
  arrow.textContent = "▼";
  btn.append(typeBadge, arrow);
}

/** color 为比赛类型徽章的配色标识，其余徽章留空 */
function metaBadge(label: string, value: string, color = ""): HTMLElement {
  const badge = document.createElement("span");
  badge.className = color ? `badge badge-${color}` : "badge";
  badge.innerHTML = `<span class="badge-k">${label}</span><span class="badge-v"></span>`;
  badge.querySelector(".badge-v")!.textContent = value;
  return badge;
}
