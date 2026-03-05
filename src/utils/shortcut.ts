// ── Types ────────────────────────────────────────────────────────

export type ParsedShortcut = {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  ctrlOrMeta: boolean;
  key: string;
};

// ── Constants ────────────────────────────────────────────────────

/**
 * 修饰键的 KeyboardEvent.key 值集合。
 * ShortcutRecorder 用来过滤"只按了修饰键"的事件。
 */
export const MODIFIER_KEYS: ReadonlySet<string> = new Set([
  'Control', 'Shift', 'Alt', 'Meta',
]);

/** 应用内保留快捷键，不可被沉浸模式快捷键覆盖 */
export const RESERVED_APP_SHORTCUTS = [
  { shortcut: 'ArrowUp', label: '列表上移' },
  { shortcut: 'ArrowDown', label: '列表下移' },
  { shortcut: 'Enter', label: '回车粘贴' },
  { shortcut: 'Escape', label: '关闭图片预览' },
  { shortcut: 'CtrlOrMeta+C', label: '复制当前项' },
] as const;

const LIKELY_SYSTEM_CONFLICT_SHORTCUTS = [
  {
    shortcut: 'Alt+Z',
    warning: 'Alt+Z 在部分 Windows 环境会被系统/驱动占用，建议改为 Ctrl+Shift+Z 或 Ctrl+Alt+Z',
  },
] as const;

// ── Bounded parse cache ──────────────────────────────────────────

/** 有界缓存上限——快捷键种类有限，64 绰绰有余 */
const PARSE_CACHE_LIMIT = 64;
const parseCache = new Map<string, ParsedShortcut | null>();

// ── Key normalization (unified) ──────────────────────────────────

/**
 * 从快捷键字符串的 token 标准化键名。
 * 例: "Esc" → "Escape", "a" → "A", "F5" → "F5", "space" → "Space"
 */
function normalizeKeyFromString(raw: string): string {
  const key = raw.toLowerCase();
  if (key === 'esc' || key === 'escape') return 'Escape';
  if (key === 'enter' || key === 'return') return 'Enter';
  if (key === 'space' || key === 'spacebar') return 'Space';
  if (key === 'tab') return 'Tab';
  if (key === 'backspace') return 'Backspace';
  if (key === 'delete' || key === 'del') return 'Delete';
  if (key === 'arrowup' || key === 'up') return 'ArrowUp';
  if (key === 'arrowdown' || key === 'down') return 'ArrowDown';
  if (key === 'arrowleft' || key === 'left') return 'ArrowLeft';
  if (key === 'arrowright' || key === 'right') return 'ArrowRight';
  if (/^f\d{1,2}$/.test(key)) return key.toUpperCase();
  if (key.length === 1) return key.toUpperCase();
  return raw;
}

/**
 * 从 KeyboardEvent.code 提取物理键标准名。
 * 优先使用：布局无关，兼容 AZERTY / Dvorak 等。
 * 返回 null 表示无法识别（回退到 normalizeEventKey）。
 */
export function normalizeCodeName(code: string): string | null {
  if (!code) return null;
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  if (code === 'Space') return 'Space';
  if (code === 'Minus') return '-';
  if (code === 'Equal') return '=';
  if (code === 'BracketLeft') return '[';
  if (code === 'BracketRight') return ']';
  if (code === 'Backslash') return '\\';
  if (code === 'Semicolon') return ';';
  if (code === 'Quote') return "'";
  if (code === 'Comma') return ',';
  if (code === 'Period') return '.';
  if (code === 'Slash') return '/';
  if (code === 'Backquote') return '`';
  if (code === 'Escape') return 'Escape';
  if (code === 'Enter') return 'Enter';
  if (code === 'Tab') return 'Tab';
  if (code === 'Backspace') return 'Backspace';
  if (code === 'Delete') return 'Delete';
  if (code === 'ArrowUp') return 'ArrowUp';
  if (code === 'ArrowDown') return 'ArrowDown';
  if (code === 'ArrowLeft') return 'ArrowLeft';
  if (code === 'ArrowRight') return 'ArrowRight';
  if (code.startsWith('Numpad') && code.length > 6) return code;
  return null;
}

/**
 * 从 KeyboardEvent.key 标准化键名。
 * 当 normalizeCodeName 返回 null 时使用（回退路径）。
 */
export function normalizeEventKey(key: string): string | null {
  if (!key || key === 'Dead' || key === 'Process') return null;
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  const lower = key.toLowerCase();
  if (lower === 'esc') return 'Escape';
  if (lower === 'return') return 'Enter';
  if (lower === 'spacebar') return 'Space';
  if (lower === 'up') return 'ArrowUp';
  if (lower === 'down') return 'ArrowDown';
  if (lower === 'left') return 'ArrowLeft';
  if (lower === 'right') return 'ArrowRight';
  return key; // Escape, Enter, ArrowUp 等标准值直接返回
}

// ── Core parsing ─────────────────────────────────────────────────

function parseShortcut(shortcut: string): ParsedShortcut | null {
  const normalized = shortcut.trim();
  if (!normalized) return null;

  const cached = parseCache.get(normalized);
  if (cached !== undefined) return cached;

  const tokens = normalized.split('+').map(t => t.trim()).filter(Boolean);
  if (tokens.length === 0) {
    parseCache.set(normalized, null);
    return null;
  }

  const parsed: ParsedShortcut = {
    ctrl: false, alt: false, shift: false, meta: false, ctrlOrMeta: false, key: '',
  };

  for (const tokenRaw of tokens) {
    const token = tokenRaw.toLowerCase();
    if (token === 'ctrl' || token === 'control') { parsed.ctrl = true; continue; }
    if (token === 'alt' || token === 'option') { parsed.alt = true; continue; }
    if (token === 'shift') { parsed.shift = true; continue; }
    if (token === 'meta' || token === 'cmd' || token === 'command' || token === 'super') { parsed.meta = true; continue; }
    if (token === 'commandorcontrol' || token === 'cmdorctrl' || token === 'ctrlorcommand' || token === 'ctrlormeta') { parsed.ctrlOrMeta = true; continue; }
    parsed.key = normalizeKeyFromString(tokenRaw);
  }

  const result = parsed.key ? parsed : null;

  // 有界缓存——满时清空重来
  if (parseCache.size >= PARSE_CACHE_LIMIT) parseCache.clear();
  parseCache.set(normalized, result);

  return result;
}

// ── Formatting ───────────────────────────────────────────────────

/**
 * 将快捷键字符串标准化为 "Ctrl+Meta+Alt+Shift+Key" 规范格式。
 * 返回 null 表示无法解析。
 */
export function normalizeShortcut(shortcut: string): string | null {
  const parsed = parseShortcut(shortcut);
  if (!parsed) return null;

  const parts: string[] = [];
  if (parsed.ctrlOrMeta) parts.push('CtrlOrMeta');
  else {
    if (parsed.ctrl) parts.push('Ctrl');
    if (parsed.meta) parts.push('Meta');
  }
  if (parsed.alt) parts.push('Alt');
  if (parsed.shift) parts.push('Shift');
  parts.push(parsed.key);
  return parts.join('+');
}

/**
 * 从 KeyboardEvent 构建标准化快捷键字符串。
 * 返回 null 表示只按了修饰键或无法识别。
 *
 * ShortcutRecorder 和 matchesShortcut 共用此标准化逻辑，
 * 确保 "录制 → 存储 → 匹配" 全链路一致。
 */
export function formatShortcutFromEvent(
  e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>,
): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;

  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.metaKey) parts.push('Meta');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  const keyName = normalizeCodeName(e.code) ?? normalizeEventKey(e.key);
  if (!keyName) return null;
  parts.push(keyName);

  return parts.join('+');
}

// ── Comparison ───────────────────────────────────────────────────

/**
 * 判断两个快捷键字符串是否等价。
 * 基于结构体比较，不依赖字符串替换——CtrlOrMeta 可匹配 Ctrl 或 Meta。
 */
export function areShortcutsEquivalent(a: string, b: string): boolean {
  const pa = parseShortcut(a);
  const pb = parseShortcut(b);
  if (!pa || !pb) return false;
  if (pa.key !== pb.key || pa.alt !== pb.alt || pa.shift !== pb.shift) return false;

  // CtrlOrMeta 与 Ctrl / Meta 互等
  if (pa.ctrlOrMeta || pb.ctrlOrMeta) {
    const aHasCtrlish = pa.ctrl || pa.meta || pa.ctrlOrMeta;
    const bHasCtrlish = pb.ctrl || pb.meta || pb.ctrlOrMeta;
    return aHasCtrlish === bHasCtrlish;
  }

  return pa.ctrl === pb.ctrl && pa.meta === pb.meta;
}

// ── Event matching ───────────────────────────────────────────────

/**
 * 判断 KeyboardEvent 是否匹配给定快捷键描述字符串。
 *
 * - 支持 CtrlOrMeta / CmdOrCtrl 修饰符
 * - 主键优先使用 e.code（布局无关），回退到 e.key
 * - 自动忽略 repeat 事件
 */
export function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);
  if (!parsed || e.repeat) return false;

  // ── 修饰键检查 ──
  if (parsed.ctrlOrMeta) {
    if (!(e.ctrlKey || e.metaKey)) return false;
  } else {
    if (e.ctrlKey !== parsed.ctrl) return false;
    if (e.metaKey !== parsed.meta) return false;
  }
  if (e.altKey !== parsed.alt) return false;
  if (e.shiftKey !== parsed.shift) return false;

  // ── 主键检查——code-first 标准化，与 formatShortcutFromEvent 一致 ──
  const eventKey = normalizeCodeName(e.code) ?? normalizeEventKey(e.key);
  return eventKey === parsed.key;
}

// ── Validation (settings UI) ─────────────────────────────────────

/** 检查快捷键是否与应用保留快捷键冲突，返回冲突项或 null */
export function isReservedAppShortcut(
  shortcut: string,
): typeof RESERVED_APP_SHORTCUTS[number] | null {
  return RESERVED_APP_SHORTCUTS.find(item =>
    areShortcutsEquivalent(shortcut, item.shortcut),
  ) ?? null;
}

export function getGlobalShortcutConflict(globalShortcut: string, immersiveShortcut: string): string | null {
  if (!globalShortcut.trim()) return '全局唤起快捷键不能为空';
  if (areShortcutsEquivalent(globalShortcut, immersiveShortcut)) return '不能与沉浸模式快捷键重复';
  return null;
}

export function getImmersiveShortcutConflict(immersiveShortcut: string, globalShortcut: string): string | null {
  if (!immersiveShortcut.trim()) return '沉浸模式快捷键不能为空';
  if (areShortcutsEquivalent(immersiveShortcut, globalShortcut)) return '不能与全局唤起快捷键重复';
  const reserved = isReservedAppShortcut(immersiveShortcut);
  if (reserved) return `与应用内快捷键冲突：${reserved.label}`;
  return null;
}

export function getLikelySystemShortcutWarning(shortcut: string): string | null {
  if (!shortcut.trim()) return null;
  const matched = LIKELY_SYSTEM_CONFLICT_SHORTCUTS.find(item =>
    areShortcutsEquivalent(shortcut, item.shortcut),
  );
  return matched ? matched.warning : null;
}
