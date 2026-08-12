// 极简 SVG 构建辅助函数

const SVG_NS = "http://www.w3.org/2000/svg";

/** 创建 SVG 元素并设置属性 */
export function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  children: (Node | string)[] = []
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  for (const child of children) {
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

/** 创建带 viewBox 的响应式 svg 根元素 */
export function svgRoot(width: number, height: number): SVGSVGElement {
  const svg = el("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width: "100%",
    role: "img",
    preserveAspectRatio: "xMidYMid meet",
  });
  return svg;
}

/** 极坐标转笛卡尔坐标（角度以度计，0° 在正上方，顺时针） */
export function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** 生成一段扇形（饼图切片）的路径 d 属性 */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  // 整圆特判：用两段半圆避免起终点重合导致不绘制
  if (Math.abs(endAngle - startAngle) >= 359.999) {
    const mid = polarToCartesian(cx, cy, r, startAngle + 180);
    return [
      `M ${cx} ${cy}`,
      `L ${end.x} ${end.y}`,
      `A ${r} ${r} 0 1 0 ${mid.x} ${mid.y}`,
      `A ${r} ${r} 0 1 0 ${end.x} ${end.y}`,
      "Z",
    ].join(" ");
  }
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}
