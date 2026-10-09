import type { Match } from "../core/types.js";
import { deckCountIn } from "../core/data.js";
import { escapeHtml } from "../core/html.js";
import { deckName, t } from "../core/i18n.js";
import { seriesColor } from "../core/palette.js";
import { el, svgRoot } from "./svg.js";
import { hideTooltip, showTooltip } from "./tooltip.js";

const H = 460;
const M = { top: 24, right: 60, bottom: 72, left: 48 };
const PLOT_H = H - M.top - M.bottom;
const MIN_PLOT_W = 712;
const MIN_STEP = 56;

interface SeriesPoint {
  x: number;
  y: number;
  value: number;
  date: string;
}
interface Series {
  name: string;
  colorIndex: number;
  points: SeriesPoint[];
}

/**
 * 渲染所选卡组在各场比赛中的数量折线趋势（多卡组同图）。
 * selected 为要绘制的卡组名列表；colorMap 提供固定色槽。
 */
export function renderLine(
  matches: Match[],
  selected: string[],
  colorMap: Map<string, number>
): HTMLElement {
  const container = document.createElement("div");
  container.className = "line-wrap";

  if (selected.length === 0) {
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = t("line.empty");
    container.appendChild(note);
    return container;
  }

  // Y 轴上界：所选卡组在所有比赛中的最大数量
  let maxVal = 0;
  for (const name of selected) {
    for (const m of matches) maxVal = Math.max(maxVal, deckCountIn(m, name));
  }
  const yMax = Math.max(1, maxVal);

  // 画布不随页面宽度缩放：高度固定，宽度按比赛数排布，放不下时由外层横向滚动
  const n = matches.length;
  const plotW = Math.max(MIN_PLOT_W, (n - 1) * MIN_STEP);
  const W = M.left + M.right + plotW;

  const xAt = (i: number): number =>
    M.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v: number): number => M.top + PLOT_H - (v / yMax) * PLOT_H;

  const series: Series[] = selected.map((name) => ({
    name,
    colorIndex: colorMap.get(name) ?? 0,
    points: matches.map((m, i) => ({
      x: xAt(i),
      y: yAt(deckCountIn(m, name)),
      value: deckCountIn(m, name),
      date: m.date,
    })),
  }));

  const svg = svgRoot(W, H);
  // 按画布自身的尺寸绘制，不用 CSS 缩放：页面再窄也不会把它压小
  svg.style.width = `${W}px`;
  svg.style.height = `${H}px`;
  svg.setAttribute("aria-label", t("line.aria"));

  drawGridAndAxes(svg, matches, yMax, xAt, yAt, plotW);
  drawSeries(svg, series);
  attachHover(svg, matches, series, xAt, plotW, W);

  const scroll = document.createElement("div");
  scroll.className = "line-scroll";
  scroll.appendChild(svg);

  container.append(scroll, buildLegend(series));
  enableDragPan(scroll);
  return container;
}

function cssVar(name: string, fallback: string): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
  );
}

function drawGridAndAxes(
  svg: SVGSVGElement,
  matches: Match[],
  yMax: number,
  xAt: (i: number) => number,
  yAt: (v: number) => number,
  plotW: number
): void {
  const grid = cssVar("--grid", "#e1e0d9");
  const axis = cssVar("--baseline", "#c3c2b7");
  const muted = cssVar("--muted", "#898781");

  // Y 轴刻度：整数步长，最多约 6 条
  const step = Math.max(1, Math.ceil(yMax / 5));
  for (let v = 0; v <= yMax; v += step) {
    const y = yAt(v);
    svg.appendChild(
      el("line", {
        x1: M.left,
        y1: y,
        x2: M.left + plotW,
        y2: y,
        stroke: v === 0 ? axis : grid,
        "stroke-width": 1,
      })
    );
    svg.appendChild(
      el(
        "text",
        {
          x: M.left - 10,
          y,
          "text-anchor": "end",
          "dominant-baseline": "central",
          fill: muted,
          "font-size": 12,
          "font-variant-numeric": "tabular-nums",
        },
        [String(v)]
      )
    );
  }

  // X 轴日期标签（斜向排列避免重叠）
  matches.forEach((m, i) => {
    const x = xAt(i);
    const label = el(
      "text",
      {
        x,
        y: M.top + PLOT_H + 12,
        "text-anchor": "start",
        fill: muted,
        "font-size": 12,
        transform: `rotate(45, ${x}, ${M.top + PLOT_H + 12})`,
      },
      [m.date]
    );
    svg.appendChild(label);
  });
}

function drawSeries(svg: SVGSVGElement, series: Series[]): void {
  const surface = cssVar("--surface-1", "#fcfcfb");
  for (const s of series) {
    const color = seriesColor(s.colorIndex);
    const d = s.points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
    svg.appendChild(
      el("path", {
        d,
        fill: "none",
        stroke: color,
        "stroke-width": 2,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      })
    );
    // 数据点标记，2px 表面描边分隔重叠
    for (const p of s.points) {
      svg.appendChild(
        el("circle", {
          cx: p.x,
          cy: p.y,
          r: 4.5,
          fill: color,
          stroke: surface,
          "stroke-width": 2,
        })
      );
    }
  }
}
function attachHover(
  svg: SVGSVGElement,
  matches: Match[],
  series: Series[],
  xAt: (i: number) => number,
  plotW: number,
  canvasW: number
): void {
  const n = matches.length;
  if (n === 0) return;
  const muted = cssVar("--baseline", "#c3c2b7");

  const crosshair = el("line", {
    x1: 0,
    y1: M.top,
    x2: 0,
    y2: M.top + PLOT_H,
    stroke: muted,
    "stroke-width": 1,
    "stroke-dasharray": "4 4",
    opacity: 0,
  });
  svg.appendChild(crosshair);

  const overlay = el("rect", {
    x: M.left,
    y: M.top,
    width: plotW,
    height: PLOT_H,
    fill: "transparent",
  });

  const nearestIndex = (svgX: number): number => {
    if (n <= 1) return 0;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(xAt(i) - svgX);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  };

  const onMove = (ev: MouseEvent) => {
    const rect = svg.getBoundingClientRect();
    // 将屏幕坐标映射回 viewBox 坐标
    const svgX = ((ev.clientX - rect.left) / rect.width) * canvasW;
    const i = nearestIndex(svgX);
    const cx = xAt(i);
    crosshair.setAttribute("x1", String(cx));
    crosshair.setAttribute("x2", String(cx));
    crosshair.setAttribute("opacity", "1");

    const rows = series
      .map((s) => {
        const c = seriesColor(s.colorIndex);
        return `<div class="tt-row"><span class="tt-dot" style="background:${c}"></span>${escapeHtml(
          deckName(s.name)
        )}<span class="tt-num">${s.points[i].value}</span></div>`;
      })
      .join("");
    showTooltip(
      `<strong>${matches[i].date}</strong>${rows}`,
      ev.clientX,
      ev.clientY
    );
  };

  overlay.addEventListener("mousemove", onMove);
  overlay.addEventListener("mouseleave", () => {
    crosshair.setAttribute("opacity", "0");
    hideTooltip();
  });
  svg.appendChild(overlay);
}

/** 上次停留的横向位置。视图重绘会把滚动区整个重建，记在这里才能停在原处 */
let savedScrollLeft = 0;

/**
 * 鼠标按住横向拖动图表。触屏不接管：横向滚动交给浏览器自身的滑动（见 .line-scroll）。
 * 放不下时才允许拖动，也只在这时给出抓手光标。
 */
function enableDragPan(box: HTMLElement): void {
  let startX = 0;
  let startScroll = 0;
  let dragging = false;

  box.addEventListener("scroll", () => {
    savedScrollLeft = box.scrollLeft;
  });
  // 刚建好的节点还量不到宽度，等这一帧排完版再恢复位置、判是否可拖
  requestAnimationFrame(() => {
    box.scrollLeft = savedScrollLeft;
    box.classList.toggle("scrollable", box.scrollWidth > box.clientWidth);
  });

  box.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType !== "mouse" || ev.button !== 0) return;
    if (box.scrollWidth <= box.clientWidth) return;
    dragging = true;
    startX = ev.clientX;
    startScroll = box.scrollLeft;
    box.setPointerCapture(ev.pointerId);
    box.classList.add("dragging");
    ev.preventDefault(); // 免得拖出文字选区
  });

  box.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    box.scrollLeft = startScroll - (ev.clientX - startX);
  });

  const end = (ev: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    box.releasePointerCapture(ev.pointerId);
    box.classList.remove("dragging");
  };
  box.addEventListener("pointerup", end);
  box.addEventListener("pointercancel", end);
}

function buildLegend(series: Series[]): HTMLElement {
  const legend = document.createElement("ul");
  legend.className = "legend";
  for (const s of series) {
    const li = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = seriesColor(s.colorIndex);
    const label = document.createElement("span");
    label.className = "legend-label";
    label.textContent = deckName(s.name);
    li.append(swatch, label);
    legend.appendChild(li);
  }
  return legend;
}
