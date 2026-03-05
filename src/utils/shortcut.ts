type ParsedShortcut = {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  ctrlOrMeta: boolean;
  key: string;
};

const MODIFIER_ORDER = ['CtrlOrMeta', 'Ctrl', 'Meta', 'Alt', 'Shift'] as const;

/** 有界 LRU 缓存上限——快捷键种类有限，32 绰绰有余 */
const PARSE_CACHE_LIMIT = 32;
const parseCache = new Map<string, ParsedShortcut | null>();

function normalizeKey(raw: string): string {
  const key = raw.toLowerCase();
  if (key === 'esc' || key === 'escape') return 'Escape';
  if (key === 'enter' || key === 'return') return 'Enter';
  if (key === 'arrowup' || key === 'up') return 'ArrowUp';
  if (key === 'arrowdown' || key === 'down') return 'ArrowDown';
  if (key === 'arrowleft' || key === 'left') return 'ArrowLeft';
  if (key === 'arrowright' || key === 'right') return 'ArrowRight';
  if (key.length === 1) return key.toUpperCase();
  return raw;
}

function parseShortcut(shortcut: string): ParsedShortcut | null {
  const normalized = shortcut.trim();
  if (!normalized) return null;

  const cached = parseCache.get(normalized);
  if (cached !== undefined) return cached;

  const tokens = normalized
    .split('+')
    .map(t => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    parseCache.set(normalized, null);
    return null;
  }

  const parsed: ParsedShortcut = {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    ctrlOrMeta: false,
    key: '',
  };

  for (const tokenRaw of tokens) {
    const token = tokenRaw.toLowerCase();
    if (token === 'ctrl' || token === 'control') {
      parsed.ctrl = true;
      continue;
    }
    if (token === 'alt' || token === 'option') {
      parsed.alt = true;
      continue;
    }
    if (token === 'shift') {
      parsed.shift = true;
      continue;
    }
    if (token === 'meta' || token === 'cmd' || token === 'command' || token === 'super') {
      parsed.meta = true;
      continue;
    }
    if (token === 'commandorcontrol' || token === 'cmdorctrl') {
      parsed.ctrlOrMeta = true;
      continue;
    }
    parsed.key = normalizeKey(tokenRaw);
  }

  const result = parsed.key ? parsed : null;

  // 有界缓存——满了清空重来，避免无限增长
  if (parseCache.size >= PARSE_CACHE_LIMIT) parseCache.clear();
  parseCache.set(normalized, result);

  return result;
}

export function normalizeShortcut(shortcut: string): string | null {
  const parsed = parseShortcut(shortcut);
  if (!parsed) return null;

  const modifiers: string[] = [];
  if (parsed.ctrlOrMeta) {
    modifiers.push('CtrlOrMeta');
  } else {
    if (parsed.ctrl) modifiers.push('Ctrl');
    if (parsed.meta) modifiers.push('Meta');
  }
  if (parsed.alt) modifiers.push('Alt');
  if (parsed.shift) modifiers.push('Shift');

  modifiers.sort((a, b) => MODIFIER_ORDER.indexOf(a as typeof MODIFIER_ORDER[number]) - MODIFIER_ORDER.indexOf(b as typeof MODIFIER_ORDER[number]));
  return [...modifiers, parsed.key].join('+');
}

export function areShortcutsEquivalent(a: string, b: string): boolean {
  const left = normalizeShortcut(a);
  const right = normalizeShortcut(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const ctrlMetaPairs = [
    ['CtrlOrMeta', 'Ctrl'],
    ['CtrlOrMeta', 'Meta'],
  ] as const;

  return ctrlMetaPairs.some(([from, to]) => left.replace(from, to) === right || right.replace(from, to) === left);
}

const RESERVED_APP_SHORTCUTS = [
  { shortcut: 'ArrowUp', label: '列表上移' },
  { shortcut: 'ArrowDown', label: '列表下移' },
  { shortcut: 'Enter', label: '回车粘贴' },
  { shortcut: 'Escape', label: '关闭图片预览' },
  { shortcut: 'CtrlOrMeta+C', label: '复制当前项' },
] as const;

export function getGlobalShortcutConflict(globalShortcut: string, immersiveShortcut: string): string | null {
  if (!globalShortcut.trim()) {
    return '全局唤起快捷键不能为空';
  }

  if (areShortcutsEquivalent(globalShortcut, immersiveShortcut)) {
    return '不能与沉浸模式快捷键重复';
  }

  return null;
}

export function getImmersiveShortcutConflict(immersiveShortcut: string, globalShortcut: string): string | null {
  if (!immersiveShortcut.trim()) {
    return '沉浸模式快捷键不能为空';
  }

  if (areShortcutsEquivalent(immersiveShortcut, globalShortcut)) {
    return '不能与全局唤起快捷键重复';
  }

  const reserved = RESERVED_APP_SHORTCUTS.find(item => areShortcutsEquivalent(immersiveShortcut, item.shortcut));
  if (reserved) {
    return `与应用内快捷键冲突：${reserved.label}`;
  }

  return null;
}

const LIKELY_SYSTEM_CONFLICT_SHORTCUTS = [
  {
    shortcut: 'Alt+Z',
    warning: 'Alt+Z 在部分 Windows 环境会被系统/驱动占用，建议改为 Ctrl+Shift+Z 或 Ctrl+Alt+Z',
  },
] as const;

export function getLikelySystemShortcutWarning(shortcut: string): string | null {
  if (!shortcut.trim()) return null;

  const matched = LIKELY_SYSTEM_CONFLICT_SHORTCUTS.find(item =>
    areShortcutsEquivalent(shortcut, item.shortcut),
  );

  return matched ? matched.warning : null;
}

// ── KeyboardEvent 匹配 ──────────────────────────────────────────

/**
 * 判断 KeyboardEvent 是否匹配给定快捷键描述字符串。
 *
 * - 支持 `CmdOrCtrl` / `CommandOrControl` 修饰符
 * - 字母键优先使用 `e.code` 匹配，兼容非 QWERTY 布局
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

  // ── 主键检查 ──
  const key = parsed.key;
  const eventKey = e.key.toLowerCase();

  // 单字母 → 优先 e.code（布局无关）
  if (key.length === 1 && key >= 'A' && key <= 'Z') {
    return e.code === `Key${key}` || eventKey === key.toLowerCase();
  }
  // 数字
  if (key.length === 1 && key >= '0' && key <= '9') {
    return e.code === `Digit${key}` || eventKey === key;
  }
  // 功能键 / 特殊键 → 按 normalizeKey 的结果比较
  return eventKey === key.toLowerCase();
}
