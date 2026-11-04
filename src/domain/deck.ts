// 卡组文件解析、展示与排序
// 单张卡片展示大小为 60px*88px，index.html 里的 .deck-card-image 有相同配置

import type { DeckData } from "../core/types.js";
import { t } from "../core/i18n.js";
import { TYPE, absentCard, cachedCardInfo, originalCardId, type CardInfo } from "./cards.js";

/** 各区域的卡片数量上限 */
export const DECK_LIMITS = { main: 60, extra: 15, side: 15 } as const;

/** 官方卡片密码的上限 */
export const OFFICIAL_ID_MAX = 99999999;

/**
 * 先行卡临时编号的上限，有效区间为 OFFICIAL_ID_MAX + 1 ~ 本值。
 * 先行卡指已公布信息但尚未发售的卡，数据库先给它一个该区间内的临时编号，
 * 发售后再换成官方密码（见 cards.ts 的 aliases 与 normalizeDeckIds）。
 */
export const PRE_RELEASE_ID_MAX = 199999999;

/**
 * 校验各区域数量是否超限（导入的 ydk 不受本页输入约束，故单独检查）。
 * 超限时返回可直接展示的提示文字，正常返回 null。
 */
export function deckLimitError(deck: DeckData): string | null {
  const sections: Array<[string, number, number]> = [
    [t("deck.main"), deck.main.length, DECK_LIMITS.main],
    [t("deck.extra"), deck.extra.length, DECK_LIMITS.extra],
    [t("deck.side"), deck.side.length, DECK_LIMITS.side],
  ];
  for (const [title, count, limit] of sections) {
    if (count > limit) return t("deck.overLimit", { title, count, limit });
  }
  return null;
}

/** 空卡组：构筑导出站的初始状态（导出文件名固定为 deck.ydk） */
export function createEmptyDeck(): DeckData {
  return { main: [], extra: [], side: [], fileName: "deck" };
}

// ---- 构筑排序：主卡组、额外卡组、副卡组各自独立，规则相同 ----
// 卡片类型与星级来自卡片信息缓存（见 cards.ts）

/** 大类顺序：怪兽 > 魔法 > 陷阱 */
const GROUP_MONSTER = 0;
const GROUP_SPELL = 1;
const GROUP_TRAP = 2;
/** 取不到卡片数据的排在各部分最后 */
const GROUP_UNKNOWN = 3;

/** 位掩码 -> 同级内的类别序号；未命中任何位即 0（通常怪兽、通常魔法、通常陷阱） */
type KindTable = Array<[number, number]>;

/** 怪兽同星级时的类别顺序：效果 > 融合 > 同调 > 超量 > 连接 */
const MONSTER_KINDS: KindTable = [
  [TYPE.fusion, 1],
  [TYPE.synchro, 2],
  [TYPE.xyz, 3],
  [TYPE.link, 4],
];

/** 魔法顺序：通常 > 速攻 > 永续 > 装备 > 场地 */
const SPELL_KINDS: KindTable = [
  [TYPE.quickPlay, 1],
  [TYPE.continuous, 2],
  [TYPE.equip, 3],
  [TYPE.field, 4],
];

/** 陷阱顺序：通常 > 永续 > 反击 */
const TRAP_KINDS: KindTable = [
  [TYPE.continuous, 1],
  [TYPE.counter, 2],
];

interface SortKey {
  group: number;
  kind: number;
  level: number; // 星级/阶级，降序
  id: number;
}

/**
 * 把构筑中的异画 id 换回原画 id（原地修改）。
 * ydk 里记的可能是异画 id，而卡片信息、排序、卡表导出都只认原画 id。
 * 依赖卡片信息缓存，须先 await cacheCardInfos。
 */
export function normalizeDeckIds(deck: DeckData): void {
  for (const section of [deck.main, deck.extra, deck.side]) {
    for (let i = 0; i < section.length; i++) section[i] = originalCardId(section[i]);
  }
}

/**
 * 剔除数据库里查不到的卡（原地修改）：卡号范围合法并不代表这张卡存在，
 * 构筑里出现的非法卡号一律当作没导入过。
 * 依赖卡片信息缓存，须先 await cacheCardInfos：只有查过的卡号才谈得上查不到，
 * 尚未查询与请求失败的不会进 absent，也就不会被误剔。
 */
export function dropAbsentCards(deck: DeckData): void {
  for (const section of [deck.main, deck.extra, deck.side]) {
    for (let i = section.length - 1; i >= 0; i--) {
      if (absentCard(section[i])) section.splice(i, 1);
    }
  }
}

/** 主卡组、额外卡组、副卡组分别排序 */
export function sortDeck(deck: DeckData): void {
  for (const section of [deck.main, deck.extra, deck.side]) {
    section.sort(compareCards);
  }
}

/** 按构筑展示的排序规则排序一组卡片 id，返回新数组 */
export function sortCardIds(ids: number[]): number[] {
  return [...ids].sort(compareCards);
}

function compareCards(a: number, b: number): number {
  const ka = sortKeyOf(a, cachedCardInfo(a));
  const kb = sortKeyOf(b, cachedCardInfo(b));
  if (ka.group !== kb.group) return ka.group - kb.group;
  if (ka.kind !== kb.kind) return ka.kind - kb.kind;
  // 星级/阶级由高到低。连接怪兽的 level 即连接标记数（接口对两者用同一字段），
  // 因此连接怪之间也按标记数从大到小排列。
  if (ka.level !== kb.level) return kb.level - ka.level;
  return ka.id - kb.id; // 同级同类按 id 升序
}

function sortKeyOf(id: number, info: CardInfo | undefined): SortKey {
  if (!info) return { group: GROUP_UNKNOWN, kind: 0, level: 0, id };
  if (info.type & TYPE.monster) {
    return {
      group: GROUP_MONSTER,
      kind: kindOf(info.type, MONSTER_KINDS),
      level: info.level,
      id,
    };
  }
  if (info.type & TYPE.spell) {
    return { group: GROUP_SPELL, kind: kindOf(info.type, SPELL_KINDS), level: 0, id };
  }
  if (info.type & TYPE.trap) {
    return { group: GROUP_TRAP, kind: kindOf(info.type, TRAP_KINDS), level: 0, id };
  }
  return { group: GROUP_UNKNOWN, kind: 0, level: 0, id };
}

function kindOf(type: number, table: KindTable): number {
  for (const [bit, kind] of table) {
    if (type & bit) return kind;
  }
  return 0;
}

/**
 * 解析 .ydk 文件内容
 */
export function parseYdk(content: string): DeckData {
  const lines = content.trim().split('\n').map(line => line.trim()).filter(line => line);

  const deck: DeckData = {
    main: [],
    extra: [],
    side: []
  };

  let currentSection: 'main' | 'extra' | 'side' | null = null;

  for (const line of lines) {
    if (line.startsWith('#created by') || line.startsWith('#')) {
      if (line === '#main') {
        currentSection = 'main';
      } else if (line === '#extra') {
        currentSection = 'extra';
      }
      continue;
    }

    if (line.startsWith('!side')) {
      currentSection = 'side';
      continue;
    }

    // 解析卡片 ID
    const cardId = parseInt(line, 10);
    if (!isNaN(cardId) && cardId >= 1 && cardId <= PRE_RELEASE_ID_MAX) {
      if (currentSection) {
        deck[currentSection].push(cardId);
      }
    }
  }

  return deck;
}

/**
 * 加载卡组文件
 * dir 为卡组文件夹路径（主站 ./data/deck，分站 ./data/event_deck）
 */
export async function loadDeckFile(
  date: string,
  playerName: string,
  dir: string = "./data/deck"
): Promise<DeckData | null> {
  const filename = `${date.replace(/\//g, '')}_${playerName}`;

  try {
    const response = await fetch(`${dir}/${encodeURIComponent(filename)}.ydk`);
    if (!response.ok) {
      console.warn(`Failed to load deck file: ${filename}.ydk`);
      return null;
    }
    const content = await response.text();
    const deck = parseYdk(content);
    deck.fileName = filename;
    return deck;
  } catch (err) {
    console.error('Error loading deck file:', err);
    return null;
  }
}

const REGION_MAP: Record<string, string> = {
  ocg: 'jp',
  sc: 'sc',
  tcg: 'en',
};

const ID_CHANGELOG_URL = 'https://ygocdb.com/api/v0/idChangelog.jsonp';

interface IdChangelog {
  /** 先行编号 -> 官方密码 */
  preToOfficial: Map<number, number>;
  /** 官方密码 -> 先行编号 */
  officialToPre: Map<number, number>;
}

let idChangelog: Promise<IdChangelog> | null = null;

/** 先行编号与官方密码的对照表；请求失败时按空表处理 */
function loadIdChangelog(): Promise<IdChangelog> {
  if (!idChangelog) {
    idChangelog = fetch(ID_CHANGELOG_URL)
      .then((res) => (res.ok ? res.json() : {}))
      .then((raw) => {
        const preToOfficial = new Map<number, number>();
        const officialToPre = new Map<number, number>();
        for (const [pre, official] of Object.entries(raw as Record<string, number>)) {
          const preId = Number(pre);
          preToOfficial.set(preId, official);
          officialToPre.set(official, preId);
        }
        return { preToOfficial, officialToPre };
      })
      .catch(() => ({
        preToOfficial: new Map<number, number>(),
        officialToPre: new Map<number, number>(),
      }));
  }
  return idChangelog;
}

/** 卡图是否可取：该 CDN 不返回 CORS 头，只能用 Image 探测 */
const imageLoadable = new Map<string, Promise<boolean>>();

function canLoadImage(url: string): Promise<boolean> {
  let pending = imageLoadable.get(url);
  if (!pending) {
    pending = new Promise<boolean>((resolve) => {
      const img = new Image();
      img.addEventListener('load', () => resolve(true), { once: true });
      img.addEventListener('error', () => resolve(false), { once: true });
      img.src = url;
    });
    imageLoadable.set(url, pending);
  }
  return pending;
}

const momobakoUrl = (id: number, env: string): string =>
  `https://cdn.233.momobako.com/ygoimg/${REGION_MAP[env]}/${id}.webp!half`;

const moecubeUrl = (id: number): string =>
  `https://cdntx.moecube.com/ygopro-super-pre/data/pics/${id}.jpg`;

/**
 * 获取卡片缩略图 URL。
 * 优先常规图库；常规图库缺图时，官方密码反查先行编号，先行编号则退回临时编号的卡图。
 */
export async function getCardImageUrl(cardId: number, env: string = "ocg"): Promise<string> {
  if (cardId > OFFICIAL_ID_MAX) {
    // 卡片信息已查询过时，别名里直接有官方密码，无需再取对照表
    const knownOfficial = originalCardId(cardId);
    const officialId = knownOfficial <= OFFICIAL_ID_MAX
      ? knownOfficial
      : (await loadIdChangelog()).preToOfficial.get(cardId);
    if (officialId === undefined) return moecubeUrl(cardId);
    const officialUrl = momobakoUrl(officialId, env);
    return (await canLoadImage(officialUrl)) ? officialUrl : moecubeUrl(cardId);
  }

  const officialUrl = momobakoUrl(cardId, env);
  if (await canLoadImage(officialUrl)) return officialUrl;

  const { officialToPre } = await loadIdChangelog();
  const preId = officialToPre.get(cardId);
  return moecubeUrl(preId ?? cardId);
}

/** 卡图取不到时的占位图 */
const UNKNOWN_IMAGE = './sources/unknown.jpg';

/** 设置卡图，并挂上加载失败的兜底 */
export function setCardImage(img: HTMLImageElement, cardId: number, env: string = "ocg"): void {
  // 先设置一个可立即显示的地址，避免等待地址解析期间元素处于无图状态
  const provisional = cardId > OFFICIAL_ID_MAX ? moecubeUrl(cardId) : momobakoUrl(cardId, env);

  let generation = 0;
  let placeholder = false;

  // 换源后旧请求的迟到错误不再处理
  const setSrc = (url: string, onError?: () => void): void => {
    const gen = ++generation;
    if (onError) {
      img.addEventListener('error', () => {
        if (gen === generation) onError();
      }, { once: true });
    }
    img.src = url;
  };

  const showPlaceholder = (): void => {
    if (placeholder) return;
    placeholder = true;
    setSrc(UNKNOWN_IMAGE);
  };

  setSrc(provisional, showPlaceholder);

  void getCardImageUrl(cardId, env).then(async (url) => {
    if (url === provisional) return;
    // 确认新地址可取后再切换，避免切换过程中再次出现破图
    if (!(await canLoadImage(url))) return;
    placeholder = false;
    setSrc(url, showPlaceholder);
  });
}

/**
 * 获取卡片详情页 URL
 */
export function getCardDetailUrl(cardId: number): string {
  return `https://ygocdb.com/card/${cardId}`;
}

/**
 * 下载卡组文件
 */
export function downloadDeckFile(deck: DeckData): void {
  // 构建 YDK 文件内容
  let ydkContent = '#created by ...\n';

  // 主卡组
  ydkContent += '#main\n';
  deck.main.forEach(cardId => {
    ydkContent += `${cardId}\n`;
  });

  // 额外卡组
  ydkContent += '#extra\n';
  deck.extra.forEach(cardId => {
    ydkContent += `${cardId}\n`;
  });

  // 副卡组
  ydkContent += '!side\n';
  deck.side.forEach(cardId => {
    ydkContent += `${cardId}\n`;
  });

  // 创建 Blob 并触发下载
  const blob = new Blob([ydkContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${deck.fileName || 'deck'}.ydk`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 创建卡组展示弹窗
 */
export function createDeckModal(deck: DeckData, env: string = "ocg"): HTMLElement {
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'deck-download-btn';
  downloadBtn.textContent = t('deck.downloadYdk');
  downloadBtn.addEventListener('click', () => {
    downloadDeckFile(deck);
  });

  return createCardModal(
    t('deck.preview'),
    [
      [t('deck.main'), deck.main],
      [t('deck.extra'), deck.extra],
      [t('deck.side'), deck.side],
    ],
    env,
    downloadBtn
  );
}

/**
 * 通用卡片展示弹窗（构筑预览、禁限卡表查看共用）
 * sections 为 [区域名, 卡片 id 列表]，列表为空的区域不显示；
 * extraHeader 为标题栏里追加的按钮，可省略。
 */
export function createCardModal(
  title: string,
  sections: Array<[string, number[]]>,
  env: string = "ocg",
  extraHeader?: HTMLElement
): HTMLElement {
  const modal = document.createElement('div');
  modal.className = 'deck-modal';

  // 禁止背景页面滚动
  document.body.style.overflow = 'hidden';

  const overlay = document.createElement('div');
  overlay.className = 'deck-modal-overlay';
  overlay.addEventListener('click', () => {
    document.body.style.overflow = '';
    modal.remove();
  });

  const content = document.createElement('div');
  content.className = 'deck-modal-content';

  // 确定弹窗宽度，每张卡 60px
  const maxCards = Math.max(0, ...sections.map(([, ids]) => ids.length));
  const cardsPerRow = Math.max(8, Math.min(maxCards, 10));
  const contentWidth = cardsPerRow * 60 + 68;
  content.style.width = `${contentWidth}px`;
  content.style.maxWidth = '90%';

  // 标题栏
  const header = document.createElement('div');
  header.className = 'deck-modal-header';
  const heading = document.createElement('h3');
  heading.textContent = title;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'deck-modal-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => {
    document.body.style.overflow = '';
    modal.remove();
  });
  header.append(heading, ...(extraHeader ? [extraHeader] : []), closeBtn);

  const body = document.createElement('div');
  body.className = 'deck-modal-body';
  for (const [name, ids] of sections) {
    if (ids.length > 0) body.appendChild(createDeckSection(name, ids, env));
  }

  content.append(header, body);
  modal.append(overlay, content);

  return modal;
}

/**
 * 创建卡组区域（主卡组/额外卡组/副卡组）
 * 传入 onCardClick 时，每张卡改为可点击的按钮（点击回调收到该卡在本区域中的下标）；
 * 否则为跳转卡片详情页的链接。
 * limits 为当前适用的禁限卡表（卡片 id -> 允许投入张数），传入后卡图右上角带禁限角标。
 */
export function createDeckSection(
  title: string,
  cardIds: number[],
  env: string = "ocg",
  onCardClick?: (index: number) => void,
  limits?: Record<string, number> | null
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'deck-section';

  const header = document.createElement('div');
  header.className = 'deck-section-header';
  header.innerHTML = `<strong>${title}</strong> <span class="deck-count">(${cardIds.length})</span>`;

  const grid = document.createElement('div');
  grid.className = 'deck-grid';

  cardIds.forEach((cardId, index) => {
    let card: HTMLElement;
    if (onCardClick) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'deck-card-link deck-card-remove';
      btn.title = t('deck.removeHint');
      btn.addEventListener('click', () => onCardClick(index));
      card = btn;
    } else {
      const link = document.createElement('a');
      link.href = getCardDetailUrl(cardId);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'deck-card-link';
      card = link;
    }

    const img = document.createElement('img');
    img.alt = `Card ${cardId}`;
    img.className = 'deck-card-image';
    img.loading = 'lazy';
    setCardImage(img, cardId, env);

    card.appendChild(img);

    const rank = limits?.[String(cardId)];
    if (rank !== undefined) card.appendChild(buildLimitBadge(rank));

    grid.appendChild(card);
  });

  section.append(header, grid);
  return section;
}

/** 卡图右上角的禁限标记：0 禁止（斜杠）/ 1 限制 / 2 准限制 */
function buildLimitBadge(rank: number): HTMLElement {
  const kind = rank === 0 ? 'forbidden' : rank === 1 ? 'limited' : 'semi';
  const badge = document.createElement('span');
  badge.className = `deck-limit deck-limit-${kind}`;
  badge.textContent = rank === 0 ? '' : String(rank);
  badge.title = t(rank === 0 ? 'limit.forbidden' : rank === 1 ? 'limit.limited' : 'limit.semiLimited');
  return badge;
}
