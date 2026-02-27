/**
 * 日期时间文本检测与格式转换工具
 * 支持在任意文本中查找并解析嵌入的日期时间片段
 *
 * 设计要点：
 * - 统一模式定义：每种日期格式只定义一次（pattern + inlineSource），
 *   自动派生锚点验证正则和内联搜索正则，避免双重维护。
 * - 复用辅助函数：AM/PM 转换、日期创建、时间戳范围校验等抽取为独立函数。
 */

// ============================================================================
// 常量
// ============================================================================

/** 时间戳有效范围（秒）：2001-01-01 ~ 2099-12-31 */
const TS_MIN_SEC = 978_307_200;
const TS_MAX_SEC = 4_102_444_800;

const MS_MINUTE = 60_000;
const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

/** parseDateTimeText 接受的最大文本长度 */
const MAX_TEXT_LENGTH = 100;

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'] as const;

/** 判断文本是否为时间戳格式 */
const TIMESTAMP_RE = /^1\d{9,12}$/;

// ============================================================================
// 辅助工具函数
// ============================================================================

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

/** 根据 AM/PM 或 上午/下午 调整小时值为 24 小时制 */
function adjustAmPm(hour: number, ampm: string): number {
    const norm = ampm.toLowerCase();
    if (norm === 'pm' || norm === '下午') return hour < 12 ? hour + 12 : hour;
    if (norm === 'am' || norm === '上午') return hour === 12 ? 0 : hour;
    return hour;
}

/** 创建本地日期并校验有效性，无效返回 null */
function safeDate(year: number, month: number, day: number, h = 0, mi = 0, s = 0): Date | null {
    const d = new Date(year, month, day, h, mi, s);
    return isNaN(d.getTime()) ? null : d;
}

/** 校验秒级时间戳范围，返回 Date 或 null */
function fromTimestampSec(ts: number): Date | null {
    return (ts >= TS_MIN_SEC && ts <= TS_MAX_SEC) ? new Date(ts * 1000) : null;
}

/** 校验毫秒级时间戳范围，返回 Date 或 null */
function fromTimestampMs(ts: number): Date | null {
    const min = TS_MIN_SEC * 1000;
    const max = TS_MAX_SEC * 1000;
    return (ts >= min && ts <= max) ? new Date(ts) : null;
}

// ============================================================================
// 统一模式系统
// ============================================================================

/**
 * 日期时间模式定义
 * - pattern:      带 ^$ 锚点的完整正则，用于精确验证 + 捕获解析
 * - inlineSource: 无锚点的正则源字符串，用于内联搜索候选定位。
 *                 为 null 表示不参与内联搜索（如时间戳、英文月份等）
 * - hasDate / hasTime: 匹配结果语义
 * - parse:        从匹配捕获组解析 Date 的函数
 */
interface DateTimePattern {
    pattern: RegExp;
    inlineSource: string | null;
    hasDate: boolean;
    hasTime: boolean;
    parse: (m: RegExpMatchArray) => Date | null;
}

const PATTERNS: DateTimePattern[] = [
    // ISO 8601 完整: 2024-01-15T14:30:00Z, 2024-01-15T14:30:00+08:00
    {
        pattern: /^(\d{4})-(\d{1,2})-(\d{1,2})[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|([+-]\d{2}:?\d{2}))?$/,
        inlineSource: '\\d{4}-\\d{1,2}-\\d{1,2}[T ]\\d{1,2}:\\d{2}(?::\\d{2})?',
        hasDate: true, hasTime: true,
        parse: (m) => {
            const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T${m[4].padStart(2, '0')}:${m[5]}:${m[6] || '00'}${m[7] || ''}`;
            const d = new Date(iso);
            return isNaN(d.getTime()) ? null : d;
        },
    },
    // ISO 日期: 2024-01-15
    {
        pattern: /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
        inlineSource: '\\d{4}-\\d{1,2}-\\d{1,2}',
        hasDate: true, hasTime: false,
        parse: (m) => safeDate(+m[1], +m[2] - 1, +m[3]),
    },
    // 斜杠日期+时间: 2024/01/15 14:30:00
    {
        pattern: /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
        inlineSource: '\\d{4}/\\d{1,2}/\\d{1,2} \\d{1,2}:\\d{2}(?::\\d{2})?',
        hasDate: true, hasTime: true,
        parse: (m) => safeDate(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)),
    },
    // 斜杠日期: 2024/01/15
    {
        pattern: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
        inlineSource: '\\d{4}/\\d{1,2}/\\d{1,2}',
        hasDate: true, hasTime: false,
        parse: (m) => safeDate(+m[1], +m[2] - 1, +m[3]),
    },
    // 点号日期+时间: 2024.01.15 14:30:00
    {
        pattern: /^(\d{4})\.(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
        inlineSource: '\\d{4}\\.\\d{1,2}\\.\\d{1,2} \\d{1,2}:\\d{2}(?::\\d{2})?',
        hasDate: true, hasTime: true,
        parse: (m) => safeDate(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)),
    },
    // 点号日期: 2024.01.15
    {
        pattern: /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/,
        inlineSource: '\\d{4}\\.\\d{1,2}\\.\\d{1,2}',
        hasDate: true, hasTime: false,
        parse: (m) => safeDate(+m[1], +m[2] - 1, +m[3]),
    },
    // 中文日期+时间: 2024年1月15日 14:30:00, 2024年01月15日 下午2:30
    {
        pattern: /^(\d{4})年(\d{1,2})月(\d{1,2})日\s*(?:(上午|下午|AM|PM)\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?$/i,
        inlineSource: '\\d{4}年\\d{1,2}月\\d{1,2}日\\s*(?:(?:上午|下午)\\s*)?\\d{1,2}:\\d{2}(?::\\d{2})?',
        hasDate: true, hasTime: true,
        parse: (m) => safeDate(+m[1], +m[2] - 1, +m[3], adjustAmPm(+m[5], m[4] || ''), +m[6], +(m[7] || 0)),
    },
    // 中文日期: 2024年1月15日
    {
        pattern: /^(\d{4})年(\d{1,2})月(\d{1,2})日$/,
        inlineSource: '\\d{4}年\\d{1,2}月\\d{1,2}日',
        hasDate: true, hasTime: false,
        parse: (m) => safeDate(+m[1], +m[2] - 1, +m[3]),
    },
    // 带星期的中文: 星期一 2024年1月15日（不参与内联搜索，由中文日期模式覆盖）
    {
        pattern: /^星期[一二三四五六日]\s*(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*(?:(上午|下午)\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
        inlineSource: null,
        hasDate: true, hasTime: false,
        parse: (m) => {
            const d = safeDate(+m[1], +m[2] - 1, +m[3]);
            if (!d) return null;
            if (m[5]) {
                d.setHours(adjustAmPm(+m[5], m[4] || ''), +m[6], +(m[7] || 0));
            }
            return isNaN(d.getTime()) ? null : d;
        },
    },
    // 英文月份日期: Jan 15, 2024 或 January 15, 2024 14:30（不参与内联搜索，易误匹配）
    {
        pattern: /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?$/i,
        inlineSource: null,
        hasDate: true, hasTime: false,
        parse: (m) => {
            const d = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
            if (isNaN(d.getTime())) return null;
            if (m[4]) {
                d.setHours(adjustAmPm(+m[4], m[7] || ''), +m[5], +(m[6] || 0));
            }
            return isNaN(d.getTime()) ? null : d;
        },
    },
    // 纯时间: 14:30, 14:30:00, 2:30 PM（内联搜索由下方独立短模式覆盖）
    {
        pattern: /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM|am|pm))?$/,
        inlineSource: null,
        hasDate: false, hasTime: true,
        parse: (m) => {
            const hour = adjustAmPm(+m[1], m[4] || '');
            if (hour > 23 || +m[2] > 59 || +(m[3] || 0) > 59) return null;
            const d = new Date();
            d.setHours(hour, +m[2], +(m[3] || 0), 0);
            return d;
        },
    },
    // Unix 时间戳（秒）: 10位数字（不参与内联搜索，避免误匹配普通数字）
    {
        pattern: /^(1\d{9})$/,
        inlineSource: null,
        hasDate: true, hasTime: true,
        parse: (m) => fromTimestampSec(+m[1]),
    },
    // Unix 时间戳（毫秒）: 13位数字
    {
        pattern: /^(1\d{12})$/,
        inlineSource: null,
        hasDate: true, hasTime: true,
        parse: (m) => fromTimestampMs(+m[1]),
    },
];

/**
 * 内联搜索专用的短模式（仅用于候选定位，实际解析由 parseDateTimeText 完成）
 * 这些模式作为 PATTERNS 中纯时间模式在内联搜索场景的补充
 */
const INLINE_ONLY_SOURCES: string[] = [
    '\\d{1,2}:\\d{2}:\\d{2}',                    // HH:MM:SS
    '\\d{1,2}:\\d{2}\\s*(?:AM|PM|am|pm)',        // HH:MM AM/PM
    '\\d{1,2}:\\d{2}',                           // HH:MM
];

/**
 * 从统一模式定义自动构建内联搜索正则
 * 按匹配长度从长到短排列（alternation 左优先保证最长匹配）
 */
const INLINE_RE_SOURCE = [
    ...PATTERNS.filter(p => p.inlineSource !== null).map(p => p.inlineSource!),
    ...INLINE_ONLY_SOURCES,
].join('|');

// ============================================================================
// 导出类型
// ============================================================================

export interface DateTimeInfo {
    original: string;
    date: Date;
    hasDate: boolean;
    hasTime: boolean;
    isTimestamp: boolean;
}

export interface DateTimeMatch {
    start: number;
    end: number;
    text: string;
    info: DateTimeInfo;
}

// ============================================================================
// 核心检测 / 解析函数
// ============================================================================

/**
 * 检测文本是否为纯日期时间格式
 */
export function isDateTimeText(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_TEXT_LENGTH) return false;
    return PATTERNS.some(({ pattern }) => pattern.test(trimmed));
}

/**
 * 解析日期时间文本，返回解析结果或 null
 */
export function parseDateTimeText(text: string): DateTimeInfo | null {
    const trimmed = text.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_TEXT_LENGTH) return null;

    for (const { pattern, hasDate, hasTime, parse } of PATTERNS) {
        const match = trimmed.match(pattern);
        if (match) {
            const date = parse(match);
            if (date) {
                const isTimestamp = TIMESTAMP_RE.test(trimmed);
                return { original: trimmed, date, hasDate, hasTime, isTimestamp };
            }
        }
    }
    return null;
}

// ============================================================================
// 嵌入式日期时间搜索（在任意文本中查找日期时间片段）
// ============================================================================

/** 判断内联匹配是否应跳过（边界检查：防止匹配版本号、IP 地址等误报） */
function shouldSkipInlineMatch(text: string, matchText: string, start: number, end: number): boolean {
    // 中文标记（年月日）旁的数字不视为边界问题
    const hasChinese = /[年月日]/.test(matchText);
    if (!hasChinese) {
        if (start > 0 && /\d/.test(text[start - 1])) return true;
        if (end < text.length && /\d/.test(text[end])) return true;
    }

    // 纯时间 HH:MM 的额外边界检查
    if (/^\d{1,2}:\d{2}$/.test(matchText)) {
        if (start > 0 && text[start - 1] === ':') return true;   // 如 IP 地址残留
        if (end < text.length && text[end] === ':') return true;
        if (start > 0 && text[start - 1] === '.') return true;   // 如版本号 1.2:30
    }

    return false;
}

/**
 * 在文本中查找所有嵌入的日期时间片段
 */
export function findDateTimesInText(text: string): DateTimeMatch[] {
    if (!text || text.length === 0) return [];

    const re = new RegExp(INLINE_RE_SOURCE, 'g');
    const matches: DateTimeMatch[] = [];
    let m: RegExpExecArray | null;

    while ((m = re.exec(text)) !== null) {
        const matchText = m[0];
        const start = m.index;
        const end = start + matchText.length;

        if (shouldSkipInlineMatch(text, matchText, start, end)) continue;

        const info = parseDateTimeText(matchText.trim());
        if (info) {
            matches.push({ start, end, text: matchText, info });
        }
    }

    return matches;
}

/**
 * 检查文本中是否包含日期时间片段（首次匹配即返回，避免全量搜索）
 */
export function hasDateTimeInText(text: string): boolean {
    if (!text || text.length === 0) return false;

    const re = new RegExp(INLINE_RE_SOURCE, 'g');
    let m: RegExpExecArray | null;

    while ((m = re.exec(text)) !== null) {
        const matchText = m[0];
        const start = m.index;
        const end = start + matchText.length;

        if (shouldSkipInlineMatch(text, matchText, start, end)) continue;
        if (parseDateTimeText(matchText.trim())) return true;
    }

    return false;
}

// ============================================================================
// 格式化输出
// ============================================================================

/**
 * 获取相对时间描述
 */
function getRelativeTime(d: Date): string {
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const absDiff = Math.abs(diff);
    const isFuture = diff < 0;
    const suffix = isFuture ? '后' : '前';

    if (absDiff < MS_MINUTE) return '刚刚';

    const minutes = Math.floor(absDiff / MS_MINUTE);
    if (minutes < 60) return `${minutes}分钟${suffix}`;

    const hours = Math.floor(absDiff / MS_HOUR);
    if (hours < 24) return `${hours}小时${suffix}`;

    const days = Math.floor(absDiff / MS_DAY);
    if (days < 30) return `${days}天${suffix}`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months}个月${suffix}`;

    const years = Math.floor(days / 365);
    return `${years}年${suffix}`;
}

/**
 * 获取日期时间的快捷复制格式列表
 */
export function getDateTimeFormats(info: DateTimeInfo): { label: string; value: string }[] {
    const { date, hasDate, hasTime, isTimestamp } = info;
    const formats: { label: string; value: string }[] = [];

    const y = date.getFullYear();
    const mo = pad2(date.getMonth() + 1);
    const d = pad2(date.getDate());
    const h = pad2(date.getHours());
    const mi = pad2(date.getMinutes());
    const s = pad2(date.getSeconds());
    const weekday = WEEKDAY_CN[date.getDay()];

    // 1. 相对时间（作为首选项，方便查看）
    if (hasDate) {
        formats.push({ label: '相对', value: getRelativeTime(date) });
    }

    if (hasDate && hasTime) {
        formats.push({ label: 'ISO', value: `${y}-${mo}-${d} ${h}:${mi}:${s}` });
        formats.push({ label: '日期', value: `${y}-${mo}-${d}` });
        formats.push({ label: '时间', value: `${h}:${mi}:${s}` });
        formats.push({ label: '中文', value: `${y}年${+mo}月${+d}日 ${h}:${mi}` });
        formats.push({ label: '斜杠', value: `${y}/${mo}/${d} ${h}:${mi}:${s}` });
        formats.push({ label: '星期', value: `星期${weekday}` });
    } else if (hasDate) {
        formats.push({ label: 'ISO', value: `${y}-${mo}-${d}` });
        formats.push({ label: '中文', value: `${y}年${+mo}月${+d}日` });
        formats.push({ label: '斜杠', value: `${y}/${mo}/${d}` });
        formats.push({ label: '星期', value: `星期${weekday}` });
        formats.push({ label: '完整', value: `${y}年${+mo}月${+d}日 星期${weekday}` });
    } else if (hasTime) {
        formats.push({ label: '24h', value: `${h}:${mi}:${s}` });
        formats.push({ label: '短时间', value: `${h}:${mi}` });
        const ampm = date.getHours() >= 12 ? '下午' : '上午';
        const h12 = date.getHours() % 12 || 12;
        formats.push({ label: '12h', value: `${ampm}${h12}:${mi}` });
    }

    // 时间戳转换
    const tsMs = date.getTime();
    const tsSec = Math.floor(tsMs / 1000);

    if (isTimestamp) {
        formats.push({ label: '秒', value: String(tsSec) });
        formats.push({ label: '毫秒', value: String(tsMs) });
    } else if (hasDate) {
        formats.push({ label: '秒戳', value: String(tsSec) });
        formats.push({ label: '毫秒戳', value: String(tsMs) });
    }

    return formats;
}
