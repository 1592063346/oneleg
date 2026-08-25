import type { DeckCount, Match } from "./types.js";
import { totalDecks } from "./data.js";
import { seriesColor } from "./palette.js";
import { arcPath, arcRingPath, el, polarToCartesian, svgRoot } from "./svg.js";
import { hideTooltip, showTooltip } from "./tooltip.js";
import { createExportButton } from "./export.js";

// 画布留出两侧空间给引导标签；饼图在画布中水平居中
const W = 760;
const H = 520;
const CX = W / 2;
const CY = H / 2;
const R = 175;
const OTHERS_LABEL = "others";

// 图片中心配置
interface ImageCenterConfig {
  center: [number, number];
  size: [number, number];
}
let imageCenters: Record<string, ImageCenterConfig> = {};

// 加载图片中心配置
async function loadImageCenters(): Promise<void> {
  // 优先使用打包时内联的数据（静态版本）
  const inlinedCenters = (window as any).__IMAGE_CENTERS__;
  if (inlinedCenters) {
    imageCenters = inlinedCenters;
    return;
  }

  // 回退到 fetch（开发模式）
  try {
    const response = await fetch("./pic/center.json");
    if (response.ok) {
      const data = await response.json();
      imageCenters = data.centers || {};
    }
  } catch (err) {
    console.warn("Failed to load image centers:", err);
  }
}

// 初始化时加载
loadImageCenters();

interface Slice {
  name: string;
  num: number;
  pct: number;
  start: number;
  end: number;
  color: string;
  isOthers: boolean;
  subdecks?: Array<{ deck: string; num: number }>;
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

  // const total = totalDecks(match);
  if (match.decks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "本场比赛暂无环境卡组数据。";
    container.appendChild(empty);
    return container;
  }

  const total = totalDecks(match);
  const { shown, others } = partitionDecks(match.decks);
  const othersSum = others.reduce((s, d) => s + d.num, 0);

  // 组装扇区：先展示的卡组，最后（若有）others
  const slices: Slice[] = [];
  let angle = 0;
  const pushSlice = (name: string, num: number, color: string, isOthers: boolean, subdecks?: Array<{ deck: string; num: number }>) => {
    const pct = num / total;
    const sweep = pct * 360;
    slices.push({ name, num, pct, start: angle, end: angle + sweep, color, isOthers, subdecks });
    angle += sweep;
  };
  for (const d of shown) {
    pushSlice(d.name, d.num, seriesColor(colorMap.get(d.name) ?? 0), false, d.subdecks);
  }
  if (othersSum > 0) {
    pushSlice(OTHERS_LABEL, othersSum, othersColor(), true);
  }

  // 收集所有需要加载的图片 URL
  const imageUrls = new Set<string>();
  for (const slice of slices) {
    imageUrls.add(imageHref(slice.name));
    if (slice.subdecks) {
      for (const subdeck of slice.subdecks) {
        imageUrls.add(imageHref(subdeck.deck));
      }
    }
  }

  // 创建加载提示
  const loadingMsg = document.createElement("p");
  loadingMsg.className = "empty-note";
  loadingMsg.textContent = "饼图渲染中……";
  container.appendChild(loadingMsg);

  // 使用 HTML Image 对象预加载所有图片到浏览器缓存
  const imageLoadPromises = Array.from(imageUrls).map((url) => {
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve(); // 加载失败也继续（保留纯色底）
      // 超时保护（20秒）
      setTimeout(() => resolve(), 20000);
      img.src = url; // 开始加载
    });
  });

  // 所有图片预加载完成后，再构建和显示饼图
  Promise.all(imageLoadPromises).then(() => {
    // 移除加载提示
    loadingMsg.remove();

    // 现在构建饼图（此时图片已在浏览器缓存中）
    const chartCol = document.createElement("div");
    chartCol.className = "pie-wrap";
    chartCol.style.position = "relative";
    chartCol.setAttribute("data-export-target", "true");
    chartCol.appendChild(buildSvg(match, slices));

    // 添加导出按钮
    const exportBtn = createExportButton(chartCol, match.title);
    chartCol.appendChild(exportBtn);

    container.appendChild(chartCol);

    // others 明细
    if (others.length > 0) {
      container.appendChild(buildOthersDetail(others, othersSum));
    }
  });

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

  // 追踪调试信息（已禁用）
  // const debugInfo: Array<{ name: string; centerX: number; centerY: number; mid: number }> = [];

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

    // 饼块背景图：根据 center.json 中指定的图片中心进行定位
    const clipId = `slice-${uid}-${i}`;
    const clip = el("clipPath", { id: clipId });
    clip.appendChild(el("path", { d }));
    defs.appendChild(clip);

    // 角平分线的角度
    const mid = (s.start + s.end) / 2;
    const sweep = s.end - s.start;

    // 获取图片的自定义中心点（相对于图片左上角的坐标）
    const customCenterConfig = imageCenters[s.name];

    let imgX: number, imgY: number, imgSize: number;

    if (Math.abs(sweep - 360) < 0.001) {
      // 情况1：整圆，图片中心直接对齐圆心
      imgSize = R * 2.5; // 足够大以覆盖整个圆
      imgX = CX - imgSize / 2;
      imgY = CY - imgSize / 2;

      // 如果有自定义中心，调整图片位置使自定义中心对齐圆心
      if (customCenterConfig) {
        const [centerX, centerY] = customCenterConfig.center;
        const [originalWidth, originalHeight] = customCenterConfig.size;
        // 使用宽度和高度的平均值作为缩放基准
        const originalSize = (originalWidth + originalHeight) / 2;
        const scaleRatio = imgSize / originalSize;
        imgX = CX - centerX * scaleRatio;
        imgY = CY - centerY * scaleRatio;
      }
    } else {
      // 情况2：扇形，图片的自定义中心必须在角平分线上

      if (customCenterConfig) {
        const [centerX, centerY] = customCenterConfig.center;
        const [originalWidth, originalHeight] = customCenterConfig.size;

        // 归一化中心坐标（使用实际图片尺寸）
        const normCenterX = centerX / originalWidth;
        const normCenterY = centerY / originalHeight;

        // 角平分线的单位方向向量
        // 注意：polarToCartesian 已经处理了 -90 转换，所以这里直接用 mid 角度
        const midRad = ((mid - 90) * Math.PI) / 180;
        const dirX = Math.cos(midRad);
        const dirY = Math.sin(midRad);

        // 需要覆盖的关键点（固定）
        const keyPoints = [
          { x: CX, y: CY }, // 圆心
          polarToCartesian(CX, CY, R, s.start), // 圆弧起点
          polarToCartesian(CX, CY, R, s.end), // 圆弧终点
        ];

        // 在圆弧上密集采样，确保覆盖所有点
        const numSamples = 20;
        for (let i = 1; i < numSamples; i++) {
          const angle = s.start + (s.end - s.start) * (i / numSamples);
          keyPoints.push(polarToCartesian(CX, CY, R, angle));
        }

        // 在角平分线上搜索最优位置
        // 图片中心位置 = (CX, CY) + t * (dirX, dirY)
        // 对于每个关键点，计算需要的最小缩放比例

        const findMinImgSize = (t: number): number => {
          const imgCenterX = CX + t * dirX;
          const imgCenterY = CY + t * dirY;

          let maxImgSize = 0;
          for (const pt of keyPoints) {
            // 点相对于图片中心的偏移
            const dx = pt.x - imgCenterX;
            const dy = pt.y - imgCenterY;

            // 使用 preserveAspectRatio="none"，图片被拉伸成正方形 imgSize × imgSize
            // 点在拉伸后图片中的归一化坐标：
            // nx = normCenterX + dx / imgSize
            // ny = normCenterY + dy / imgSize
            // 要求 0 <= nx <= 1 且 0 <= ny <= 1

            let minImgSizeX = 0;
            if (dx > 0) {
              if (1 - normCenterX > 1e-6) {
                minImgSizeX = dx / (1 - normCenterX);
              } else {
                minImgSizeX = Infinity;
              }
            } else if (dx < 0) {
              if (normCenterX > 1e-6) {
                minImgSizeX = -dx / normCenterX;
              } else {
                minImgSizeX = Infinity;
              }
            }

            let minImgSizeY = 0;
            if (dy > 0) {
              if (1 - normCenterY > 1e-6) {
                minImgSizeY = dy / (1 - normCenterY);
              } else {
                minImgSizeY = Infinity;
              }
            } else if (dy < 0) {
              if (normCenterY > 1e-6) {
                minImgSizeY = -dy / normCenterY;
              } else {
                minImgSizeY = Infinity;
              }
            }

            maxImgSize = Math.max(maxImgSize, minImgSizeX, minImgSizeY);
          }

          return maxImgSize;
        };

        // 三分搜索找到最小图片尺寸对应的 t
        // t 的范围：从圆心(0)到圆弧(R)，图片中心必须在饼块内
        // let left = 0;
        // let right = R;

        // t 的范围：(0.25R, 0.75R)
        // 不选择 (0, R) 因为不希望图片中心位于过于边缘的位置
        let left = 0.25 * R;
        let right = 0.75 * R;
        const eps = 0.1;

        while (right - left > eps) {
          const m1 = left + (right - left) / 3;
          const m2 = right - (right - left) / 3;
          const size1 = findMinImgSize(m1);
          const size2 = findMinImgSize(m2);

          if (size1 > size2) {
            left = m1;
          } else {
            right = m2;
          }
        }

        const bestT = (left + right) / 2;
        imgSize = findMinImgSize(bestT);

        // 计算最终图片位置
        const imgCenterX = CX + bestT * dirX;
        const imgCenterY = CY + bestT * dirY;
        imgX = imgCenterX - normCenterX * imgSize;
        imgY = imgCenterY - normCenterY * imgSize;





      } else {
        // 没有自定义中心，使用原来的逻辑（质心对齐）
        const alpha = (((s.end - s.start) / 2) * Math.PI) / 180;
        const cDist = alpha > 1e-6 ? (2 / 3) * R * (Math.sin(alpha) / alpha) : (2 / 3) * R;
        const centroid = polarToCartesian(CX, CY, cDist, mid);
        const half = wedgeMaxRadius(centroid, s.start, s.end);
        imgSize = half * 2;
        imgX = centroid.x - half;
        imgY = centroid.y - half;
      }
    }

    const image = el("image", {
      href: imageHref(s.name),
      x: imgX,
      y: imgY,
      width: imgSize,
      height: imgSize,
      preserveAspectRatio: "none", // 拉伸填充，不保持宽高比，确保自定义中心位置精确
      "clip-path": `url(#${clipId})`,
      "pointer-events": "none",
    });
    // 兼容旧属性以防万一
    image.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", imageHref(s.name));
    // 加载失败（无对应图片）时移除图片，保留纯色底
    image.addEventListener("error", () => image.remove());
    svg.appendChild(image);
  });

  // 渲染子卡组（双层饼图）
  renderSubdecks(svg, slices, defs, uid, surface);

  // 引导线标签：每块饼旁标注"名称 数量（占比）"
  drawLeaderLabels(svg, slices);

  return svg;
}

/** 渲染子卡组在外圈 (0.8R 到 R) */
function renderSubdecks(
  svg: SVGSVGElement,
  slices: Slice[],
  defs: SVGDefsElement,
  uid: string,
  surface: string
): void {
  const innerR = 0.8 * R;
  const outerR = R;
  const subdeckImgR = 0.9 * R; // 子卡组图片中心距离圆心的距离

  slices.forEach((parentSlice, sliceIdx) => {
    if (!parentSlice.subdecks || parentSlice.subdecks.length === 0) {
      return; // 没有子卡组，跳过
    }

    const subdeckTotal = parentSlice.subdecks.reduce((sum, sd) => sum + sd.num, 0);

    // 子卡组占据父卡组的末尾部分
    // 父卡组总角度
    const parentSweep = parentSlice.end - parentSlice.start;
    // 子卡组总角度 = 父卡组角度 * (子卡组总数 / 父卡组总数)
    const subdeckSweep = parentSweep * (subdeckTotal / parentSlice.num);
    // 子卡组起始角度 = 父卡组结束角度 - 子卡组总角度
    const subdeckStartAngle = parentSlice.end - subdeckSweep;

    let currentAngle = subdeckStartAngle;

    // 边界线向内偏移的角度（度）
    const angleOffset = 0.2;

    parentSlice.subdecks.forEach((subdeck, subIdx) => {
      const subPct = subdeck.num / subdeckTotal;
      const subSweep = subdeckSweep * subPct;
      const subStart = currentAngle;
      const subEnd = currentAngle + subSweep;

      // 创建子卡组的环形扇区路径
      const subPath = arcRingPath(CX, CY, innerR, outerR, subStart, subEnd);

      // 裁剪路径
      const clipId = `subdeck-${uid}-${sliceIdx}-${subIdx}`;
      const clip = el("clipPath", { id: clipId });
      clip.appendChild(el("path", { d: subPath }));
      defs.appendChild(clip);

      // 子卡组图片
      const subMid = (subStart + subEnd) / 2;
      const customCenterConfig = imageCenters[subdeck.deck];

      if (customCenterConfig) {
        const [centerX, centerY] = customCenterConfig.center;
        const [originalWidth, originalHeight] = customCenterConfig.size;

        const normCenterX = centerX / originalWidth;
        const normCenterY = centerY / originalHeight;

        // 子卡组图片中心位于角平分线上的 0.9R 处
        const imgCenterPos = polarToCartesian(CX, CY, subdeckImgR, subMid);

        // 计算需要覆盖的关键点：环形扇区的所有顶点和边界采样点
        const keyPoints = [
          polarToCartesian(CX, CY, innerR, subStart),
          polarToCartesian(CX, CY, innerR, subEnd),
          polarToCartesian(CX, CY, outerR, subStart),
          polarToCartesian(CX, CY, outerR, subEnd),
        ];

        // 在内弧和外弧上采样
        const numSamples = 10;
        for (let i = 1; i < numSamples; i++) {
          const angle = subStart + (subEnd - subStart) * (i / numSamples);
          keyPoints.push(polarToCartesian(CX, CY, innerR, angle));
          keyPoints.push(polarToCartesian(CX, CY, outerR, angle));
        }

        // 计算所需的最小图片尺寸
        let maxImgSize = 0;
        for (const pt of keyPoints) {
          const dx = pt.x - imgCenterPos.x;
          const dy = pt.y - imgCenterPos.y;

          let minImgSizeX = 0;
          if (dx > 0) {
            if (1 - normCenterX > 1e-6) {
              minImgSizeX = dx / (1 - normCenterX);
            } else {
              minImgSizeX = Infinity;
            }
          } else if (dx < 0) {
            if (normCenterX > 1e-6) {
              minImgSizeX = -dx / normCenterX;
            } else {
              minImgSizeX = Infinity;
            }
          }

          let minImgSizeY = 0;
          if (dy > 0) {
            if (1 - normCenterY > 1e-6) {
              minImgSizeY = dy / (1 - normCenterY);
            } else {
              minImgSizeY = Infinity;
            }
          } else if (dy < 0) {
            if (normCenterY > 1e-6) {
              minImgSizeY = -dy / normCenterY;
            } else {
              minImgSizeY = Infinity;
            }
          }

          maxImgSize = Math.max(maxImgSize, minImgSizeX, minImgSizeY);
        }

        const imgSize = maxImgSize;
        const imgX = imgCenterPos.x - normCenterX * imgSize;
        const imgY = imgCenterPos.y - normCenterY * imgSize;

        const image = el("image", {
          href: imageHref(subdeck.deck),
          x: imgX,
          y: imgY,
          width: imgSize,
          height: imgSize,
          preserveAspectRatio: "none",
          "clip-path": `url(#${clipId})`,
          "pointer-events": "none",
        });
        image.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", imageHref(subdeck.deck));
        image.addEventListener("error", () => image.remove());
        svg.appendChild(image);
      }

      // 绘制子卡组分隔线（白色）
      // 条件1：不是第一个子卡组 - 绘制左边界
      // 条件2：是第一个子卡组但子卡组总数 < 父卡组总数 - 绘制左边界（与父卡组非边界的分隔）
      // 条件3：是第一个子卡组且 subdeckTotal == parentSlice.num - 绘制左边界（与父卡组边界重合）
      if (subIdx > 0 || subdeckTotal < parentSlice.num || (subIdx === 0 && subdeckTotal === parentSlice.num)) {
        // 判断是否与父卡组边界重合（第一个子卡组且占满父卡组）
        const isAtParentBoundary = (subIdx === 0 && subdeckTotal === parentSlice.num);
        // 如果与父卡组边界重合，向内偏移；否则不偏移
        const angleToUse = isAtParentBoundary ? subStart + angleOffset : subStart;
        const lineStart = polarToCartesian(CX, CY, innerR, angleToUse);
        const lineEnd = polarToCartesian(CX, CY, outerR, angleToUse);
        const separatorLine = el("line", {
          x1: lineStart.x,
          y1: lineStart.y,
          x2: lineEnd.x,
          y2: lineEnd.y,
          stroke: surface,
          "stroke-width": 1,
          "stroke-linejoin": "round",
        });
        svg.appendChild(separatorLine);
      }

      // 如果是最后一个子卡组，绘制右边界（与父卡组边界重合）
      if (subIdx === parentSlice.subdecks!.length - 1) {
        // 最后一个子卡组的右边界总是与父卡组边界重合，向内偏移
        const angleToUse = subEnd - angleOffset;
        const lineStart = polarToCartesian(CX, CY, innerR, angleToUse);
        const lineEnd = polarToCartesian(CX, CY, outerR, angleToUse);
        const separatorLine = el("line", {
          x1: lineStart.x,
          y1: lineStart.y,
          x2: lineEnd.x,
          y2: lineEnd.y,
          stroke: surface,
          "stroke-width": 1,
          "stroke-linejoin": "round",
        });
        svg.appendChild(separatorLine);
      }

      currentAngle = subEnd;
    });

    // 绘制子卡组区域的内圈边界线（白色圆弧，只是圆弧不是扇形）
    const innerArcStart = polarToCartesian(CX, CY, innerR, subdeckStartAngle);
    const innerArcEnd = polarToCartesian(CX, CY, innerR, parentSlice.end);
    const largeArc = (parentSlice.end - subdeckStartAngle) > 180 ? 1 : 0;
    const innerArcPath = `M ${innerArcStart.x} ${innerArcStart.y} A ${innerR} ${innerR} 0 ${largeArc} 1 ${innerArcEnd.x} ${innerArcEnd.y}`;
    const innerArcLine = el("path", {
      d: innerArcPath,
      fill: "none",
      stroke: surface,
      "stroke-width": 1,
      "stroke-linejoin": "round",
    });
    svg.appendChild(innerArcLine);
  });
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

    // 如果有子卡组，添加第三行
    if (s.subdecks && s.subdecks.length > 0) {
      const subdeckParts = s.subdecks.map(sd => `${sd.deck}${s.name} ${sd.num}`);
      const subdeckText = `${subdeckParts.join('；')}`;
      const subdeckLine = el(
        "text",
        {
          x: textX,
          y: p1.y + 26,
          "text-anchor": right ? "start" : "end",
          "dominant-baseline": "central",
          fill: leader,
          "font-size": 12,
        },
        [subdeckText]
      );
      svg.appendChild(subdeckLine);
    }
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
  // 优先使用打包时内联的图片 data URL（用于静态版本）
  const imageMap = (window as any).__IMAGE_MAP__;
  if (imageMap && imageMap[name]) {
    return imageMap[name];
  }
  // 回退到相对路径（用于开发模式）
  return `./pic/${encodeURIComponent(name)}.png`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}
