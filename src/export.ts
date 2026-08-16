// @ts-ignore
import html2canvas from "html2canvas";

/**
 * 将 SVG 转换为 data URL（包含所有内联样式和图片）
 */
async function svgToDataUrl(svg: SVGSVGElement): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;

  // 将所有 image 元素的外部 href 转换为 data URL
  const images = clone.querySelectorAll("image");
  for (const img of Array.from(images)) {
    const href = img.getAttribute("href") || img.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    if (href && !href.startsWith("data:")) {
      try {
        // 加载图片并转换为 data URL
        const response = await fetch(href);
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        img.setAttribute("href", dataUrl);
        img.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", dataUrl);
      } catch (err) {
        console.warn("Failed to load image:", href, err);
      }
    }
  }

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
}

/**
 * 将饼图容器导出为图片
 * @param container 要导出的 DOM 元素
 * @param filename 导出的文件名
 * @param backgroundImage 可选的背景图片 URL
 */
export async function exportPieChart(
  container: HTMLElement,
  filename: string,
  backgroundImage?: string
): Promise<void> {
  try {
    // 查找 SVG 元素
    const svg = container.querySelector("svg");
    if (!svg) {
      throw new Error("未找到 SVG 元素");
    }

    // 获取 SVG 的尺寸
    const bbox = svg.getBBox();
    const width = svg.viewBox.baseVal.width || bbox.width;
    const height = svg.viewBox.baseVal.height || bbox.height;

    // 创建 canvas
    const canvas = document.createElement("canvas");
    canvas.width = width * 2; // 2x 分辨率
    canvas.height = height * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);

    // 如果有背景图片，先绘制背景
    if (backgroundImage) {
      const bgImg = new Image();
      await new Promise<void>((resolve, reject) => {
        bgImg.onload = () => resolve();
        bgImg.onerror = reject;
        bgImg.src = backgroundImage;
      });
      ctx.drawImage(bgImg, 0, 0, width, height);
    } else {
      // 使用纯色背景
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--surface-1").trim() || "#fcfcfb";
      ctx.fillRect(0, 0, width, height);
    }

    // 将 SVG 转换为 data URL（内联所有图片）
    const svgDataUrl = await svgToDataUrl(svg);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = svgDataUrl;
    });

    // 绘制 SVG
    ctx.drawImage(img, 0, 0, width, height);

    // 转换为 blob 并下载
    canvas.toBlob((blob) => {
      if (!blob) {
        throw new Error("导出失败：无法生成图片");
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  } catch (err) {
    console.error("导出失败:", err);
    alert("导出失败：" + (err instanceof Error ? err.message : "未知错误"));
  }
}

/**
 * 创建导出按钮
 * @param container 要导出的目标元素
 * @param title 比赛标题（用于文件名）
 */
export function createExportButton(container: HTMLElement, title: string): HTMLElement {
  const btnWrap = document.createElement("div");
  btnWrap.className = "export-btn-wrap";

  const btn = document.createElement("button");
  btn.className = "export-btn";
  btn.textContent = "导出图片";
  btn.title = "导出当前饼图为图片";

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // container 本身就是要导出的目标
    const target = container;

    // 询问是否添加背景图片
    const useBackground = confirm("是否添加自定义背景图片？\n\n点击「确定」选择背景图片\n点击「取消」使用纯色背景");

    if (useBackground) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const bgUrl = URL.createObjectURL(file);
          const filename = `${title.replace(/[<>:"/\\|?*]/g, "_")}.png`;
          await exportPieChart(target, filename, bgUrl);
          URL.revokeObjectURL(bgUrl);
        }
      };
      input.click();
    } else {
      const filename = `${title.replace(/[<>:"/\\|?*]/g, "_")}.png`;
      await exportPieChart(target, filename);
    }
  });

  btnWrap.appendChild(btn);
  return btnWrap;
}
