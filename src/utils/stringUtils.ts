/**
 * 转义正则特殊字符，用于安全地高亮搜索词
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
