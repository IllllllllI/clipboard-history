type ParsedShortcut = {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  ctrlOrMeta: boolean;
  key: string;
};

const MODIFIER_ORDER = ['CtrlOrMeta', 'Ctrl', 'Meta', 'Alt', 'Shift'] as const;

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
  const tokens = shortcut
    .split('+')
    .map(t => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) return null;

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

  if (!parsed.key) return null;
  return parsed;
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
