/** 复制到剪贴板。非安全上下文或没有权限时返回 false，由调用方决定怎么提示 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
