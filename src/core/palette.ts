// 分类调色板：扩展至 30 色以支持更多卡组同时展示不同折线颜色。
// 固定顺序分配，超过 30 个卡组时循环复用（并配合直接标签/图例区分身份）。

const LIGHT_SERIES = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // teal
  "#eda100", // yellow
  "#e87ba4", // pink
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
  "#00aacc", // cyan
  "#ff6b9d", // rose
  "#7c5295", // purple
  "#d4a017", // gold
  "#0b6e4f", // forest
  "#ff8c42", // amber
  "#6a4c93", // lavender
  "#1e90ff", // dodger blue
  "#ff1493", // deep pink
  "#32cd32", // lime
  "#ff6347", // tomato
  "#4682b4", // steel blue
  "#da70d6", // orchid
  "#20b2aa", // light sea green
  "#ff8c00", // dark orange
  "#9370db", // medium purple
  "#00ced1", // dark turquoise
  "#ff69b4", // hot pink
  "#3cb371", // medium sea green
  "#cd5c5c", // indian red
  "#4169e1", // royal blue
  "#ffa07a", // light salmon
];

const DARK_SERIES = [
  "#3987e5", // blue
  "#ff7f50", // coral
  "#20c997", // teal
  "#ffc107", // yellow
  "#ff6ec7", // pink
  "#28a745", // green
  "#9085e9", // violet
  "#f46d6d", // red
  "#17a2b8", // cyan
  "#ff85b3", // rose
  "#a370d0", // purple
  "#e5b13a", // gold
  "#198754", // forest
  "#ffa55f", // amber
  "#8b7db8", // lavender
  "#4da6ff", // dodger blue
  "#ff5cb3", // deep pink
  "#5fd35f", // lime
  "#ff7b66", // tomato
  "#6ba3d4", // steel blue
  "#e68fe6", // orchid
  "#47d4c9", // light sea green
  "#ffaa33", // dark orange
  "#b399e8", // medium purple
  "#33e5e8", // dark turquoise
  "#ff8fd9", // hot pink
  "#66d4a0", // medium sea green
  "#e07878", // indian red
  "#6a8eff", // royal blue
  "#ffb399", // light salmon
];


/** 当前是否处于暗色模式 */
export function isDark(): boolean {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark") return true;
  if (attr === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** 按槽位取分类色（自动循环） */
export function seriesColor(index: number): string {
  const ramp = isDark() ? DARK_SERIES : LIGHT_SERIES;
  return ramp[index % ramp.length];
}

/** 为一组名称建立稳定的“名称 -> 颜色”映射（颜色跟随实体，不随筛选变化） */
export function buildColorMap(names: string[]): Map<string, number> {
  const map = new Map<string, number>();
  names.forEach((name, i) => map.set(name, i));
  return map;
}
