// 卡组文件解析和展示
// 单张卡片展示大小为 60px*88px，index.html 里的 .deck-card-image 有相同配置

export interface DeckData {
  main: number[];
  extra: number[];
  side: number[];
  fileName?: string; // 用于下载时的文件名
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
 * 下载卡组文件
 */
function downloadDeckFile(deck: DeckData): void {
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

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'deck-download-btn';
  downloadBtn.textContent = '下载构筑文件';
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
