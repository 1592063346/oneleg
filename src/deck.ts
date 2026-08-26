// 卡组文件解析和展示
// 单张卡片展示大小为 60px*88px，index.html 里的 .deck-card-image 有相同配置

export interface DeckData {
  main: number[];
  extra: number[];
  side: number[];
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
 */
export async function loadDeckFile(date: string, playerName: string): Promise<DeckData | null> {
  const filename = `${date.replace(/-/g, '')}_${playerName}`;

  // 检查是否有内联数据（打包后会挂载到 window.__DECK_MAP__）
  const deckMap = (window as any).__DECK_MAP__;
  if (deckMap && deckMap[filename]) {
    return parseYdk(deckMap[filename]);
  }

  // 回退到 fetch（开发模式）
  try {
    const response = await fetch(`./data/deck/${encodeURIComponent(filename)}.ydk`);
    if (!response.ok) {
      console.warn(`Failed to load deck file: ${filename}.ydk`);
      return null;
    }
    const content = await response.text();
    return parseYdk(content);
  } catch (err) {
    console.error('Error loading deck file:', err);
    return null;
  }
}

/**
 * 获取卡片缩略图 URL
 */
function getCardImageUrl(cardId: number): string {
  return `https://cdn.233.momobako.com/ygoimg/jp/${cardId}.webp!half`;
}

/**
 * 获取卡片详情页 URL
 */
function getCardDetailUrl(cardId: number): string {
  return `https://ygocdb.com/card/${cardId}`;
}

/**
 * 创建卡组展示弹窗
 */
export function createDeckModal(deck: DeckData): HTMLElement {
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

  // 计算最大卡片数量，用于确定弹窗宽度
  const maxCards = Math.max(deck.main.length, deck.extra.length, deck.side.length);
  // 限制在 8-10 列之间
  const cardsPerRow = Math.max(8, Math.min(maxCards, 10));
  // 每张卡 60px，加上内边距
  const contentWidth = cardsPerRow * 60 + 24 * 2;
  content.style.width = `${contentWidth}px`;
  content.style.maxWidth = '90%';

  // 标题栏
  const header = document.createElement('div');
  header.className = 'deck-modal-header';
  const title = document.createElement('h3');
  title.textContent = '构筑预览';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'deck-modal-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => {
    document.body.style.overflow = '';
    modal.remove();
  });
  header.append(title, closeBtn);

  const body = document.createElement('div');
  body.className = 'deck-modal-body';

  // 主卡组
  if (deck.main.length > 0) {
    body.appendChild(createDeckSection('主卡组', deck.main));
  }

  // 额外卡组
  if (deck.extra.length > 0) {
    body.appendChild(createDeckSection('额外卡组', deck.extra));
  }

  // 副卡组
  if (deck.side.length > 0) {
    body.appendChild(createDeckSection('副卡组', deck.side));
  }

  content.append(header, body);
  modal.append(overlay, content);

  return modal;
}

/**
 * 创建卡组区域（主卡组/额外卡组/副卡组）
 */
function createDeckSection(title: string, cardIds: number[]): HTMLElement {
  const section = document.createElement('div');
  section.className = 'deck-section';

  const header = document.createElement('div');
  header.className = 'deck-section-header';
  header.innerHTML = `<strong>${title}</strong> <span class="deck-count">(${cardIds.length})</span>`;

  const grid = document.createElement('div');
  grid.className = 'deck-grid';

  for (const cardId of cardIds) {
    const link = document.createElement('a');
    link.href = getCardDetailUrl(cardId);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'deck-card-link';

    const img = document.createElement('img');
    img.src = getCardImageUrl(cardId);
    img.alt = `Card ${cardId}`;
    img.className = 'deck-card-image';
    img.loading = 'lazy';

    link.appendChild(img);
    grid.appendChild(link);
  }

  section.append(header, grid);
  return section;
}
