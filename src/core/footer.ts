// 页脚：左侧站点信息，右侧作者信息

/** 链接之间的分隔点。由 CSS 画成圆点，不写进文本内容，免得被复制或被读屏念出 */
const DOT = '<span class="footer-dot" aria-hidden="true"></span>';

/** 仓库最新一次 commit 的接口，per_page=1 即只取最新一条 */
const COMMITS_API = "https://api.github.com/repos/1592063346/oneleg/commits?per_page=1";

/** 提交时间固定按北京时间（UTC+8）折算，使各地访客看到同一天 */
const CN_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 取仓库最后一次 commit 的日期，格式 YYYY/MM/DD；失败时返回 null */
async function fetchLastCommit(): Promise<string | null> {
  try {
    const res = await fetch(COMMITS_API);
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ commit?: { committer?: { date?: string } } }>;
    const iso = data[0]?.commit?.committer?.date;
    if (!iso) return null;
    const at = new Date(new Date(iso).getTime() + CN_OFFSET_MS);
    const pad = (n: number): string => String(n).padStart(2, "0");
    return `${at.getUTCFullYear()}/${pad(at.getUTCMonth() + 1)}/${pad(at.getUTCDate())}`;
  } catch {
    return null;
  }
}

/**
 * 本地缓存：GitHub API 请求限流为每 IP 每小时 60 次，而每次刷新都是一次请求。
 * 存留一小时结果，刷新只读缓存不再请求；使得限流期间也仍有值可显示。
 */
const CACHE_KEY = "oneleg:lastCommit";
const CACHE_TTL_MS = 60 * 60 * 1000;

function readCache(): string | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { date?: string; at?: number };
    if (typeof saved.date !== "string" || typeof saved.at !== "number") return null;
    return Date.now() - saved.at > CACHE_TTL_MS ? null : saved.date;
  } catch {
    return null;
  }
}

function writeCache(date: string): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ date, at: Date.now() }));
  } catch {
  }
}

async function lastCommitDate(): Promise<string | null> {
  const cached = readCache();
  if (cached) return cached + " (缓存)";
  const date = await fetchLastCommit();
  if (date) writeCache(date);
  return date;
}

/** 进程内缓存：外壳每次重建都会重新调 buildFooter，同一个页面会话里不必重复请求 */
let lastCommit: Promise<string | null> | null = null;

export function buildFooter(): HTMLElement {
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="footer-col">
      <p class="footer-line"><a href="https://onelegocg.top/faq">关于网站</a>${DOT}<a href="https://github.com/1592063346/oneleg">网站仓库</a></p>
      <p class="footer-line footer-updated"></p>
      <p class="footer-line">卡片数据支持：<a href="https://ygocdb.com/">百鸽</a></p>
    </div>
    <div class="footer-col footer-right">
      <p class="footer-line">Created by <strong>Imagine076</strong></p>
      <p class="footer-line"><a href="https://space.bilibili.com/353773164">BiliBili</a>${DOT}<a href="https://qm.qq.com/q/4VHZybgazK">QQ</a></p>
    </div>
  `;

  lastCommit ??= lastCommitDate();
  const updated = footer.querySelector<HTMLElement>(".footer-updated");
  void lastCommit.then((date) => {
    if (!updated) return;
    // 取不到（断网、限流）就整行去掉
    if (date) updated.textContent = `最后更新于 ${date}`;
    else updated.remove();
  });

  return footer;
}
