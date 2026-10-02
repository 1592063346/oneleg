// 构筑相关视图：
// - 构筑导出（/builder）：ydk 导入 + 卡名检索 + 构筑展示（点击移除）+ 导出
// - 构筑展示（/deck-display）：只读，只有构筑展示（点击开详情页）与导出

import type { State } from "../core/config.js";
import type { DeckData, LimitTable } from "../core/types.js";
import {
  DECK_LIMITS,
  createDeckSection,
  createEmptyDeck,
  deckLimitError,
  downloadDeckFile,
  dropAbsentCards,
  getCardDetailUrl,
  normalizeDeckIds,
  parseYdk,
  setCardImage,
  sortDeck,
} from "../domain/deck.js";
import { cacheCardInfos, isExtraDeckCard, searchCards, type CardInfo } from "../domain/cards.js";
import { allowedCopies, loadLimitTables, loadedLimitTables } from "../domain/limits.js";
import { getLang, limitName, t } from "../core/i18n.js";
import { buildDeckUrl, limitsPageUrl, replaceUrl } from "../core/router.js";
import { downloadBlankForm, exportDeckForm, type DeckFormLang } from "../domain/deckForm.js";
import { buildDropdown } from "./shared.js";

/** 本站不区分卡图环境，统一使用日文卡图 */
const ENV = "ocg";

/** 单张卡在同一卡组中的数量上限 */
const MAX_COPIES = 3;

/** 导出语言，默认日文。放模块级，主题切换重绘视图时不会丢 */
let exportLang: DeckFormLang = "jp";

/** 导入 YDK 折叠区是否展开，同样放模块级以免重绘时被收起 */
let ydkImportOpen = false;

/**
 * 当前适用的禁限卡表；null 表示“无”。
 * 与 state.builderLimitTag 是同一件事的两种形态，由 resolveLimit 派生，
 * 放模块级是为了让各层渲染函数不必层层透传（重绘时同样不会丢）。
 */
let activeLimit: LimitTable | null = null;

/** 按 tag 在已加载的表里找当前适用的表；未选或表还没读到则为 null */
function resolveLimit(tag: string | null | undefined): LimitTable | null {
  if (!tag) return null;
  return loadedLimitTables()?.find((table) => table.tag === tag) ?? null;
}

const LANGS: DeckFormLang[] = ["jp", "sc"];

/**
 * 当前展开的检索结果浮层及其所属搜索行（同一时刻至多一个）。
 * 点击搜索行之外的位置时收起；监听器只在模块加载时注册一次，
 * 避免每次重绘都往 document 上挂一个永不移除的监听。
 */
let openResults: { row: HTMLElement; panel: HTMLElement } | null = null;

document.addEventListener("click", (ev) => {
  // 点在搜索行内（含浮层里的按钮）一律不收起，方便连续添加多张卡
  if (openResults && !openResults.row.contains(ev.target as Node)) {
    openResults.panel.style.display = "none";
    openResults = null;
  }
});

export function buildBuilderView(state: State): HTMLElement {
  if (!state.builderDeck) state.builderDeck = createEmptyDeck();
  // 后续一律原地修改这个对象（而非整体替换），
  // 使各处闭包持有的引用始终指向当前卡组
  const deck = state.builderDeck;
  activeLimit = resolveLimit(state.builderLimitTag);

  const wrap = document.createElement("div");
  wrap.className = "builder-view";

  const deckHost = document.createElement("div");
  deckHost.className = "builder-deck";

  /** 只重绘构筑展示区，不打断搜索框内容与已展开的结果浮层 */
  const refresh = (): void => {
    deckHost.innerHTML = "";
    deckHost.appendChild(buildDeckSections(deck, sync, t("builder.deck.editNote")));
    replaceUrl(state); // 编辑结果实时反映到地址栏（替换而非新增历史记录）
  };

  /**
   * 卡组每次变动后调用，返回的 Promise 在展示区重绘完毕后 resolve。
   * ydk 导入的只有数字 ID，排序所需的类型与星级得靠联网补，
   * 所以先补齐、再把异画 id 换回原画 id、最后排序重绘：预览直接落到排好的结果上，
   * 不会先乱后序地跳一下。检索来的卡片在搜索时就已入缓存，这条路径不会发请求。
   */
  const sync = async (): Promise<void> => {
    await cacheCardInfos([...deck.main, ...deck.extra, ...deck.side]);
    dropAbsentCards(deck);
    normalizeDeckIds(deck);
    sortDeck(deck);
    refresh();
  };

  wrap.append(
    buildYdkImport(deck, sync),
    buildCardSearch(deck, sync),
    buildLimitRow(state, refresh),
    deckHost,
    buildExportRow(deck, "share", () => state.builderLimitTag)
  );
  void sync();

  return wrap;
}

/**
 * 构筑展示视图（只读，路由 /deck-display）：
 * 与构筑导出视图同构，但没有导入 YDK、卡片搜索两行，适用禁限卡表只呈现不可选，
 * 点击卡片改为在新标签页打开卡片详情页，底部的分享按钮改为进入编辑页。
 */
export function buildDeckDisplayView(state: State): HTMLElement {
  const deck = state.displayDeck ?? createEmptyDeck();
  state.displayDeck = deck;
  const limit = resolveLimit(state.displayLimitTag);
  activeLimit = limit;

  const wrap = document.createElement("div");
  wrap.className = "builder-view";

  const deckHost = document.createElement("div");
  deckHost.className = "builder-deck";

  wrap.append(
    buildLimitInfoRow(limit),
    deckHost,
    buildExportRow(deck, "edit", () => state.displayLimitTag)
  );

  // 与编辑器同样的流程：ydk 里只有 id，排不了序，得先补齐卡片信息，
  // 再剔除查不到的卡、把异画 id 换回原画 id、按类型与星级排序，最后才渲染，
  // 卡序与保留的卡片才与构筑导出页一致
  void cacheCardInfos([...deck.main, ...deck.extra, ...deck.side]).then(() => {
    dropAbsentCards(deck);
    normalizeDeckIds(deck);
    sortDeck(deck);
    deckHost.replaceChildren(buildDeckSections(deck, undefined, t("builder.deck.readOnlyNote")));
  });

  return wrap;
}

/** 新建一行筛选控件（与趋势图各行的样式一致） */
function controlRow(labelText: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "controls";
  const label = document.createElement("span");
  label.className = "controls-label";
  label.textContent = labelText;
  row.appendChild(label);
  return row;
}

/**
 * 导入失败：一律用浏览器弹窗提醒。
 * 同时清掉按钮旁的提示文字，免得“导入中…”留在那里被误读成还在处理。
 */
function reportImportFailure(note: HTMLElement, message: string): void {
  note.textContent = "";
  alert(message);
}

/**
 * 1+2. 导入 YDK 的折叠区：文件与文本两种方式收在里面，默认收起。
 * 本站的主要入口是卡片搜索，导入是次要功能，常驻两行喧宾夺主。
 */
function buildYdkImport(deck: DeckData, onChange: () => Promise<void>): HTMLElement {
  const host = document.createElement("div");
  host.className = "builder-ydk-import";

  const row = document.createElement("div");
  row.className = "controls";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "builder-plain-btn builder-ydk-toggle";
  const arrow = document.createElement("span");
  arrow.className = "builder-toggle-arrow";
  btn.append(arrow, t("builder.ydk.import"));

  // 展开动画靠父层的高度过渡，故内层再包一层：外层量高度，内层裁掉溢出的内容
  const body = document.createElement("div");
  body.className = "builder-ydk-body";
  const inner = document.createElement("div");
  inner.className = "builder-ydk-inner";
  inner.append(buildFileImport(deck, onChange), buildTextImport(deck, onChange));
  body.appendChild(inner);

  const apply = (open: boolean): void => {
    arrow.textContent = open ? "−" : "+";
    body.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
  };
  apply(ydkImportOpen);
  btn.addEventListener("click", () => {
    ydkImportOpen = !ydkImportOpen;
    apply(ydkImportOpen);
  });

  row.appendChild(btn);
  host.append(row, body);
  return host;
}

/** 1. 上传 .ydk 文件，覆盖当前构筑 */
function buildFileImport(deck: DeckData, onChange: () => Promise<void>): HTMLElement {
  const row = controlRow(t("builder.ydk.file"));

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".ydk,text/plain";
  fileInput.className = "ydk-file-input";

  // 原生 file 输入自带“未选择任何文件”文案，没有选择器能把它单独去掉，
  // 所以把 input 透明地铺在 label 上、由 label 充当按钮
  const fileLabel = document.createElement("label");
  fileLabel.className = "builder-plain-btn ydk-file-label";
  fileLabel.textContent = t("builder.ydk.chooseFile");
  fileLabel.appendChild(fileInput);

  const note = document.createElement("span");
  note.className = "builder-note";

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    note.textContent = t("builder.ydk.importing");
    try {
      const next = parseYdk(await file.text());
      const over = deckLimitError(next); // 超限则整份拒绝，当前构筑原样保留
      if (over) {
        reportImportFailure(note, t("builder.ydk.importFailed", { msg: over }));
      } else {
        overwriteDeck(deck, next);
        await onChange(); // 卡片信息补齐、构筑预览重绘完毕后清掉“导入中…”
        note.textContent = "";
      }
    } catch (err) {
      reportImportFailure(note, t("builder.ydk.readFailed", { msg: errText(err) }));
    }
    fileInput.value = ""; // 清空，以便连续导入同一个文件
  });

  row.append(fileLabel, note);
  return row;
}

/** 2. 粘贴 ydk 文本，覆盖当前构筑 */
function buildTextImport(deck: DeckData, onChange: () => Promise<void>): HTMLElement {
  const row = controlRow(t("builder.ydk.text"));
  row.classList.add("builder-text-import");

  const textarea = document.createElement("textarea");
  textarea.className = "ydk-text-input";
  textarea.placeholder = t("builder.ydk.textPlaceholder");
  textarea.spellcheck = false;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "builder-plain-btn";
  btn.textContent = t("builder.ydk.importText");

  const note = document.createElement("span");
  note.className = "builder-note";

  btn.addEventListener("click", async () => {
    const text = textarea.value.trim();
    if (!text) {
      reportImportFailure(note, t("builder.ydk.emptyText"));
      return;
    }
    const next = parseYdk(text);
    const over = deckLimitError(next); // 超限则整份拒绝，当前构筑原样保留
    if (over) {
      reportImportFailure(note, t("builder.ydk.importFailed", { msg: over }));
      return;
    }
    const total = next.main.length + next.extra.length + next.side.length;
    if (total === 0) {
      reportImportFailure(note, t("builder.ydk.unrecognized"));
      return;
    }
    overwriteDeck(deck, next);
    note.textContent = t("builder.ydk.importing");
    await onChange();
    note.textContent = "";
  });

  row.append(textarea, btn, note);
  return row;
}

/** 3. 卡名检索：回车或点按钮发起请求，结果以浮层下拉展示 */
function buildCardSearch(deck: DeckData, onChange: () => void): HTMLElement {
  const row = controlRow(t("builder.search"));
  row.classList.add("builder-search"); // position: relative，供结果浮层定位

  const input = document.createElement("input");
  input.type = "search"; // 保留原生清除按钮（×）
  input.className = "deck-input";
  input.placeholder = t("builder.search.placeholder");
  input.autocomplete = "off";
  input.spellcheck = false;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "builder-plain-btn";
  btn.textContent = t("builder.search.submit");

  const panel = document.createElement("div");
  panel.className = "builder-results";
  panel.style.display = "none";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "deck-action-btn deck-action-clear";
  clearBtn.textContent = t("builder.search.clearDeck");
  clearBtn.addEventListener("click", () => {
    // 空构筑直接清；有卡时先确认，避免误点丢掉整份构筑
    if (!isEmpty(deck) && !confirm(t("builder.search.confirmClear"))) return;
    deck.main = [];
    deck.extra = [];
    deck.side = [];
    onChange();
    // 浮层里的步进器数字按清空前的数量算，而 onChange 只重绘展示区，
    // 故收起浮层，下次搜索再重算
    panel.style.display = "none";
    if (openResults?.panel === panel) openResults = null;
  });

  /** 在浮层中显示一句提示文字（搜索中/无结果/出错） */
  const showNote = (text: string): void => {
    panel.innerHTML = "";
    const note = document.createElement("p");
    note.className = "builder-results-note";
    note.textContent = text;
    panel.appendChild(note);
    panel.style.display = "block";
    openResults = { row, panel };
  };

  const run = async (): Promise<void> => {
    const query = input.value.trim();
    if (!query) return;
    showNote(t("builder.search.searching"));
    try {
      const hits = await searchCards(query);
      if (hits.length === 0) {
        showNote(t("builder.search.empty"));
        return;
      }
      const list = document.createElement("ul");
      hits.forEach((hit) => list.appendChild(buildResultItem(hit, deck, onChange)));
      panel.innerHTML = "";
      panel.appendChild(buildResultsHead());
      panel.appendChild(list);
      panel.style.display = "block";
      openResults = { row, panel };
    } catch (err) {
      showNote(t("builder.search.failed", { msg: errText(err) }));
    }
  };

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      void run();
    } else if (ev.key === "Escape") {
      panel.style.display = "none";
      if (openResults?.panel === panel) openResults = null;
    }
  });
  btn.addEventListener("click", () => void run());

  row.append(input, btn, clearBtn, panel);
  return row;
}

/** 结果列表的表头：左右各列与下方卡片行对齐 */
function buildResultsHead(): HTMLElement {
  const head = document.createElement("div");
  head.className = "builder-results-head";

  const spacer = document.createElement("span"); // 占位，与卡图等宽
  spacer.className = "builder-head-img";

  const info = document.createElement("span");
  info.className = "builder-head-info";
  info.textContent = t("builder.results.info");

  const cols = document.createElement("span");
  cols.className = "builder-cols";
  for (const title of [t("deck.main"), t("deck.side")]) {
    const col = document.createElement("span");
    col.className = "builder-head-col";
    col.textContent = title;
    cols.appendChild(col);
  }

  head.append(spacer, info, cols);
  return head;
}

/** 检索结果中的一行：卡图 + 三行文字 + 两个步进器 */
function buildResultItem(hit: CardInfo, deck: DeckData, onChange: () => void): HTMLElement {
  const li = document.createElement("li");
  li.className = "builder-result";

  // 英文模式首行改用英文名，取不到再退到中文名
  const primaryName = getLang() === "en" ? hit.en_name || hit.cn_name : hit.cn_name;

  const img = document.createElement("img");
  img.className = "deck-card-image"; // 卡图尺寸复用构筑预览的 60px*88px
  setCardImage(img, hit.id, ENV);
  img.alt = primaryName || hit.jp_name || String(hit.id);
  img.loading = "lazy";

  const meta = document.createElement("div");
  meta.className = "builder-result-meta";
  const cn = document.createElement("a");
  cn.className = "builder-result-cn";
  cn.href = getCardDetailUrl(hit.id);
  cn.target = "_blank";
  cn.rel = "noopener noreferrer";
  cn.textContent = primaryName || t("builder.result.noName");
  const jp = document.createElement("span");
  jp.className = "builder-result-jp";
  jp.textContent = hit.jp_name || t("builder.result.noJpName");
  const idLine = document.createElement("span");
  idLine.className = "builder-result-id";
  idLine.textContent = String(hit.id);
  meta.append(cn, jp, idLine);

  // 融合/同调/超量/连接怪放不进主卡组，按卡片类型自动归到额外卡组
  const toExtra = isExtraDeckCard(hit);
  const primary = toExtra ? deck.extra : deck.main;
  const primaryLimit = toExtra ? DECK_LIMITS.extra : DECK_LIMITS.main;
  const primaryLabel = t(toExtra ? "deck.extra" : "deck.main");

  const cols = document.createElement("div");
  cols.className = "builder-cols";
  // 单卡上限按整副卡组计，同一行的两个步进器共用它，
  // 故放进同一个刷新组：任一区域加减后两边的数字与加号一起重算
  const refreshGroup: Array<() => void> = [];
  cols.append(
    buildStepper(deck, primary, hit.id, primaryLimit, primaryLabel, onChange, refreshGroup),
    buildStepper(deck, deck.side, hit.id, DECK_LIMITS.side, t("deck.side"), onChange, refreshGroup)
  );

  li.append(img, meta, cols);
  return li;
}

/** 某张卡在所属区域中的数量 */
function countOf(section: number[], id: number): number {
  return section.filter((cardId) => cardId === id).length;
}

/** 某张卡在整副卡组（主 + 额外 + 副）中的数量 */
function deckCount(deck: DeckData, id: number): number {
  return countOf(deck.main, id) + countOf(deck.extra, id) + countOf(deck.side, id);
}

/**
 * “+ 1 −”步进器：中间数字即该卡在所属区域中的数量，不可手动编辑。
 * 只有单卡上限 MAX_COPIES 与下限 0 会让按钮置灰；区域上限 limit 与禁限卡表在按下时才判。
 * 单卡上限按整副卡组计，故同一行的两个步进器共用（refreshGroup）：任一区域放满，两边的加号一起置灰。
 * onChange 只重绘构筑展示区，不会重绘本浮层，所以按钮状态就地更新。
 */
function buildStepper(
  deck: DeckData,
  section: number[],
  id: number,
  limit: number,
  label: string,
  onChange: () => void,
  refreshGroup: Array<() => void>
): HTMLElement {
  const box = document.createElement("div");
  box.className = "builder-stepper";

  const minus = document.createElement("button");
  minus.type = "button";
  minus.className = "builder-step-btn";
  minus.textContent = "−";

  const num = document.createElement("span");
  num.className = "builder-step-num";

  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "builder-step-btn";
  plus.textContent = "+";

  const update = (): void => {
    const count = countOf(section, id);
    num.textContent = String(count);
    minus.disabled = count === 0;
    plus.disabled = deckCount(deck, id) >= MAX_COPIES;
  };
  refreshGroup.push(update);

  /** 同一行的两个步进器一起重算 */
  const refreshRow = (): void => {
    refreshGroup.forEach((fn) => fn());
  };

  minus.addEventListener("click", () => {
    const index = section.indexOf(id);
    if (index < 0) return;
    section.splice(index, 1);
    onChange();
    refreshRow();
  });

  plus.addEventListener("click", () => {
    // 与置灰同源，按整副卡组计
    if (deckCount(deck, id) >= MAX_COPIES) return;
    // 禁限卡表按整副卡组计张数，故主卡组与副卡组的步进器都要算上对方
    const cap = allowedCopies(activeLimit, id);
    if (cap !== undefined && deckCount(deck, id) >= cap) {
      alert(t("builder.step.overLimit"));
      return;
    }
    // 区域已满时不置灰：移除本区其他卡即可加入，置灰会让人以为这张卡加不进去。
    // 是否加得进只在按下时才能判定，故就地提示
    if (section.length >= limit) {
      alert(t("builder.step.sectionFull", { label, limit }));
      return;
    }
    section.push(id);
    onChange();
    refreshRow();
  });

  update();
  box.append(plus, num, minus);
  return box;
}

/**
 * 4. 适用禁卡表：选“无”则不校验，选具体表则限制单卡投入张数并标注卡图上的禁限角标。
 * 表是异步读的，未到位时先只列出“无”，读完后就地替换。
 */
function buildLimitRow(state: State, onChange: () => void): HTMLElement {
  const row = controlRow(t("limit.label"));

  const host = document.createElement("span");
  const note = document.createElement("span");
  note.className = "builder-note";
  row.append(host, note);

  const render = (list: LimitTable[]): void => {
    activeLimit = resolveLimit(state.builderLimitTag); // 表刚到位的这一轮也要认清选中项
    // 候选取 tag：表名可能重复，tag 唯一，且它才是路由参数里的那个值
    const options = [
      { value: null as string | null, label: t("limit.none") },
      ...list.map((table) => ({ value: table.tag as string | null, label: limitName(table) })),
    ];
    host.replaceChildren(
      buildDropdown(
        options,
        state.builderLimitTag ?? null,
        (tag) => {
          state.builderLimitTag = tag;
          activeLimit = list.find((table) => table.tag === tag) ?? null;
          onChange(); // 换表后重绘构筑展示，刷新每张卡的禁限角标并更新地址栏
        },
        (item) => {
          const table = list.find((each) => each.tag === item.value);
          return table ? buildViewLink(table) : null; // “无”没有可看的名单
        }
      )
    );
  };

  const loaded = loadedLimitTables();
  if (loaded) {
    render(loaded);
  } else {
    render([]);
    loadLimitTables().then(
      (list) => {
        render(list);
        onChange(); // 表读到了才能解出 URL 里指定的那张，补一次重绘
      },
      () => {
        note.textContent = t("limit.loadFailed");
      }
    );
  }
  return row;
}

/**
 * 卡表名称后的“查看”：在新标签页打开该表的名单页。
 */
function buildViewLink(table: LimitTable): HTMLElement {
  const link = document.createElement("a");
  link.className = "deck-preview-link";
  link.href = limitsPageUrl(table.tag);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = t("limit.view");
  link.addEventListener("click", (ev) => ev.stopPropagation()); // 只查看，不选中该表
  return link;
}

/**
 * 只读的一行适用禁限卡表：表名，非“无”时附查看名单的链接。
 */
function buildLimitInfoRow(table: LimitTable | null): HTMLElement {
  const row = controlRow(t("limit.label"));

  const name = document.createElement("span");
  name.textContent = table ? limitName(table) : t("limit.none");

  row.appendChild(name);
  if (table) row.appendChild(buildViewLink(table));
  return row;
}

/**
 * 5. 构筑展示：三个区域 + 第一行提示。
 * 传 onChange 时点击单卡移除一张；省略则为只读展示，点击单卡在新标签页打开卡片详情页。
 */
function buildDeckSections(
  deck: DeckData,
  onChange: (() => void) | undefined,
  noteText: string
): HTMLElement {
  const box = document.createElement("div");
  const limits = activeLimit?.all ?? null;

  const note = document.createElement("p");
  note.className = "builder-note builder-deck-note";
  note.textContent = noteText;
  box.appendChild(note);

  const removeCard =
    (section: number[]) =>
    (index: number): void => {
      section.splice(index, 1);
      onChange?.();
    };

  // 三个区域恒常显示（含数量 0），让用户始终看得到构筑的构成
  box.append(
    createDeckSection(
      t("deck.main"),
      deck.main,
      ENV,
      onChange ? removeCard(deck.main) : undefined,
      limits
    ),
    createDeckSection(
      t("deck.extra"),
      deck.extra,
      ENV,
      onChange ? removeCard(deck.extra) : undefined,
      limits
    ),
    createDeckSection(
      t("deck.side"),
      deck.side,
      ENV,
      onChange ? removeCard(deck.side) : undefined,
      limits
    )
  );

  return box;
}

/**
 * 6. 导出：PDF 比赛卡表 + YDK 文件 + 构筑链接。
 * mode 为 share 时是构筑导出页的“复制分享链接”（产出只读展示页的地址），
 * 为 edit 时是构筑展示页的“编辑卡组”（进入构筑导出页）。
 * getLimitTag 到点击时才取值：导出行只构建一次，而适用卡表随时会变。
 */
function buildExportRow(
  deck: DeckData,
  mode: "share" | "edit",
  getLimitTag: () => string | null | undefined
): HTMLElement {
  const row = document.createElement("div");
  row.className = "controls builder-export";

  const label = document.createElement("span");
  label.className = "controls-label";
  label.textContent = t("builder.export.langLabel");

  const pdfBtn = document.createElement("button");
  pdfBtn.type = "button";
  pdfBtn.className = "deck-action-btn deck-action-pdf";
  pdfBtn.textContent = t("builder.export.pdf");
  pdfBtn.addEventListener("click", async () => {
    if (isEmpty(deck)) {
      alert(t("builder.export.empty"));
      return;
    }
    pdfBtn.disabled = true;
    try {
      await exportDeckForm(deck, exportLang);
    } catch (err) {
      alert(t("builder.export.pdfFailed", { msg: errText(err) }));
    }
    pdfBtn.disabled = false;
  });

  const ydkBtn = document.createElement("button");
  ydkBtn.type = "button";
  ydkBtn.className = "builder-plain-btn";
  ydkBtn.textContent = t("builder.export.ydk");
  ydkBtn.addEventListener("click", () => {
    if (isEmpty(deck)) {
      alert(t("builder.export.empty"));
      return;
    }
    downloadDeckFile(deck);
  });

  // 空卡表与构筑内容无关，不随 isEmpty 禁用
  const blankLink = document.createElement("button");
  blankLink.type = "button";
  blankLink.className = "builder-blank-link";
  blankLink.textContent = t("builder.export.blank");
  blankLink.addEventListener("click", async () => {
    try {
      await downloadBlankForm();
    } catch (err) {
      alert(t("builder.export.blankFailed", { msg: errText(err) }));
    }
  });

  /**
   * 构筑链接：编辑页复制的是只读展示页的地址，展示页则是回到编辑页。
   * 地址在点击时才拼：导出行只构建一次，构筑改动只重绘展示区，提前算会拿到旧构筑与旧卡表。
   */
  const linkBtn = document.createElement("button");
  linkBtn.type = "button";
  linkBtn.className = "builder-plain-btn";
  linkBtn.textContent = t(mode === "share" ? "builder.export.share" : "builder.export.edit");
  linkBtn.addEventListener("click", async () => {
    const href = buildDeckUrl(mode === "share" ? "deck-display" : "builder", deck, getLimitTag());
    if (mode === "edit") {
      window.location.assign(href);
      return;
    }
    const url = new URL(href, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // 非安全上下文里没有剪贴板接口，退回到手动复制
      prompt(t("builder.export.copyPrompt"), url);
    }
  });

  row.append(label, buildLangDropdown(), pdfBtn, ydkBtn, linkBtn, blankLink);
  return row;
}

function isEmpty(deck: DeckData): boolean {
  return deck.main.length + deck.extra.length + deck.side.length === 0;
}

/** 导出语言下拉。导出语言与界面语言无关，故仍只提供中文与日文 */
function buildLangDropdown(): HTMLElement {
  return buildDropdown(
    LANGS.map((lang) => ({
      value: lang,
      label: t(lang === "jp" ? "builder.lang.jp" : "builder.lang.sc"),
    })),
    exportLang,
    (lang) => {
      exportLang = lang;
    }
  );
}

/** 用新卡组覆盖当前卡组（保持 deck 的对象引用不变） */
function overwriteDeck(deck: DeckData, next: DeckData): void {
  deck.main = next.main;
  deck.extra = next.extra;
  deck.side = next.side;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
