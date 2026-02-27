/**
 * 格式化时间戳为中文短日期
 */
export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(ts));
}
