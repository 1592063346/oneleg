// 卡组文件解析、展示与排序
// 单张卡片展示大小为 60px*88px，index.html 里的 .deck-card-image 有相同配置

import type { DeckData } from "../core/types.js";
import { TYPE, cachedCardInfo, type CardInfo } from "./cards.js";

/** 各区域的卡片数量上限 */
export const DECK_LIMITS = { main: 60, extra: 15, side: 15 } as const;

/**
 * 校验各区域数量是否超限（导入的 ydk 不受本页输入约束，故单独检查）。
 * 超限时返回可直接展示的提示文字，正常返回 null。
 */
export function deckLimitError(deck: DeckData): string | null {
  const sections: Array<[string, number, number]> = [
    ["主卡组", deck.main.length, DECK_LIMITS.main],
    ["额外卡组", deck.extra.length, DECK_LIMITS.extra],
    ["副卡组", deck.side.length, DECK_LIMITS.side],
  ];
  for (const [title, count, limit] of sections) {
    if (count > limit) return `${title} ${count} 张，超过 ${limit} 张上限`;
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

/** 主卡组、额外卡组、副卡组分别排序 */
export function sortDeck(deck: DeckData): void {
  for (const section of [deck.main, deck.extra, deck.side]) {
    section.sort(compareCards);
  }
}

function compareCards(a: number, b: number): number {
  const ka = sortKeyOf(a, cachedCardInfo(a));
  const kb = sortKeyOf(b, cachedCardInfo(b));
  if (ka.group !== kb.group) return ka.group - kb.group;
  if (ka.kind !== kb.kind) return ka.kind - kb.kind;
  // 星级/阶级由高到低。连接怪兽的 level 即连接标记数（接口对两者用同一字段），
  // 所以连接怪之间也就自动按标记数从大到小排了。
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
    if (!isNaN(cardId) && cardId >= 1 && cardId <= 99999999) {
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

/**
 * 获取卡片缩略图 URL
 * env 为卡图环境："sc" 使用简中卡图，其余（默认 ocg）使用日文卡图
 */
export function getCardImageUrl(cardId: number, env: string = "ocg"): string {
  const REGION_MAP: Record<string, string> = {
    ocg: 'jp',
    sc: 'sc',
    tcg: 'en',
  };

  const region = REGION_MAP[env];
  return `https://cdn.233.momobako.com/ygoimg/${region}/${cardId}.webp!half`;
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
  const maxCards = Math.max(deck.main.length, deck.extra.length, deck.side.length);
  const cardsPerRow = Math.max(8, Math.min(maxCards, 10));
  const contentWidth = cardsPerRow * 60 + 68;
  content.style.width = `${contentWidth}px`;
  content.style.maxWidth = '90%';

  // 标题栏
  const header = document.createElement('div');
  header.className = 'deck-modal-header';
  const title = document.createElement('h3');
  title.textContent = '构筑预览';

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'deck-download-btn';
  downloadBtn.textContent = '下载构筑 YDK 文件';
  downloadBtn.addEventListener('click', () => {
    downloadDeckFile(deck);
  });

  const closeBtn = document.createElement('button');
  closeBtn.className = 'deck-modal-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => {
    document.body.style.overflow = '';
    modal.remove();
  });
  header.append(title, downloadBtn, closeBtn);

  const body = document.createElement('div');
  body.className = 'deck-modal-body';

  // 主卡组
  if (deck.main.length > 0) {
    body.appendChild(createDeckSection('主卡组', deck.main, env));
  }

  // 额外卡组
  if (deck.extra.length > 0) {
    body.appendChild(createDeckSection('额外卡组', deck.extra, env));
  }

  // 副卡组
  if (deck.side.length > 0) {
    body.appendChild(createDeckSection('副卡组', deck.side, env));
  }

  content.append(header, body);
  modal.append(overlay, content);

  return modal;
}

/**
 * 创建卡组区域（主卡组/额外卡组/副卡组）
 * 传入 onCardClick 时，每张卡改为可点击的按钮（点击回调收到该卡在本区域中的下标）；
 * 否则为跳转卡片详情页的链接。
 */
export function createDeckSection(
  title: string,
  cardIds: number[],
  env: string = "ocg",
  onCardClick?: (index: number) => void
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
      btn.title = '点击移除一张';
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
    img.src = getCardImageUrl(cardId, env);
    img.alt = `Card ${cardId}`;
    img.className = 'deck-card-image';
    img.loading = 'lazy';

    card.appendChild(img);
    grid.appendChild(card);
  });

  section.append(header, grid);
  return section;
}
