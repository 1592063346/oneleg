import type { DeckCount, Match } from "../../core/types.js";
import { totalDecks } from "../../core/data.js";
import { escapeHtml } from "../../core/html.js";
import { deckName, t } from "../../core/i18n.js";
import { seriesColor } from "../../core/palette.js";
import { arcPath, arcRingPath, el, polarToCartesian, svgRoot } from "../svg.js";
import { hideTooltip, showTooltip } from "../tooltip.js";
import { partitionDecks, type Slice } from "./partition.js";
import { buildOthersDetail } from "./others.js";

// 引导线的几何，绘制与收边共用
const LEADER_RADIAL = 22; // 自圆弧引出的径向段
const LEADER_HORIZ = 26; // 水平段
const LABEL_GAP = 6; // 末段到文字的水平间距
const NAME_FONT = 14; // 名称行字号
const CROP_PAD = 8; // 收边时内容外侧留的余量
const FOCUS_SHIFT_MIN_PCT = 0.08; // 焦点沿四等分线偏移的最小占比

// 基准画布：绘制坐标由它推出，实际幅面在画完后按标签实测收边（见 cropPies）
const W = 760;
const H = 520;
const R = 175;
const CX = W / 2;
const CY = H / 2;
const OTHERS_LABEL = "others";

/** 饼图卡图与 center.json 所在目录 */
const PIC_DIR = "./sources/pic/";

// 图片中心配置
interface ImageCenterConfig {
  center: [number, number];
  size: [number, number];
}
let imageCenters: Record<string, ImageCenterConfig> = {};

// 加载图片中心配置
async function loadImageCenters(): Promise<void> {
  try {
    const response = await fetch(PIC_DIR + "center.json");
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


/**
 * 渲染某场比赛的卡组饼图分布。
 * colorMap 提供"卡组名 -> 固定色槽"，使颜色跟随卡组身份而非本场排名。
 * rankings 为排名信息（冠亚四强），合并到同一框内。
 * loadOthersImage 控制是否为 others 加载图片，默认为 false（纯色）。
 */
export function renderPie(
  match: Match,
  colorMap: Map<string, number>,
  rankings?: HTMLElement,
  loadOthersImage: boolean = false
): HTMLElement {
  const container = document.createElement("div");
  container.className = "pie-view-inner";

  const chartTitle = document.createElement("h3");
  chartTitle.className = "pie-title";
  chartTitle.textContent = t("pieChart.title");
  container.appendChild(chartTitle);

  // 排名信息（若有）插入饼图前，用短横线分隔
  if (rankings) {
    container.appendChild(rankings);
    const divider = document.createElement("hr");
    divider.className = "pie-divider";
    container.appendChild(divider);
  }

  // 淘汰赛饼图（若有）：位于冠亚四强与环境总饼图之间，
  // 上下各用一条横线隔开；不划分 others，全部展示。
  const elim = match.elimination_decks;
  if (elim && elim.length > 0) {
    const elimTotal = elim.reduce((s, d) => s + d.num, 0);
    container.appendChild(
      buildPieSection(
        match,
        [...elim],
        [],
        elimTotal,
        colorMap,
        false,
        t("pieChart.elimTitle", { title: match.title }),
        t("pieChart.elimCaption"),
        container
      )
    );

    const divider = document.createElement("hr");
    divider.className = "pie-divider";
    container.appendChild(divider);
  }

  if (match.decks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = t("pieChart.empty");
    container.appendChild(empty);
    return container;
  }

  const total = totalDecks(match);
  const { shown, others } = partitionDecks(match.decks);
  container.appendChild(
    buildPieSection(
      match, shown, others, total, colorMap, loadOthersImage,
      match.title, t("pieChart.caption"), container
    )
  );

  return container;
}

/**
 * 构建单个饼图区块（饼图 SVG + others 明细），图片预加载完成后再渲染。
 * caption 为饼图左上角的标注文字；exportTitle 为导出图片的文件名基底，
 * 导出按钮下线期间用不上，接入时去掉下划线即可（其调用处见下方注释）。
 * container 为同一场比赛饼图共同的父容器，画完就地对整组收边（见 cropPies）。
 */
function buildPieSection(
  match: Match,
  shown: DeckCount[],
  others: DeckCount[],
  total: number,
  colorMap: Map<string, number>,
  loadOthersImage: boolean,
  _exportTitle: string,
  caption: string,
  container: HTMLElement
): HTMLElement {
  const host = document.createElement("div");
  const othersSum = others.reduce((s, d) => s + d.num, 0);

  // 组装扇区：先展示的卡组，最后（若有）others
  const slices: Slice[] = [];
  let angle = 0;
  const pushSlice = (
    name: string,
    num: number,
    color: string,
    isOthers: boolean,
    archetypes?: Array<{ name: string; num: number }>
  ) => {
    const pct = num / total;
    const sweep = pct * 360;
    slices.push({ name, num, pct, start: angle, end: angle + sweep, color, isOthers, archetypes });
    angle += sweep;
  };
  for (const d of shown) {
    pushSlice(d.name, d.num, seriesColor(colorMap.get(d.name) ?? 0), false, d.archetypes);
  }
  if (othersSum > 0) {
    pushSlice(OTHERS_LABEL, othersSum, othersColor(), true);
  }

  // 收集所有需要加载的图片 URL（根据 loadOthersImage 参数决定是否加载 others）
  const imageUrls = new Set<string>();
  for (const slice of slices) {
    if (loadOthersImage || !slice.isOthers) {
      imageUrls.add(imageHref(slice.name));
      if (slice.archetypes) {
        for (const archetype of slice.archetypes) {
          imageUrls.add(imageHref(archetype.name));
        }
      }
    }
  }

  // 创建加载提示
  const loadingMsg = document.createElement("p");
  loadingMsg.className = "empty-note";
  loadingMsg.textContent = t("pieChart.loading");
  host.appendChild(loadingMsg);

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
    chartCol.setAttribute("data-export-target", "true");

    // 标注文字独占一行，位于饼图上方
    const head = document.createElement("div");
    head.className = "pie-head";
    const cap = document.createElement("div");
    cap.className = "pie-caption";
    cap.textContent = caption;
    // 右上角的“导出图片”按钮暂时下线：实现保留在 chart/exportImage.ts，
    // 恢复时引入 createExportButton，再把它 append 回这一行即可
    head.append(cap);

    chartCol.append(head, buildSvg(match, slices, loadOthersImage));
    host.appendChild(chartCol);
    // 挂上 DOM 才量得到标签尺寸，故收边在此
    cropPies(container);

    // others 明细
    if (others.length > 0) {
      host.appendChild(buildOthersDetail(others, othersSum));
    }
  });

  return host;
}

function buildSvg(match: Match, slices: Slice[], loadOthersImage: boolean): SVGSVGElement {
  const svg = svgRoot(W, H);
  // 收边失败时的兜底：不放得比基准画布更宽
  svg.style.maxWidth = `${W}px`;
  svg.setAttribute("aria-label", t("pieChart.aria", { title: match.title }));
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
      const text = t("pieChart.tooltip", { num: s.num, pct: (s.pct * 100).toFixed(1) });
      showTooltip(
        `<strong>${escapeHtml(deckName(s.name))}</strong><br>${escapeHtml(text)}`,
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
    // 根据 loadOthersImage 参数决定是否为 others 添加背景图
    if (loadOthersImage || !s.isOthers) {
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

        // 方向向量：polarToCartesian 已经处理了 -90 转换，故角度直接代入
        const dirOf = (deg: number) => {
          const rad = ((deg - 90) * Math.PI) / 180;
          return { x: Math.cos(rad), y: Math.sin(rad) };
        };

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

        // 焦点位置 = (CX, CY) + t * (dirX, dirY)，对每个关键点求覆盖它所需的最小边长

        const findMinImgSize = (t: number, dirX: number, dirY: number): number => {
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

        // 沿某方向三分搜索焦点位置，返回所需边长最小的那个位置。
        // t 取 (0.25R, 0.75R)：不取 (0, R) 是不希望焦点落在过于边缘的位置。
        const searchAlong = (dirX: number, dirY: number) => {
          let left = 0.25 * R;
          let right = 0.75 * R;
          const eps = 0.1;

          while (right - left > eps) {
            const m1 = left + (right - left) / 3;
            const m2 = right - (right - left) / 3;
            const size1 = findMinImgSize(m1, dirX, dirY);
            const size2 = findMinImgSize(m2, dirX, dirY);

            if (size1 > size2) {
              left = m1;
            } else {
              right = m2;
            }
          }

          const t = (left + right) / 2;
          return { x: CX + t * dirX, y: CY + t * dirY, size: findMinImgSize(t, dirX, dirY) };
        };

        const midDir = dirOf(mid);
        let best = searchAlong(midDir.x, midDir.y);

        // 角平分线近水平（与水平线夹角不超过 45°）时，再沿四等分线各做一次三分，取更优值
        if (s.pct >= FOCUS_SHIFT_MIN_PCT && ((mid >= 45 && mid <= 135) || (mid >= 225 && mid <= 315))) {
          const q1 = dirOf(mid - sweep / 4);
          const q2 = dirOf(mid + sweep / 4);
          const upper = q1.y <= q2.y ? q1 : q2;
          const lower = upper === q1 ? q2 : q1;
          const quarter = normCenterY < 0.5 ? upper : lower;

          const alt = searchAlong(quarter.x, quarter.y);
          if (alt.size < best.size) best = alt;
        }

        imgSize = best.size;
        imgX = best.x - normCenterX * imgSize;
        imgY = best.y - normCenterY * imgSize;


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
    }
  });

  // 渲染子卡组（双层饼图）
  renderArchetypes(svg, slices, defs, uid, surface);

  // 引导线标签：每块饼旁标注"名称 数量（占比）"。
  // 单独成组：收边只量这一组，不连带被裁剪的图片
  const leaders = el("g", { class: "pie-leaders" });
  drawLeaderLabels(leaders, slices);
  svg.appendChild(leaders);

  return svg;
}

/** 渲染子卡组在外圈 (0.8R 到 R) */
function renderArchetypes(
  svg: SVGSVGElement,
  slices: Slice[],
  defs: SVGDefsElement,
  uid: string,
  surface: string
): void {
  const innerR = 0.8 * R;
  const outerR = R;
  const archetypeImgR = 0.9 * R; // 子卡组图片中心距离圆心的距离

  slices.forEach((parentSlice, sliceIdx) => {
    if (!parentSlice.archetypes || parentSlice.archetypes.length === 0) {
      return; // 没有子卡组，跳过
    }

    const archetypeTotal = parentSlice.archetypes.reduce((sum, arch) => sum + arch.num, 0);

    // 子卡组占据父卡组的末尾部分
    // 父卡组总角度
    const parentSweep = parentSlice.end - parentSlice.start;
    // 子卡组总角度 = 父卡组角度 * (子卡组总数 / 父卡组总数)
    const archetypeSweep = parentSweep * (archetypeTotal / parentSlice.num);
    // 子卡组起始角度 = 父卡组结束角度 - 子卡组总角度
    const archetypeStartAngle = parentSlice.end - archetypeSweep;

    let currentAngle = archetypeStartAngle;

    // 边界线向内偏移的角度（度）
    const angleOffset = 0.2;

    parentSlice.archetypes.forEach((archetype, archIdx) => {
      const archPct = archetype.num / archetypeTotal;
      const archSweep = archetypeSweep * archPct;
      const archStart = currentAngle;
      const archEnd = currentAngle + archSweep;

      // 创建子卡组的环形扇区路径
      const archPath = arcRingPath(CX, CY, innerR, outerR, archStart, archEnd);

      // 裁剪路径
      const clipId = `archetype-${uid}-${sliceIdx}-${archIdx}`;
      const clip = el("clipPath", { id: clipId });
      clip.appendChild(el("path", { d: archPath }));
      defs.appendChild(clip);

      // 子卡组图片
      const archMid = (archStart + archEnd) / 2;
      const customCenterConfig = imageCenters[archetype.name];

      if (customCenterConfig) {
        const [centerX, centerY] = customCenterConfig.center;
        const [originalWidth, originalHeight] = customCenterConfig.size;

        const normCenterX = centerX / originalWidth;
        const normCenterY = centerY / originalHeight;

        // 子卡组图片中心位于角平分线上的 0.9R 处
        const imgCenterPos = polarToCartesian(CX, CY, archetypeImgR, archMid);

        // 计算需要覆盖的关键点：环形扇区的所有顶点和边界采样点
        const keyPoints = [
          polarToCartesian(CX, CY, innerR, archStart),
          polarToCartesian(CX, CY, innerR, archEnd),
          polarToCartesian(CX, CY, outerR, archStart),
          polarToCartesian(CX, CY, outerR, archEnd),
        ];

        // 在内弧和外弧上采样
        const numSamples = 10;
        for (let i = 1; i < numSamples; i++) {
          const angle = archStart + (archEnd - archStart) * (i / numSamples);
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
          href: imageHref(archetype.name),
          x: imgX,
          y: imgY,
          width: imgSize,
          height: imgSize,
          preserveAspectRatio: "none",
          "clip-path": `url(#${clipId})`,
          "pointer-events": "none",
        });
        image.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", imageHref(archetype.name));
        image.addEventListener("error", () => image.remove());
        svg.appendChild(image);
      }

      // 绘制子卡组分隔线（白色）
      // 条件1：不是第一个子卡组 - 绘制左边界
      // 条件2：是第一个子卡组但子卡组总数 < 父卡组总数 - 绘制左边界（与父卡组非边界的分隔）
      // 条件3：是第一个子卡组且 archetypeTotal == parentSlice.num - 绘制左边界（与父卡组边界重合）
      if (archIdx > 0 || archetypeTotal < parentSlice.num || (archIdx === 0 && archetypeTotal === parentSlice.num)) {
        // 判断是否与父卡组边界重合（第一个子卡组且占满父卡组）
        const isAtParentBoundary = (archIdx === 0 && archetypeTotal === parentSlice.num);
        // 如果与父卡组边界重合，向内偏移；否则不偏移
        const angleToUse = isAtParentBoundary ? archStart + angleOffset : archStart;
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
      if (archIdx === parentSlice.archetypes!.length - 1) {
        // 最后一个子卡组的右边界总是与父卡组边界重合，向内偏移
        const angleToUse = archEnd - angleOffset;
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

      currentAngle = archEnd;
    });

    // 绘制子卡组区域的内圈边界线（白色圆弧，只是圆弧不是扇形）
    const innerArcStart = polarToCartesian(CX, CY, innerR, archetypeStartAngle);
    const innerArcEnd = polarToCartesian(CX, CY, innerR, parentSlice.end);
    const largeArc = (parentSlice.end - archetypeStartAngle) > 180 ? 1 : 0;
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

/** 在每个饼块外侧用引导线引出文字标签，全部挂在给定的分组里 */
function drawLeaderLabels(group: SVGGElement, slices: Slice[]): void {
  const leader = INK_SECONDARY();
  for (const s of slices) {
    const mid = (s.start + s.end) / 2;
    const right = mid <= 180; // 右半区标签朝右，左半区朝左
    // 引导线：从饼块边缘 -> 拐点 -> 水平延伸
    const p0 = polarToCartesian(CX, CY, R, mid);
    const p1 = polarToCartesian(CX, CY, R + LEADER_RADIAL, mid);
    const p2x = right ? p1.x + LEADER_HORIZ : p1.x - LEADER_HORIZ;
    const textX = right ? p2x + LABEL_GAP : p2x - LABEL_GAP;

    group.appendChild(
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
    group.appendChild(
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
        "font-size": NAME_FONT,
        "font-weight": 600,
      },
      [deckName(s.name)]
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
    group.appendChild(nameText);
    group.appendChild(valText);

    // 如果有子卡组，添加第三行
    if (s.archetypes && s.archetypes.length > 0) {
      const gap = t("pieChart.archetypeGap");
      const archetypeParts = s.archetypes.map(
        (arch) => `${deckName(arch.name)}${gap}${deckName(s.name)} ${arch.num}`
      );
      const archetypeText = archetypeParts.join(t("pieChart.archetypeSeparator"));
      const archetypeLine = el(
        "text",
        {
          x: textX,
          y: p1.y + 26,
          "text-anchor": right ? "start" : "end",
          "dominant-baseline": "central",
          fill: leader,
          "font-size": 12,
        },
        [archetypeText]
      );
      group.appendChild(archetypeLine);
    }
  }
}

/**
 * 按标签的实测范围给画布收边，裁掉多余的空白。
 * 同一场比赛的几张饼图一起量、取最宽的一张，幅面与缩放才一致；须在挂上 DOM 之后调用。
 */
function cropPies(container: HTMLElement): void {
  const items: Array<{ svg: SVGSVGElement; box: DOMRect }> = [];
  for (const svg of Array.from(container.querySelectorAll<SVGSVGElement>(".pie-wrap svg"))) {
    const labels = svg.querySelector<SVGGElement>(".pie-leaders");
    const box = labels?.getBBox();
    // 量不到时整组作罢，保留基准画布
    if (!box || (box.width === 0 && box.height === 0)) return;
    items.push({ svg, box });
  }
  if (items.length === 0) return;

  // 两侧取对称值，饼圆才不偏离画布中心
  let halfW = R;
  for (const item of items) {
    halfW = Math.max(halfW, CX - item.box.x, item.box.x + item.box.width - CX);
  }
  halfW += CROP_PAD;

  for (const item of items) {
    const halfH = Math.max(R, CY - item.box.y, item.box.y + item.box.height - CY) + CROP_PAD;
    item.svg.setAttribute("viewBox", `${CX - halfW} ${CY - halfH} ${halfW * 2} ${halfH * 2}`);
    // 上限＝自然尺寸；页面变窄时照旧整块等比缩小
    item.svg.style.maxWidth = `${halfW * 2}px`;
  }
}

function othersColor(): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#898781"
  );
}

/** 卡组对应背景图路径（PIC_DIR 下按卡组名查找） */
function imageHref(name: string): string {
  return `${PIC_DIR}${encodeURIComponent(name)}.webp`;
}
