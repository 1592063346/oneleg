import type { DeckCount, Match } from "./types.js";
import { totalDecks } from "./data.js";
import { seriesColor } from "./palette.js";
import { arcPath, el, polarToCartesian, svgRoot } from "./svg.js";
import { hideTooltip, showTooltip } from "./tooltip.js";

// 画布留出两侧空间给引导标签；饼图在画布中水平居中
const W = 760;
const H = 520;
const CX = W / 2;
const CY = H / 2;
const R = 175;
const OTHERS_LABEL = "others";

interface Slice {
  name: string;
  num: number;
  pct: number;
  start: number;
  end: number;
  color: string;
  isOthers: boolean;
}

interface Partition {
  /** 单独展示的卡组 */
  shown: DeckCount[];
  /** 归入 others 的卡组 */
  others: DeckCount[];
}

/**
 * 按数量从多到少分层统计：逐个"数量档位"尝试加入，
 * 若加入某档位后累计已 > 总数的 75%，则该档位及之后全部归入 others。
 * 若这样会导致无法展示任何具体卡组，则不做 others 划分（全部展示）。
 */
export function partitionDecks(decks: DeckCount[]): Partition {
  const total = decks.reduce((s, d) => s + d.num, 0);
  const sorted = [...decks].sort((a, b) => b.num - a.num);
  const threshold = (.75) * total;

  // 按数量分组为档位（数量降序）
  const tiers: DeckCount[][] = [];
  for (const d of sorted) {
    const last = tiers[tiers.length - 1];
    if (last && last[0].num === d.num) last.push(d);
    else tiers.push([d]);
  }

  const shown: DeckCount[] = [];
  let acc = 0;
  let cutAt = tiers.length; // 从该档位起归入 others
  for (let t = 0; t < tiers.length; t++) {
    const tierSum = tiers[t].reduce((s, d) => s + d.num, 0);
    if (acc + tierSum > threshold) {
      cutAt = t;
      break;
    }
    shown.push(...tiers[t]);
    acc += tierSum;
  }

  const others = tiers.slice(cutAt).flat();

  // 无法展示任何具体卡组时，不做 others 划分
  if (shown.length === 0) {
    return { shown: sorted, others: [] };
  }
  return { shown, others };
}

/**
 * 渲染某场比赛的卡组饼图分布。
 * colorMap 提供"卡组名 -> 固定色槽"，使颜色跟随卡组身份而非本场排名。
 * rankings 为排名信息（冠亚四强），合并到同一框内。
 */
export function renderPie(match: Match, colorMap: Map<string, number>, rankings?: HTMLElement): HTMLElement {
  const container = document.createElement("div");
  container.className = "pie-view-inner";

  const total = totalDecks(match);
  if (total === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "本场比赛暂无卡组数据。";
    container.appendChild(empty);
    return container;
  }

  const { shown, others } = partitionDecks(match.decks);
  const othersSum = others.reduce((s, d) => s + d.num, 0);

  // 组装扇区：先展示的卡组，最后（若有）others
  const slices: Slice[] = [];
  let angle = 0;
  const pushSlice = (name: string, num: number, color: string, isOthers: boolean) => {
    const pct = num / total;
    const sweep = pct * 360;
    slices.push({ name, num, pct, start: angle, end: angle + sweep, color, isOthers });
    angle += sweep;
  };
  for (const d of shown) {
    pushSlice(d.name, d.num, seriesColor(colorMap.get(d.name) ?? 0), false);
  }
  if (othersSum > 0) {
    pushSlice(OTHERS_LABEL, othersSum, othersColor(), true);
  }

  const chartTitle = document.createElement("h3");
  chartTitle.className = "pie-title";
  chartTitle.textContent = "比赛结果与环境分布";
  container.appendChild(chartTitle);

  // 排名信息（若有）插入饼图前，用短横线分隔
  if (rankings) {
    container.appendChild(rankings);
    const divider = document.createElement("hr");
    divider.className = "pie-divider";
    container.appendChild(divider);
  }

  const chartCol = document.createElement("div");
  chartCol.className = "pie-wrap";
  chartCol.style.position = "relative"; // 为导出按钮定位
  chartCol.setAttribute("data-export-target", "true"); // 标记饼图部分为可导出区域
  chartCol.appendChild(buildSvg(match, slices));
  container.appendChild(chartCol);

  // others 明细
  if (others.length > 0) {
    container.appendChild(buildOthersDetail(others, othersSum));
  }

  return container;
}

function buildSvg(match: Match, slices: Slice[]): SVGSVGElement {
  const svg = svgRoot(W, H);
  svg.setAttribute("aria-label", `${match.title} 卡组分布饼图`);
  const surface =
    getComputedStyle(document.documentElement).getPropertyValue("--surface-1").trim() ||
    "#fcfcfb";

  const defs = el("defs");
  svg.appendChild(defs);
  const uid = Math.random().toString(36).slice(2, 8);

  slices.forEach((s, i) => {
    const d = arcPath(CX, CY, R, s.start, s.end);
    const path = el("path", {
      d,
      fill: s.color,
      stroke: surface, // 2px 表面间隙分隔相邻扇区
      "stroke-width": 2,
      "stroke-linejoin": "round",
    });
    path.style.cursor = "default";
    path.style.transition = "opacity .12s ease";

    const move = (ev: MouseEvent) => {
      showTooltip(
        `<strong>${escapeHtml(s.name)}</strong><br>数量 ${s.num} · 占比 ${(s.pct * 100).toFixed(
          1
        )}%`,
        ev.clientX,
        ev.clientY
      );
    };
    path.addEventListener("mouseenter", (ev) => {
      path.style.opacity = "0.82";
      move(ev);
    });
    path.addEventListener("mousemove", move);
    path.addEventListener("mouseleave", () => {
      path.style.opacity = "1";
      hideTooltip();
    });
    svg.appendChild(path);

    // 饼块背景图：裁剪到扇形范围；图片中心对齐饼块质心，使可见部分居中；加载失败则移除，露出纯色
    const clipId = `slice-${uid}-${i}`;
    const clip = el("clipPath", { id: clipId });
    clip.appendChild(el("path", { d }));
    defs.appendChild(clip);

    // 扇形面积质心，位于角平分线上，距圆心 (2/3)R·sin(α)/α（α 为半张角）
    const mid = (s.start + s.end) / 2;
    const alpha = (((s.end - s.start) / 2) * Math.PI) / 180;
    const cDist = alpha > 1e-6 ? (2 / 3) * R * (Math.sin(alpha) / alpha) : (2 / 3) * R;
    const centroid = polarToCartesian(CX, CY, cDist, mid);

    // 图片尺寸：以质心为中心，取"质心到扇形所有边界点（含圆心尖端）的最大距离"的两倍，
    // 保证在图片中心对齐饼块质心的同时，仍完全覆盖整个饼块，不露出纯色。
    const half = wedgeMaxRadius(centroid, s.start, s.end);
    const size = half * 2;
    const image = el("image", {
      href: imageHref(s.name),
      x: centroid.x - half,
      y: centroid.y - half,
      width: size,
      height: size,
      preserveAspectRatio: "xMidYMid slice",
      "clip-path": `url(#${clipId})`,
      "pointer-events": "none",
    });
    // 兼容旧属性以防万一
    image.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", imageHref(s.name));
    // 加载失败（无对应图片）时移除图片，保留纯色底
    image.addEventListener("error", () => image.remove());
    svg.appendChild(image);
  });

  // 引导线标签：每块饼旁标注"名称 数量（占比）"
  drawLeaderLabels(svg, slices);
  return svg;
}

/** 从给定中心点到扇形所有边界点的最大距离（含圆心尖端与外弧采样），用于保证完全覆盖 */
function wedgeMaxRadius(
  from: { x: number; y: number },
  startAngle: number,
  endAngle: number
): number {
  const dist = (x: number, y: number) => Math.hypot(x - from.x, y - from.y);
  let max = dist(CX, CY); // 扇形尖端（圆心）
  const steps = 24;
  for (let k = 0; k <= steps; k++) {
    const a = startAngle + ((endAngle - startAngle) * k) / steps;
    const p = polarToCartesian(CX, CY, R, a);
    max = Math.max(max, dist(p.x, p.y));
  }
  return max;
}

const INK_PRIMARY = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--text-primary").trim() ||
  "#0b0b0b";
const INK_SECONDARY = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--text-secondary").trim() ||
  "#52514e";

/** 在每个饼块外侧用引导线引出文字标签 */
function drawLeaderLabels(svg: SVGSVGElement, slices: Slice[]): void {
  const leader = INK_SECONDARY();
  for (const s of slices) {
    const mid = (s.start + s.end) / 2;
    const right = mid <= 180; // 右半区标签朝右，左半区朝左
    // 引导线：从饼块边缘 -> 拐点 -> 水平延伸
    const p0 = polarToCartesian(CX, CY, R, mid);
    const p1 = polarToCartesian(CX, CY, R + 22, mid);
    const p2x = right ? p1.x + 26 : p1.x - 26;
    const textX = right ? p2x + 6 : p2x - 6;

    svg.appendChild(
      el("polyline", {
        points: `${p0.x.toFixed(1)},${p0.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(
          1
        )} ${p2x.toFixed(1)},${p1.y.toFixed(1)}`,
        fill: "none",
        stroke: leader,
        "stroke-width": 1,
        opacity: 0.6,
      })
    );
    svg.appendChild(
      el("circle", { cx: p0.x, cy: p0.y, r: 2.5, fill: s.color })
    );

    // 名称行
    const nameText = el(
      "text",
      {
        x: textX,
        y: p1.y - 6,
        "text-anchor": right ? "start" : "end",
        "dominant-baseline": "central",
        fill: INK_PRIMARY(),
        "font-size": 14,
        "font-weight": 600,
      },
      [s.name]
    );
    // 数量与占比行
    const valText = el(
      "text",
      {
        x: textX,
        y: p1.y + 10,
        "text-anchor": right ? "start" : "end",
        "dominant-baseline": "central",
        fill: leader,
        "font-size": 12,
      },
      [`${s.num}（${(s.pct * 100).toFixed(1)}%）`]
    );
    svg.appendChild(nameText);
    svg.appendChild(valText);
  }
}

function buildOthersDetail(others: DeckCount[], othersSum: number): HTMLElement {
  const box = document.createElement("div");
  box.className = "others-detail";
  const h = document.createElement("h3");
  h.textContent = `others 详情（共 ${others.length} 种 / ${othersSum} 个卡组）`;
  box.appendChild(h);

  const list = document.createElement("ul");
  list.className = "others-list";
  for (const d of [...others].sort((a, b) => b.num - a.num || a.name.localeCompare(b.name))) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${escapeHtml(d.name)}</span><span class="others-num">${d.num}</span>`;
    list.appendChild(li);
  }
  box.appendChild(list);
  return box;
}

function othersColor(): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#898781"
  );
}

/** 卡组对应背景图路径（pic 文件夹，按名称查找；others 亦适用） */
function imageHref(name: string): string {
  return `./pic/${encodeURIComponent(name)}.png`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}
