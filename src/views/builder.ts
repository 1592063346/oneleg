// 构筑导出视图：ydk 导入 + 卡名检索 + 构筑展示（点击移除）+ ydk 导出

import type { State } from "../core/config.js";
import type { DeckData } from "../core/types.js";
import {
  DECK_LIMITS,
  createDeckSection,
  createEmptyDeck,
  deckLimitError,
  downloadDeckFile,
  getCardDetailUrl,
  getCardImageUrl,
  parseYdk,
  sortDeck,
} from "../domain/deck.js";
import { cacheCardInfos, isExtraDeckCard, searchCards, type CardInfo } from "../domain/cards.js";
import { exportDeckForm, type DeckFormLang } from "../domain/deckForm.js";

/** 本站不区分卡图环境，统一使用日文卡图 */
const ENV = "ocg";

/** 单张卡在同一卡组中的数量上限 */
const MAX_COPIES = 3;

/** 导出语言，默认日文。放模块级，主题切换重绘视图时不会丢 */
let exportLang: DeckFormLang = "jp";

const LANG_LABELS: Record<DeckFormLang, string> = { jp: "日文", sc: "简体中文" };
const LANGS: DeckFormLang[] = ["jp", "sc"];

/**
 * 当前展开的检索结果浮层及其所属搜索行（同一时刻至多一个）。
 * 点击搜索行之外的位置时收起；监听器只在模块加载时注册一次，
 * 避免每次重绘都往 document 上挂一个永不移除的监听。
 */
let openResults: { row: HTMLElement; panel: HTMLElement } | null = null;

/** 当前展开的导出语言下拉（同样至多一个） */
let openLangList: HTMLElement | null = null;

document.addEventListener("click", (ev) => {
  // 点在搜索行内（含浮层里的按钮）一律不收起，方便连续添加多张卡
  if (openResults && !openResults.row.contains(ev.target as Node)) {
    openResults.panel.style.display = "none";
    openResults = null;
  }
  if (openLangList) {
    openLangList.style.display = "none";
    openLangList = null;
  }
});

export function buildBuilderView(state: State): HTMLElement {
  if (!state.builderDeck) state.builderDeck = createEmptyDeck();
  // 后续一律原地修改这个对象（而非整体替换），
  // 使各处闭包持有的引用始终指向当前卡组
  const deck = state.builderDeck;

  const wrap = document.createElement("div");
  wrap.className = "builder-view";

  const deckHost = document.createElement("div");
  deckHost.className = "builder-deck";

  /** 只重绘构筑展示区，不打断搜索框内容与已展开的结果浮层 */
  const refresh = (): void => {
    deckHost.innerHTML = "";
    deckHost.appendChild(buildDeckSections(deck, sync));
  };

  /**
   * 卡组每次变动后调用，返回的 Promise 在展示区重绘完毕后 resolve。
   * ydk 导入的只有数字 ID，排序所需的类型与星级得靠联网补，
   * 所以先补齐、再排序、最后重绘：预览直接落到排好的结果上，不会先乱后序地跳一下。
   * 检索来的卡片在搜索时就已入缓存，这条路径不会发请求。
   */
  const sync = async (): Promise<void> => {
    await cacheCardInfos([...deck.main, ...deck.extra, ...deck.side]);
    sortDeck(deck);
    refresh();
  };

  wrap.append(
    buildFileImport(deck, sync),
    buildTextImport(deck, sync),
    buildCardSearch(deck, sync),
    deckHost,
    buildExportRow(deck)
  );
  void sync();

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
 * 同时清掉按钮旁的提示文字——那里可能还留着上一次导入成功的记录，容易被误读。
 */
function reportImportFailure(note: HTMLElement, message: string): void {
  note.textContent = "";
  alert(message);
}

/** 1. 上传 .ydk 文件，覆盖当前构筑 */
function buildFileImport(deck: DeckData, onChange: () => Promise<void>): HTMLElement {
  const row = controlRow("导入 YDK 文件：");

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".ydk,text/plain";
  fileInput.className = "ydk-file-input";

  // 原生 file 输入自带“未选择任何文件”文案，没有选择器能把它单独去掉，
  // 所以把 input 藏进 label、由 label 充当按钮，文件名交给右侧提示文字承担
  const fileLabel = document.createElement("label");
  fileLabel.className = "builder-plain-btn ydk-file-label";
  fileLabel.textContent = "选择文件";
  fileLabel.appendChild(fileInput);

  const note = document.createElement("span");
  note.className = "builder-note";

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    note.textContent = "导入中…";
    try {
      const next = parseYdk(await file.text());
      const over = deckLimitError(next); // 超限则整份拒绝，当前构筑原样保留
      if (over) {
        reportImportFailure(note, `导入失败：${over}`);
      } else {
        overwriteDeck(deck, next);
        await onChange(); // 等卡片信息补齐、构筑预览重绘完再报“已导入”
        note.textContent = `已导入 ${file.name}`;
      }
    } catch (err) {
      reportImportFailure(note, `读取失败：${errText(err)}`);
    }
    fileInput.value = ""; // 清空，以便连续导入同一个文件
  });

  row.append(fileLabel, note);
  return row;
}

/** 2. 粘贴 ydk 文本，覆盖当前构筑 */
function buildTextImport(deck: DeckData, onChange: () => Promise<void>): HTMLElement {
  const row = controlRow("导入 YDK 文本：");

  const textarea = document.createElement("textarea");
  textarea.className = "ydk-text-input";
  textarea.placeholder = "粘贴 YDK 文本…";
  textarea.spellcheck = false;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "builder-plain-btn";
  btn.textContent = "导入文本";

  const note = document.createElement("span");
  note.className = "builder-note";

  btn.addEventListener("click", async () => {
    const text = textarea.value.trim();
    if (!text) {
      reportImportFailure(note, "请先粘贴 YDK 文本。");
      return;
    }
    const next = parseYdk(text);
    const over = deckLimitError(next); // 超限则整份拒绝，当前构筑原样保留
    if (over) {
      reportImportFailure(note, `导入失败：${over}`);
      return;
    }
    const total = next.main.length + next.extra.length + next.side.length;
    if (total === 0) {
      reportImportFailure(note, "未识别到卡片，请检查文本格式。");
      return;
    }
    overwriteDeck(deck, next);
    note.textContent = "导入中…";
    await onChange();
    note.textContent = `已导入 ${total} 张卡`;
  });

  row.append(textarea, btn, note);
  return row;
}

/** 3. 卡名检索：回车或点按钮发起请求，结果以浮层下拉展示 */
function buildCardSearch(deck: DeckData, onChange: () => void): HTMLElement {
  const row = controlRow("卡片搜索：");
  row.classList.add("builder-search"); // position: relative，供结果浮层定位

  const input = document.createElement("input");
  input.type = "search"; // 保留原生清除按钮（×）
  input.className = "deck-input";
  input.placeholder = "输入关键词后回车…";
  input.autocomplete = "off";
  input.spellcheck = false;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "builder-plain-btn";
  btn.textContent = "搜索";

  const panel = document.createElement("div");
  panel.className = "builder-results";
  panel.style.display = "none";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "deck-action-btn deck-action-clear";
  clearBtn.textContent = "清空构筑";
  clearBtn.addEventListener("click", () => {
    deck.main = [];
    deck.extra = [];
    deck.side = [];
    onChange();
    // 浮层里的步进器数字是按清空前的数量算的，onChange 只重绘展示区，
    // 索性把浮层收起来，下次搜索再重算
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
    showNote("搜索中…");
    try {
      const hits = await searchCards(query);
      if (hits.length === 0) {
        showNote("没有找到匹配的卡片。");
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
      showNote(`搜索失败：${errText(err)}`);
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
  info.textContent = "卡片信息";

  const cols = document.createElement("span");
  cols.className = "builder-cols";
  for (const title of ["主卡组", "副卡组"]) {
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

  const img = document.createElement("img");
  img.className = "deck-card-image"; // 卡图尺寸复用构筑预览的 60px*88px
  img.src = getCardImageUrl(hit.id, ENV);
  img.alt = hit.cn_name || hit.jp_name || String(hit.id);
  img.loading = "lazy";

  const meta = document.createElement("div");
  meta.className = "builder-result-meta";
  const cn = document.createElement("a");
  cn.className = "builder-result-cn";
  cn.href = getCardDetailUrl(hit.id);
  cn.target = "_blank";
  cn.rel = "noopener noreferrer";
  cn.textContent = hit.cn_name || "（无中文名）";
  const jp = document.createElement("span");
  jp.className = "builder-result-jp";
  jp.textContent = hit.jp_name || "（无日文名）";
  const idLine = document.createElement("span");
  idLine.className = "builder-result-id";
  idLine.textContent = String(hit.id);
  meta.append(cn, jp, idLine);

  // 融合/同调/超量/连接怪放不进主卡组，按卡片类型自动归到额外卡组
  const toExtra = isExtraDeckCard(hit);
  const primary = toExtra ? deck.extra : deck.main;
  const primaryLimit = toExtra ? DECK_LIMITS.extra : DECK_LIMITS.main;

  const cols = document.createElement("div");
  cols.className = "builder-cols";
  cols.append(
    buildStepper(primary, hit.id, primaryLimit, onChange),
    buildStepper(deck.side, hit.id, DECK_LIMITS.side, onChange)
  );

  li.append(img, meta, cols);
  return li;
}

/**
 * “+ 1 −”步进器：中间数字即该卡在所属区域中的数量，不可手动编辑。
 * 单卡上限 MAX_COPIES、下限 0，且整个区域不得超过 limit 张，到边界时按钮置灰。
 * onChange 只重绘构筑展示区，不会重绘本浮层，所以按钮状态就地更新。
 */
function buildStepper(
  section: number[],
  id: number,
  limit: number,
  onChange: () => void
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
    const count = section.filter((cardId) => cardId === id).length;
    num.textContent = String(count);
    minus.disabled = count === 0;
    plus.disabled = count >= MAX_COPIES || section.length >= limit;
  };

  minus.addEventListener("click", () => {
    const index = section.indexOf(id);
    if (index < 0) return;
    section.splice(index, 1);
    onChange();
    update();
  });

  plus.addEventListener("click", () => {
    if (section.length >= limit) return; // 区域已满
    if (section.filter((cardId) => cardId === id).length >= MAX_COPIES) return;
    section.push(id);
    onChange();
    update();
  });

  update();
  box.append(plus, num, minus);
  return box;
}

/** 4. 构筑展示：三个区域，点击单卡移除一张 */
function buildDeckSections(deck: DeckData, onChange: () => void): HTMLElement {
  const box = document.createElement("div");

  // 三个区域恒常显示（含数量 0），让用户始终看得到构筑的构成
  box.append(
    createDeckSection("主卡组", deck.main, ENV, (i) => {
      deck.main.splice(i, 1);
      onChange();
    }),
    createDeckSection("额外卡组", deck.extra, ENV, (i) => {
      deck.extra.splice(i, 1);
      onChange();
    }),
    createDeckSection("副卡组", deck.side, ENV, (i) => {
      deck.side.splice(i, 1);
      onChange();
    })
  );

  const note = document.createElement("p");
  note.className = "builder-note builder-deck-note";
  note.textContent = "点击卡片可将其从构筑中移除。";
  box.appendChild(note);

  return box;
}

/** 5. 导出：PDF 比赛卡表 + YDK 文件 */
function buildExportRow(deck: DeckData): HTMLElement {
  const row = document.createElement("div");
  row.className = "controls builder-export";

  const label = document.createElement("span");
  label.className = "controls-label";
  label.textContent = "请选择导出语言：";

  const note = document.createElement("span");
  note.className = "builder-note";

  const pdfBtn = document.createElement("button");
  pdfBtn.type = "button";
  pdfBtn.className = "deck-action-btn deck-action-pdf";
  pdfBtn.textContent = "导出为 PDF 比赛卡表";
  pdfBtn.addEventListener("click", async () => {
    if (isEmpty(deck)) {
      alert("构筑为空，请先导入或添加卡片。");
      return;
    }
    pdfBtn.disabled = true;
    // note.textContent = "生成中…";
    note.textContent = "";
    try {
      await exportDeckForm(deck, exportLang);
      note.textContent = "";
    } catch (err) {
      note.textContent = "";
      alert(`生成比赛卡表失败：${errText(err)}`);
    }
    pdfBtn.disabled = false;
  });

  const ydkBtn = document.createElement("button");
  ydkBtn.type = "button";
  ydkBtn.className = "builder-plain-btn"; // 白色，与“导入文本”“搜索”一致
  ydkBtn.textContent = "导出为 YDK 文件";
  ydkBtn.addEventListener("click", () => {
    if (isEmpty(deck)) {
      alert("构筑为空，请先导入或添加卡片。");
      return;
    }
    downloadDeckFile(deck);
  });

  row.append(label, buildLangDropdown(), pdfBtn, ydkBtn, note);
  return row;
}

function isEmpty(deck: DeckData): boolean {
  return deck.main.length + deck.extra.length + deck.side.length === 0;
}

/** 导出语言下拉，结构沿用主站的“选择比赛” */
function buildLangDropdown(): HTMLElement {
  const dropdown = document.createElement("div");
  dropdown.className = "match-dropdown";

  const btn = document.createElement("button");
  btn.className = "match-dropdown-btn";
  btn.type = "button";

  const setLabel = (): void => {
    const text = document.createElement("span");
    text.textContent = LANG_LABELS[exportLang];
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
  LANGS.forEach((lang) => {
    const li = document.createElement("li");
    if (lang === exportLang) li.classList.add("active");
    li.textContent = LANG_LABELS[lang];
    li.addEventListener("click", () => {
      exportLang = lang;
      setLabel();
      LANGS.forEach((each, i) => list.children[i].classList.toggle("active", each === lang));
      listWrap.style.display = "none";
      openLangList = null;
    });
    list.appendChild(li);
  });
  listWrap.appendChild(list);

  btn.addEventListener("click", (ev) => {
    ev.stopPropagation(); // 阻止冒泡到 document，否则会被“点击其他位置”的监听立即关闭
    const isOpen = listWrap.style.display === "block";
    if (openLangList && openLangList !== listWrap) openLangList.style.display = "none";
    listWrap.style.display = isOpen ? "none" : "block";
    openLangList = isOpen ? null : listWrap;
  });

  dropdown.append(btn, listWrap);
  return dropdown;
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
