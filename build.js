import * as esbuild from "esbuild";
import { readFileSync, writeFileSync } from "fs";

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

console.log("✅ 打包完成: release/bundle.js (已内联 data.json)");
