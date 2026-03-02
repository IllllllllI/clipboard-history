/**
 * 格式化时间戳为中文短日期
 */
export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(ts));
}

/**
 * 拆分时间戳为两行展示：
 * - 上行：月日（如 3月2日）
 * - 下行：时分（如 22:39）
 */
export function formatDateParts(ts: number): { dateLine: string; timeLine: string } {
  const date = new Date(ts);
  const dateLine = new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
  }).format(date);

  const timeLine = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  return { dateLine, timeLine };
}
