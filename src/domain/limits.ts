// 适用禁限卡表：读取 data/limits/ 下的表，供构筑预览校验投入张数与标注禁限角标

import type { LimitTable } from "../core/types.js";

/** 表清单。静态服务不列目录，故由索引文件列出全部表 */
const INDEX_URL = "./data/limits/index.json";
/** 表文件所在目录 */
const DIR = "./data/limits/";

/** 已加载的表；未加载完成为 null */
let tables: LimitTable[] | null = null;
/** 进行中的加载，避免重复请求 */
let pending: Promise<LimitTable[]> | null = null;

/** 已加载完成的表，供同步渲染；尚未加载完则为 null */
export function loadedLimitTables(): LimitTable[] | null {
  return tables;
}

/** 加载全部表。失败不缓存，下次重绘可重试 */
export function loadLimitTables(): Promise<LimitTable[]> {
  if (!pending) {
    pending = fetchTables().then(
      (list) => {
        tables = list;
        return list;
      },
      (err: unknown) => {
        pending = null;
        throw err;
      }
    );
  }
  return pending;
}

async function fetchTables(): Promise<LimitTable[]> {
  const index = await fetchJson<{ files?: string[] }>(INDEX_URL);
  return Promise.all((index.files ?? []).map((file) => fetchJson<LimitTable>(DIR + file)));
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`读取 ${url} 失败（HTTP ${res.status}）`);
  return (await res.json()) as T;
}

/** 该卡在表中的允许投入张数；未选表或表内未收录则返回 undefined */
export function allowedCopies(table: LimitTable | null, id: number): number | undefined {
  if (!table) return undefined;
  return table.all[String(id)];
}
