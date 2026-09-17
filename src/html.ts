// HTML 文本处理辅助

/** 转义文本中的 HTML 特殊字符，用于安全地拼接进 innerHTML */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}
