import type { Match } from "./types.js";
import { deckCountIn } from "./data.js";
import { seriesColor } from "./palette.js";
import { el, svgRoot } from "./svg.js";
import { hideTooltip, showTooltip } from "./tooltip.js";

const W = 820;
const H = 460;
const M = { top: 24, right: 60, bottom: 72, left: 48 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

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
    note.textContent = "请选择至少一个卡组以查看上位数量统计";
    container.appendChild(note);
    return container;
  }

  // Y 轴上界：所选卡组在所有比赛中的最大数量
  let maxVal = 0;
  for (const name of selected) {
    for (const m of matches) maxVal = Math.max(maxVal, deckCountIn(m, name));
  }
  const yMax = Math.max(1, maxVal);

  const n = matches.length;
  const xAt = (i: number): number =>
    M.left + (n <= 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
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
  svg.setAttribute("aria-label", "卡组数量趋势折线图");

  drawGridAndAxes(svg, matches, yMax, xAt, yAt);
  drawSeries(svg, series);
  attachHover(svg, matches, series, xAt);

  container.appendChild(svg);
  container.appendChild(buildLegend(series));
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
  yAt: (v: number) => number
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
        x2: M.left + PLOT_W,
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
  xAt: (i: number) => number
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
    width: PLOT_W,
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
    const svgX = ((ev.clientX - rect.left) / rect.width) * W;
    const i = nearestIndex(svgX);
    const cx = xAt(i);
    crosshair.setAttribute("x1", String(cx));
    crosshair.setAttribute("x2", String(cx));
    crosshair.setAttribute("opacity", "1");

    const rows = series
      .map((s) => {
        const c = seriesColor(s.colorIndex);
        return `<div class="tt-row"><span class="tt-dot" style="background:${c}"></span>${escapeHtml(
          s.name
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
    label.textContent = s.name;
    li.append(swatch, label);
    legend.appendChild(li);
  }
  return legend;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}
