// 把构建日期写入 src/core/buildInfo.ts，供页脚显示。
// 由 npm run build / watch 调用，不必手动执行。
// 部署流程为每次提交后立即拉取并构建，故构建日期与提交日期一致。

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../src/core/buildInfo.ts", import.meta.url));

/** 构建机器的时区未必是北京时间，故按 UTC+8 折算后再取日期，使各地访客看到同一天 */
const CN_OFFSET_MS = 8 * 60 * 60 * 1000;

const date = new Date(Date.now() + CN_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, "/");

const source = [
  "// 由 scripts/stamp.mjs 生成，请勿手动修改",
  "",
  "/** 站点构建日期，形如 2026/09/20 */",
  `export const LAST_UPDATED = ${JSON.stringify(date)};`,
  "",
].join("\n");

writeFileSync(OUT, source, "utf8");
console.log(`buildInfo.ts <- ${date}`);
