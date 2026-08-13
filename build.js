import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, cpSync, mkdirSync } from "fs";

// 确保 release 目录存在
mkdirSync("release", { recursive: true });

// 先打包 JS
await esbuild.build({
  entryPoints: ["src/app.ts"],
  bundle: true,
  outfile: "release/bundle.js",
  format: "iife",
  target: "es2020",
  minify: true,
  sourcemap: false,
});

// 读取 data.json 并内联到 bundle.js 前面
const data = readFileSync("data.json", "utf-8");
const bundle = readFileSync("release/bundle.js", "utf-8");

// 把 data.json 挂载到 window.__DATA__
const inlined = `window.__DATA__ = ${data};\n${bundle}`;
writeFileSync("release/bundle.js", inlined);

// 复制并更新 index.html（将模块引用改为普通脚本）
let html = readFileSync("index.html", "utf-8");
html = html.replace(
  '<script type="module" src="./dist/app.js"></script>',
  '<script src="./bundle.js"></script>'
);
writeFileSync("release/index.html", html);

// 复制图片文件夹
cpSync("pic", "release/pic", { recursive: true });

console.log("✅ 打包完成: release/ (包含 index.html, bundle.js, pic/)");
