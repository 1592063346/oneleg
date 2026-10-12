// 文章数据：清单与正文 markdown 的加载与缓存

import { t } from "../core/i18n.js";
import type { PostIndexFile, PostMeta } from "./types.js";

/** 文章目录。静态服务不列目录，故由索引文件列出全部文章（与 data/limits/ 同理） */
const DIR = "./data/posts/";
const INDEX_URL = DIR + "index.json";

/** 文章 id 只允许字母、数字、连字符与下划线：id 要拼进请求路径，不能含 / 或 .. */
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** 已加载的清单；未加载完成为 null */
let index: PostMeta[] | null = null;
/** 进行中的清单加载，避免重复请求 */
let pendingIndex: Promise<PostMeta[]> | null = null;
/** 已加载的正文，键为文章 id */
const bodies = new Map<string, string>();
/** 进行中的正文加载，键同上，避免重复请求 */
const pendingBodies = new Map<string, Promise<string>>();

/** id 是否合法。不合法的一律当作不存在，绝不用它去拼请求路径 */
export function isValidPostId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/** 已加载完成的清单，供同步渲染；尚未加载完则为 null */
export function loadedPostIndex(): PostMeta[] | null {
  return index;
}

/** 按 id 取文章元信息；清单未加载完或 id 不存在则为 null */
export function findPost(id: string | null | undefined): PostMeta | null {
  if (!id) return null;
  return index?.find((post) => post.id === id) ?? null;
}

/** 加载清单。失败不缓存，下次重绘可重试 */
export function loadPostIndex(): Promise<PostMeta[]> {
  if (!pendingIndex) {
    pendingIndex = fetchJson<PostIndexFile>(INDEX_URL).then(
      (file) => {
        index = file.posts ?? [];
        return index;
      },
      (err: unknown) => {
        pendingIndex = null;
        throw err;
      }
    );
  }
  return pendingIndex;
}

/** 加载某篇文章的 markdown 原文。按 id 缓存，重复渲染不再请求 */
export function loadPostBody(id: string): Promise<string> {
  const cached = bodies.get(id);
  if (cached !== undefined) return Promise.resolve(cached);

  let pending = pendingBodies.get(id);
  if (!pending) {
    pending = fetchText(`${DIR}${id}.md`).then(
      (text) => {
        bodies.set(id, text);
        pendingBodies.delete(id);
        return text;
      },
      (err: unknown) => {
        pendingBodies.delete(id);
        throw err;
      }
    );
    pendingBodies.set(id, pending);
  }
  return pending;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(t("post.readFailed", { url, status: res.status }));
  return res.text();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(t("post.readFailed", { url, status: res.status }));
  return (await res.json()) as T;
}
