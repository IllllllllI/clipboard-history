// ── Types ────────────────────────────────────────────────────────

/** 拆分后的日期/时间两行文本，供 ClipItemTimeMeta / HUD 等 UI 消费 */
export interface DateParts {
  /** 月日，如 "3月2日" */
  dateLine: string;
  /** 时分（24h），如 "22:39" */
  timeLine: string;
}

// ── Singleton formatters ─────────────────────────────────────────
// Intl.DateTimeFormat 构造器需解析 locale 数据，代价较高。
// MDN 推荐复用实例——此处作为模块级单例，整个应用共享。

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'short',
  day: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

// ── Public API ───────────────────────────────────────────────────

/**
 * 拆分时间戳为两行展示：
 * - dateLine：月日（如 "3月2日"）
 * - timeLine：时分（如 "22:39"）
 *
 * 内部复用单例 `Intl.DateTimeFormat`，无额外分配。
 */
export function formatDateParts(ts: number): DateParts {
  const date = new Date(ts);
  return {
    dateLine: dateFormatter.format(date),
    timeLine: timeFormatter.format(date),
  };
}
