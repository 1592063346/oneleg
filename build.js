import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, cpSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";

// 确保 release 目录存在
mkdirSync("release", { recursive: true });

// 先打包 JS
const result = await esbuild.build({
  entryPoints: ["src/app.ts"],
  bundle: true,
  outfile: "release/bundle.js",
  format: "iife",
  target: "es2020",
  minify: true,
  sourcemap: false,
  logLevel: "info",
});

// 读取 data/pic 文件夹中的所有图片并转换为 data URL
const picDir = "data/pic";
const imageMap = {};
const imageFiles = readdirSync(picDir).filter(f => f.endsWith(".webp"));

for (const filename of imageFiles) {
  const filePath = join(picDir, filename);
  const buffer = readFileSync(filePath);
  const base64 = buffer.toString("base64");
  const dataUrl = `data:image/webp;base64,${base64}`;
  // 使用文件名（不含扩展名）作为 key
  const name = filename.replace(".webp", "");
  imageMap[name] = dataUrl;
}

// 读取 center.json（图片中心配置）
const centerData = JSON.parse(readFileSync("data/pic/center.json", "utf-8"));

// 读取 data.json 并内联到 bundle.js 前面
const data = readFileSync("data/data.json", "utf-8");
const bundle = readFileSync("release/bundle.js", "utf-8");

// 把 data.json、图片 map 和 center.json 挂载到 window
const inlined = `window.__DATA__ = ${data};
window.__IMAGE_MAP__ = ${JSON.stringify(imageMap)};
window.__IMAGE_CENTERS__ = ${JSON.stringify(centerData.centers)};
${bundle}`;
writeFileSync("release/bundle.js", inlined);

// 复制并更新 index.html（将模块引用改为普通脚本，移除 importmap）
let html = readFileSync("index.html", "utf-8");
html = html.replace(
  '<script type="module" src="./dist/app.js"></script>',
  '<script src="./bundle.js"></script>'
);
// 移除 importmap（静态版本不需要）
html = html.replace(
  /<script type="importmap">[\s\S]*?<\/script>\s*/,
  ''
);
writeFileSync("release/index.html", html);

// 不复制 pic 文件夹（所有资源已内联到 bundle.js）

console.log(`✅ 打包完成: release/ (index.html, bundle.js)`);
console.log(`   已内联 ${imageFiles.length} 张图片 + center.json`);
