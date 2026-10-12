// 文章视图：/posts 列出全部文章，/posts/<id> 渲染单篇 markdown

import type { AppActions, State } from "../core/config.js";
import { t } from "../core/i18n.js";
import { findPost, isValidPostId, loadPostBody, loadedPostIndex } from "./data.js";
import { decorateCodeBlocks } from "./render/code.js";
import type { PostMeta } from "./types.js";

/** 本模块的站点标识 */
const SITE = "posts";

/** 返回主站 */
const HOME = "main";

/** 页首 */
export function buildPostNav(state: State, actions: AppActions): Node {
  const nav = document.createElement("div");
  nav.className = "post-nav";

  if (state.extensionParam) {
    nav.appendChild(
      navButton(t("post.backList"), ARROW_LEFT, () => actions.openExtension(SITE, null))
    );
  }
  nav.appendChild(navButton(t("post.backHome"), HOME_ICON, () => actions.navigateToSite(HOME)));
  return nav;
}

const ARROW_LEFT =
  '<svg viewBox="0 0 16 16" width="19" height="19" fill="none" stroke="currentColor"' +
  ' stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M13.4 8H3.5"/><path d="M7.5 4 3.5 8l4 4"/>' +
  "</svg>";

const HOME_ICON =
  '<svg viewBox="0 0 16 16" width="19" height="19" fill="none" stroke="currentColor"' +
  ' stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M2.6 7.6 8 3.2l5.4 4.4V13H2.6z"/>' +
  "</svg>";

/** 视图主体：带 extensionParam（文章 id）则渲染正文页，否则渲染列表页 */
export function buildPostView(state: State, actions: AppActions): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "post-view";

  const id = state.extensionParam ?? null;
  const post = id && isValidPostId(id) ? findPost(id) : null;

  if (post) {
    renderDetail(wrap, post);
    document.title = `${post.title} | ${t("meta.title")}`;
  } else if (id) {
    wrap.appendChild(note(loadedPostIndex() ? t("post.notFound") : t("post.indexFailed")));
    document.title = t("meta.title");
  } else {
    renderList(wrap, state, actions);
    document.title = t("meta.title");
  }

  return wrap;
}

/** 列表页：按清单顺序列出全部文章 */
function renderList(wrap: HTMLElement, state: State, actions: AppActions): void {
  const posts = loadedPostIndex();
  if (!posts) {
    wrap.appendChild(note(t("post.indexFailed")));
    return;
  }
  if (posts.length === 0) {
    wrap.appendChild(note(t("post.empty")));
    return;
  }

  const list = document.createElement("ul");
  list.className = "post-list";
  posts.forEach((post) => {
    const li = document.createElement("li");
    li.appendChild(buildListLink(post, state, actions));
    list.appendChild(li);
  });
  wrap.appendChild(list);
}

/** 日期与作者同占一行，两项都没有则返回空串。列表页与正文页共用 */
function buildMetaLine(post: PostMeta): string {
  const parts: string[] = [];
  if (post.date) parts.push(post.date);
  if (post.author) parts.push(t("post.author", { name: post.author }));
  return parts.join(" · ");
}

/** 列表项做成链接，使中键或组合键点击仍能在新标签页打开 */
function buildListLink(post: PostMeta, state: State, actions: AppActions): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "post-list-link";
  link.href = `${state.config.path}/${encodeURIComponent(post.id)}`;

  link.appendChild(span("post-list-title", post.title));
  if (post.desc) link.appendChild(span("post-list-desc", post.desc));
  const meta = buildMetaLine(post);
  if (meta) link.appendChild(span("post-list-meta", meta));

  link.addEventListener("click", (ev) => {
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    actions.openExtension(SITE, post.id);
  });
  return link;
}

/** 正文页：标题与日期取自清单（同步可得），正文按需加载后填入 */
function renderDetail(wrap: HTMLElement, post: PostMeta): void {
  const header = document.createElement("div");
  header.className = "detail-header";
  const title = document.createElement("h2");
  title.textContent = post.title;
  header.appendChild(title);
  wrap.appendChild(header);

  const meta = buildMetaLine(post);
  if (meta) {
    const line = document.createElement("p");
    line.className = "post-meta";
    line.textContent = meta;
    wrap.appendChild(line);
  }

  const body = document.createElement("div");
  body.className = "post-body";
  body.textContent = t("common.loading");
  wrap.appendChild(body);

  // 站内翻页与主题切换都会重绘本页，故每次都取一次正文（已缓存则同步兑现）
  loadPostBody(post.id).then(
    (md) => renderMarkdown(md, body),
    (err: unknown) => {
      body.textContent = err instanceof Error ? err.message : String(err);
    }
  );
}

/**
 * 把 markdown 原文渲染进容器。
 * marked 只有本页用得上，故动态引入，由 esbuild 单独打成按需加载的分包，主包不受影响。
 * 文章由仓库作者编写，与站内其他文案同等可信，故保留其中的内联 HTML。
 */
async function renderMarkdown(md: string, target: HTMLElement): Promise<void> {
  const { marked } = await import("marked");
  // 公式那一套（KaTeX 的代码、样式与字体）只在文章确实写了 $ 时才拉，其余文章不受影响
  if (md.includes("$")) {
    const { configureMarked } = await import("./render/math.js");
    await configureMarked();
  }
  target.innerHTML = marked.parse(md, { async: false });
  // 语法高亮同理，只在正文确实有标了语言的代码块时才拉
  if (target.querySelector("code[class*='language-']")) {
    const { highlightCodeBlocks } = await import("./render/highlight.js");
    highlightCodeBlocks(target);
  }
  decorateCodeBlocks(target);
}

/** 页首的图标按钮。返回类操作不产生可分享的地址，故不用链接 */
function navButton(label: string, icon: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn";
  btn.innerHTML = icon;
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.addEventListener("click", onClick);
  return btn;
}

function span(className: string, text: string): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  return el;
}

function note(text: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "empty-note";
  p.textContent = text;
  return p;
}
