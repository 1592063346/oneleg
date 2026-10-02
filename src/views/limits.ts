// 禁限卡表页（/limits/<tag>）：标题沿用比赛详情的标题样式，正文沿用构筑预览的三个区域

import type { State, AppActions } from "../core/config.js";
import type { LimitTable } from "../core/types.js";
import { createDeckSection, sortCardIds } from "../domain/deck.js";
import { cacheCardInfos } from "../domain/cards.js";
import { loadedLimitTables } from "../domain/limits.js";
import { limitName, t } from "../core/i18n.js";
import { syncUrl } from "../core/router.js";
import { buildDropdown } from "./shared.js";

const ENV = "ocg";

export function buildLimitsView(state: State, actions: AppActions): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "limits-view";

  const tables = loadedLimitTables();
  if (tables) wrap.appendChild(buildTablePicker(state, tables, actions));

  const table = tables?.find((each) => each.tag === state.limitViewTag);
  if (!table) {
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = t("limit.notFound");
    wrap.appendChild(note);
    return wrap;
  }

  const header = document.createElement("div");
  header.className = "detail-header";
  const h = document.createElement("h2");
  h.textContent = limitName(table);
  header.appendChild(h);
  wrap.appendChild(header);

  wrap.appendChild(buildCardList(table));
  return wrap;
}

function buildTablePicker(
  state: State,
  tables: LimitTable[],
  actions: AppActions
): HTMLElement {
  const row = document.createElement("div");
  row.className = "controls";

  const label = document.createElement("span");
  label.className = "controls-label";
  label.textContent = t("limit.select");

  row.append(
    label,
    buildDropdown(
      tables.map((table) => ({ value: table.tag, label: limitName(table) })),
      state.limitViewTag ?? "",
      (tag) => {
        state.limitViewTag = tag;
        syncUrl(state);
        actions.renderBody(state);
      }
    )
  );
  return row;
}

function buildCardList(table: LimitTable): HTMLElement {
  const box = document.createElement("div");
  box.className = "limits-deck";

  const note = document.createElement("p");
  note.className = "builder-note builder-deck-note";
  note.textContent = t("app.loading");
  box.appendChild(note);

  const ids = Object.keys(table.all).map(Number);
  // 简中卡表（tag 以 _sc 结尾）配中文卡图，其余沿用日文卡图
  const env = table.tag.endsWith("_sc") ? "sc" : ENV;

  cacheCardInfos(ids).then(
    () => {
      note.textContent = t("builder.deck.readOnlyNote");
      box.append(
        ...(
          [
            [t("limit.forbidden"), byRank(table, ids, 0)],
            [t("limit.limited"), byRank(table, ids, 1)],
            [t("limit.semiLimited"), byRank(table, ids, 2)],
          ] as Array<[string, number[]]>
        )
          .filter(([, list]) => list.length > 0)
          .map(([name, list]) => createDeckSection(name, list, env))
      );
    },
    () => {
      note.textContent = t("limit.cardsFailed");
    }
  );

  return box;
}

/** 表中该档位的卡号，按卡名排序 */
function byRank(table: LimitTable, ids: number[], rank: number): number[] {
  return sortCardIds(ids.filter((id) => table.all[String(id)] === rank));
}
