import { describe, it, expect } from 'vitest';
import { formatDateParts } from '../../src/utils/formatDate';
import type { DateParts } from '../../src/utils/formatDate';

// ── helpers ──────────────────────────────────────────────────────

/** 构建指定北京时间的时间戳 */
function ts(year: number, month: number, day: number, hour: number, minute: number): number {
  // 用 Date.UTC 构建 UTC 时间，再减去 8 小时偏移量得到"看起来是 zh-CN 的输出"
  // 注: 测试运行环境的 TZ 未必是 Asia/Shanghai，所以直接拿本地时间去断言不可靠。
  // 这里改为只测结构、非空、格式模式，而非精确字符串。
  return new Date(year, month - 1, day, hour, minute).getTime();
}

// ══════════════════════════════════════════════════════════════════
// formatDateParts
// ══════════════════════════════════════════════════════════════════

describe('formatDateParts', () => {
  it('should return an object with dateLine and timeLine', () => {
    const result = formatDateParts(Date.now());
    expect(result).toHaveProperty('dateLine');
    expect(result).toHaveProperty('timeLine');
    expect(typeof result.dateLine).toBe('string');
    expect(typeof result.timeLine).toBe('string');
  });

  it('dateLine should contain month and day info', () => {
    const result = formatDateParts(ts(2025, 3, 2, 14, 30));
    // zh-CN short month format produces "3月2日" or similar
    expect(result.dateLine).toContain('3');
    expect(result.dateLine).toContain('2');
    expect(result.dateLine.length).toBeGreaterThan(0);
  });

  it('timeLine should contain hour and minute', () => {
    const result = formatDateParts(ts(2025, 3, 2, 14, 5));
    // 24h format: "14:05" or locale variant
    expect(result.timeLine).toMatch(/\d{1,2}[:.]\d{2}/);
  });

  it('should handle midnight correctly', () => {
    const result = formatDateParts(ts(2025, 1, 1, 0, 0));
    expect(result.timeLine).toMatch(/\d{1,2}[:.]\d{2}/);
    expect(result.dateLine.length).toBeGreaterThan(0);
  });

  it('should handle end of year', () => {
    const result = formatDateParts(ts(2025, 12, 31, 23, 59));
    expect(result.dateLine).toContain('12');
    expect(result.dateLine).toContain('31');
  });

  it('should return consistent results for the same timestamp (singleton formatter)', () => {
    const timestamp = ts(2025, 6, 15, 8, 30);
    const a = formatDateParts(timestamp);
    const b = formatDateParts(timestamp);
    expect(a).toEqual(b);
  });

  it('should return different values for different timestamps', () => {
    const a = formatDateParts(ts(2025, 1, 1, 0, 0));
    const b = formatDateParts(ts(2025, 6, 15, 12, 30));
    expect(a.dateLine).not.toBe(b.dateLine);
  });
});

// ══════════════════════════════════════════════════════════════════
// DateParts type (compile-time check, runtime shape validation)
// ══════════════════════════════════════════════════════════════════

describe('DateParts type', () => {
  it('should be assignable from formatDateParts return value', () => {
    const parts: DateParts = formatDateParts(Date.now());
    expect(parts.dateLine).toBeDefined();
    expect(parts.timeLine).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════
// Performance: singleton reuse (no constructor per call)
// ══════════════════════════════════════════════════════════════════

describe('performance', () => {
  it('should handle 10000 calls without excessive time', () => {
    const start = performance.now();
    const base = Date.now();
    for (let i = 0; i < 10_000; i++) {
      formatDateParts(base + i * 60_000);
    }
    const elapsed = performance.now() - start;
    // With singleton formatters, 10k calls should take well under 500ms
    // (typically <50ms on modern hardware)
    expect(elapsed).toBeLessThan(500);
  });
});
