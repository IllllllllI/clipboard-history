import { describe, it, expect } from 'vitest';
import {
  normalizeShortcut,
  areShortcutsEquivalent,
  matchesShortcut,
  getGlobalShortcutConflict,
  getImmersiveShortcutConflict,
  getLikelySystemShortcutWarning,
  isReservedAppShortcut,
  formatShortcutFromEvent,
  normalizeCodeName,
  normalizeEventKey,
  MODIFIER_KEYS,
  RESERVED_APP_SHORTCUTS,
} from '../../src/utils/shortcut';

// ── Helpers ──────────────────────────────────────────────────────

/** 构造一个模拟 KeyboardEvent（仅含快捷键匹配所需字段） */
function fakeKeyEvent(
  overrides: Partial<KeyboardEvent> & { key: string; code?: string },
): KeyboardEvent {
  return {
    key: overrides.key,
    code: overrides.code ?? '',
    ctrlKey: overrides.ctrlKey ?? false,
    altKey: overrides.altKey ?? false,
    shiftKey: overrides.shiftKey ?? false,
    metaKey: overrides.metaKey ?? false,
    repeat: overrides.repeat ?? false,
  } as KeyboardEvent;
}

// ══════════════════════════════════════════════════════════════════
// normalizeCodeName
// ══════════════════════════════════════════════════════════════════

describe('normalizeCodeName', () => {
  it('should map letter codes', () => {
    expect(normalizeCodeName('KeyA')).toBe('A');
    expect(normalizeCodeName('KeyZ')).toBe('Z');
  });

  it('should map digit codes', () => {
    expect(normalizeCodeName('Digit0')).toBe('0');
    expect(normalizeCodeName('Digit9')).toBe('9');
  });

  it('should map F-keys', () => {
    expect(normalizeCodeName('F1')).toBe('F1');
    expect(normalizeCodeName('F12')).toBe('F12');
  });

  it('should map punctuation codes', () => {
    expect(normalizeCodeName('Space')).toBe('Space');
    expect(normalizeCodeName('Minus')).toBe('-');
    expect(normalizeCodeName('Equal')).toBe('=');
    expect(normalizeCodeName('Slash')).toBe('/');
    expect(normalizeCodeName('BracketLeft')).toBe('[');
    expect(normalizeCodeName('BracketRight')).toBe(']');
    expect(normalizeCodeName('Semicolon')).toBe(';');
    expect(normalizeCodeName('Comma')).toBe(',');
    expect(normalizeCodeName('Period')).toBe('.');
    expect(normalizeCodeName('Backquote')).toBe('`');
    expect(normalizeCodeName('Backslash')).toBe('\\');
    expect(normalizeCodeName('Quote')).toBe("'");
  });

  it('should map special keys', () => {
    expect(normalizeCodeName('Escape')).toBe('Escape');
    expect(normalizeCodeName('Enter')).toBe('Enter');
    expect(normalizeCodeName('Tab')).toBe('Tab');
    expect(normalizeCodeName('Backspace')).toBe('Backspace');
    expect(normalizeCodeName('Delete')).toBe('Delete');
    expect(normalizeCodeName('ArrowUp')).toBe('ArrowUp');
    expect(normalizeCodeName('ArrowDown')).toBe('ArrowDown');
  });

  it('should map numpad keys', () => {
    expect(normalizeCodeName('Numpad0')).toBe('Numpad0');
    expect(normalizeCodeName('NumpadAdd')).toBe('NumpadAdd');
  });

  it('should return null for unknown/empty codes', () => {
    expect(normalizeCodeName('')).toBeNull();
    expect(normalizeCodeName('UnknownCode')).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
// normalizeEventKey
// ══════════════════════════════════════════════════════════════════

describe('normalizeEventKey', () => {
  it('should normalize single characters to uppercase', () => {
    expect(normalizeEventKey('a')).toBe('A');
    expect(normalizeEventKey('z')).toBe('Z');
    expect(normalizeEventKey('1')).toBe('1');
  });

  it('should normalize space', () => {
    expect(normalizeEventKey(' ')).toBe('Space');
  });

  it('should normalize aliases', () => {
    expect(normalizeEventKey('Esc')).toBe('Escape');
    expect(normalizeEventKey('Return')).toBe('Enter');
    expect(normalizeEventKey('Spacebar')).toBe('Space');
    expect(normalizeEventKey('Up')).toBe('ArrowUp');
    expect(normalizeEventKey('Down')).toBe('ArrowDown');
    expect(normalizeEventKey('Left')).toBe('ArrowLeft');
    expect(normalizeEventKey('Right')).toBe('ArrowRight');
  });

  it('should pass through standard values', () => {
    expect(normalizeEventKey('Escape')).toBe('Escape');
    expect(normalizeEventKey('Enter')).toBe('Enter');
    expect(normalizeEventKey('ArrowUp')).toBe('ArrowUp');
    expect(normalizeEventKey('F5')).toBe('F5');
  });

  it('should reject Dead, Process, empty', () => {
    expect(normalizeEventKey('Dead')).toBeNull();
    expect(normalizeEventKey('Process')).toBeNull();
    expect(normalizeEventKey('')).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
// MODIFIER_KEYS
// ══════════════════════════════════════════════════════════════════

describe('MODIFIER_KEYS', () => {
  it('should contain exactly 4 modifier keys', () => {
    expect(MODIFIER_KEYS.size).toBe(4);
    expect(MODIFIER_KEYS.has('Control')).toBe(true);
    expect(MODIFIER_KEYS.has('Shift')).toBe(true);
    expect(MODIFIER_KEYS.has('Alt')).toBe(true);
    expect(MODIFIER_KEYS.has('Meta')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// normalizeShortcut
// ══════════════════════════════════════════════════════════════════

describe('normalizeShortcut', () => {
  it('should normalize simple shortcut', () => {
    expect(normalizeShortcut('Alt+V')).toBe('Alt+V');
    expect(normalizeShortcut('alt+v')).toBe('Alt+V');
  });

  it('should normalize modifier order (Ctrl > Meta > Alt > Shift)', () => {
    expect(normalizeShortcut('Shift+Ctrl+A')).toBe('Ctrl+Shift+A');
    expect(normalizeShortcut('Shift+Alt+Ctrl+K')).toBe('Ctrl+Alt+Shift+K');
    expect(normalizeShortcut('Alt+Meta+Z')).toBe('Meta+Alt+Z');
  });

  it('should normalize CtrlOrMeta', () => {
    expect(normalizeShortcut('CmdOrCtrl+C')).toBe('CtrlOrMeta+C');
    expect(normalizeShortcut('CommandOrControl+V')).toBe('CtrlOrMeta+V');
  });

  it('should normalize key aliases', () => {
    expect(normalizeShortcut('Ctrl+Esc')).toBe('Ctrl+Escape');
    expect(normalizeShortcut('Ctrl+Return')).toBe('Ctrl+Enter');
    expect(normalizeShortcut('Ctrl+Space')).toBe('Ctrl+Space');
    expect(normalizeShortcut('Ctrl+Up')).toBe('Ctrl+ArrowUp');
  });

  it('should handle modifier aliases', () => {
    expect(normalizeShortcut('Control+A')).toBe('Ctrl+A');
    expect(normalizeShortcut('Option+A')).toBe('Alt+A');
    expect(normalizeShortcut('Cmd+A')).toBe('Meta+A');
    expect(normalizeShortcut('Command+A')).toBe('Meta+A');
    expect(normalizeShortcut('Super+A')).toBe('Meta+A');
  });

  it('should handle F-keys', () => {
    expect(normalizeShortcut('Ctrl+F5')).toBe('Ctrl+F5');
    expect(normalizeShortcut('f12')).toBe('F12');
  });

  it('should return null for invalid input', () => {
    expect(normalizeShortcut('')).toBeNull();
    expect(normalizeShortcut('   ')).toBeNull();
    expect(normalizeShortcut('Ctrl')).toBeNull(); // modifier only, no key
    expect(normalizeShortcut('Ctrl+Shift')).toBeNull();
  });

  it('should handle whitespace around tokens', () => {
    expect(normalizeShortcut(' Ctrl + A ')).toBe('Ctrl+A');
  });
});

// ══════════════════════════════════════════════════════════════════
// areShortcutsEquivalent
// ══════════════════════════════════════════════════════════════════

describe('areShortcutsEquivalent', () => {
  it('should match identical shortcuts', () => {
    expect(areShortcutsEquivalent('Alt+V', 'Alt+V')).toBe(true);
    expect(areShortcutsEquivalent('Ctrl+Shift+A', 'Ctrl+Shift+A')).toBe(true);
  });

  it('should match case-insensitively', () => {
    expect(areShortcutsEquivalent('alt+v', 'Alt+V')).toBe(true);
  });

  it('should match regardless of modifier order', () => {
    expect(areShortcutsEquivalent('Shift+Ctrl+A', 'Ctrl+Shift+A')).toBe(true);
  });

  it('should match CtrlOrMeta with Ctrl', () => {
    expect(areShortcutsEquivalent('CtrlOrMeta+C', 'Ctrl+C')).toBe(true);
  });

  it('should match CtrlOrMeta with Meta', () => {
    expect(areShortcutsEquivalent('CtrlOrMeta+C', 'Meta+C')).toBe(true);
  });

  it('should match CtrlOrMeta with CtrlOrMeta', () => {
    expect(areShortcutsEquivalent('CtrlOrMeta+C', 'CmdOrCtrl+C')).toBe(true);
  });

  it('should NOT match CtrlOrMeta with no ctrl/meta', () => {
    expect(areShortcutsEquivalent('CtrlOrMeta+C', 'C')).toBe(false);
    expect(areShortcutsEquivalent('CtrlOrMeta+C', 'Alt+C')).toBe(false);
  });

  it('should NOT match different keys', () => {
    expect(areShortcutsEquivalent('Alt+V', 'Alt+Z')).toBe(false);
  });

  it('should NOT match different modifiers', () => {
    expect(areShortcutsEquivalent('Ctrl+A', 'Alt+A')).toBe(false);
    expect(areShortcutsEquivalent('Ctrl+C', 'Meta+C')).toBe(false);
  });

  it('should return false for invalid shortcuts', () => {
    expect(areShortcutsEquivalent('', 'Alt+V')).toBe(false);
    expect(areShortcutsEquivalent('Ctrl', 'Ctrl')).toBe(false);
  });

  it('should match modifier aliases', () => {
    expect(areShortcutsEquivalent('Control+A', 'Ctrl+A')).toBe(true);
    expect(areShortcutsEquivalent('Option+Z', 'Alt+Z')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// formatShortcutFromEvent
// ══════════════════════════════════════════════════════════════════

describe('formatShortcutFromEvent', () => {
  it('should format basic key combo', () => {
    expect(formatShortcutFromEvent({
      key: 'v', code: 'KeyV', ctrlKey: false, altKey: true, shiftKey: false, metaKey: false,
    })).toBe('Alt+V');
  });

  it('should format Ctrl+Shift+A', () => {
    expect(formatShortcutFromEvent({
      key: 'A', code: 'KeyA', ctrlKey: true, altKey: false, shiftKey: true, metaKey: false,
    })).toBe('Ctrl+Shift+A');
  });

  it('should return null for modifier-only events', () => {
    expect(formatShortcutFromEvent({
      key: 'Control', code: 'ControlLeft', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false,
    })).toBeNull();
    expect(formatShortcutFromEvent({
      key: 'Shift', code: 'ShiftLeft', ctrlKey: false, altKey: false, shiftKey: true, metaKey: false,
    })).toBeNull();
  });

  it('should use code-name over key-name for physical layout independence', () => {
    // On AZERTY, physical 'A' key produces 'q' in e.key
    expect(formatShortcutFromEvent({
      key: 'q', code: 'KeyA', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false,
    })).toBe('Ctrl+A');
  });

  it('should handle Space key', () => {
    expect(formatShortcutFromEvent({
      key: ' ', code: 'Space', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false,
    })).toBe('Ctrl+Space');
  });

  it('should handle F-keys', () => {
    expect(formatShortcutFromEvent({
      key: 'F5', code: 'F5', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
    })).toBe('F5');
  });

  it('should handle punctuation via code', () => {
    expect(formatShortcutFromEvent({
      key: '/', code: 'Slash', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false,
    })).toBe('Ctrl+/');
  });

  it('should handle Escape', () => {
    expect(formatShortcutFromEvent({
      key: 'Escape', code: 'Escape', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
    })).toBe('Escape');
  });

  it('should return null for Dead/Process keys', () => {
    expect(formatShortcutFromEvent({
      key: 'Dead', code: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
    })).toBeNull();
  });

  it('should handle numpad keys', () => {
    expect(formatShortcutFromEvent({
      key: '0', code: 'Numpad0', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
    })).toBe('Numpad0');
  });

  it('modifier order is Ctrl > Meta > Alt > Shift', () => {
    expect(formatShortcutFromEvent({
      key: 'a', code: 'KeyA', ctrlKey: true, altKey: true, shiftKey: true, metaKey: true,
    })).toBe('Ctrl+Meta+Alt+Shift+A');
  });
});

// ══════════════════════════════════════════════════════════════════
// matchesShortcut
// ══════════════════════════════════════════════════════════════════

describe('matchesShortcut', () => {
  it('should match Alt+V', () => {
    const e = fakeKeyEvent({ key: 'v', code: 'KeyV', altKey: true });
    expect(matchesShortcut(e, 'Alt+V')).toBe(true);
  });

  it('should NOT match when modifier missing', () => {
    const e = fakeKeyEvent({ key: 'v', code: 'KeyV' });
    expect(matchesShortcut(e, 'Alt+V')).toBe(false);
  });

  it('should NOT match when extra modifier present', () => {
    const e = fakeKeyEvent({ key: 'v', code: 'KeyV', altKey: true, ctrlKey: true });
    expect(matchesShortcut(e, 'Alt+V')).toBe(false);
  });

  it('should match CtrlOrMeta with ctrlKey', () => {
    const e = fakeKeyEvent({ key: 'c', code: 'KeyC', ctrlKey: true });
    expect(matchesShortcut(e, 'CtrlOrMeta+C')).toBe(true);
  });

  it('should match CtrlOrMeta with metaKey', () => {
    const e = fakeKeyEvent({ key: 'c', code: 'KeyC', metaKey: true });
    expect(matchesShortcut(e, 'CtrlOrMeta+C')).toBe(true);
  });

  it('should NOT match CtrlOrMeta without ctrl/meta', () => {
    const e = fakeKeyEvent({ key: 'c', code: 'KeyC' });
    expect(matchesShortcut(e, 'CtrlOrMeta+C')).toBe(false);
  });

  it('should ignore repeat events', () => {
    const e = fakeKeyEvent({ key: 'v', code: 'KeyV', altKey: true, repeat: true });
    expect(matchesShortcut(e, 'Alt+V')).toBe(false);
  });

  it('should match via code for non-QWERTY layouts (AZERTY)', () => {
    // On AZERTY: physical A key → e.key='q', e.code='KeyA'
    const e = fakeKeyEvent({ key: 'q', code: 'KeyA', ctrlKey: true });
    expect(matchesShortcut(e, 'Ctrl+A')).toBe(true);
  });

  it('should match Space key', () => {
    const e = fakeKeyEvent({ key: ' ', code: 'Space', ctrlKey: true });
    expect(matchesShortcut(e, 'Ctrl+Space')).toBe(true);
  });

  it('should match standalone arrow keys', () => {
    const e = fakeKeyEvent({ key: 'ArrowUp', code: 'ArrowUp' });
    expect(matchesShortcut(e, 'ArrowUp')).toBe(true);
  });

  it('should match Escape', () => {
    const e = fakeKeyEvent({ key: 'Escape', code: 'Escape' });
    expect(matchesShortcut(e, 'Escape')).toBe(true);
  });

  it('should match Enter', () => {
    const e = fakeKeyEvent({ key: 'Enter', code: 'Enter' });
    expect(matchesShortcut(e, 'Enter')).toBe(true);
  });

  it('should match F-keys', () => {
    const e = fakeKeyEvent({ key: 'F5', code: 'F5' });
    expect(matchesShortcut(e, 'F5')).toBe(true);
  });

  it('should match punctuation via code', () => {
    const e = fakeKeyEvent({ key: '/', code: 'Slash', ctrlKey: true });
    expect(matchesShortcut(e, 'Ctrl+/')).toBe(true);
  });

  it('should match digit keys', () => {
    const e = fakeKeyEvent({ key: '5', code: 'Digit5', ctrlKey: true });
    expect(matchesShortcut(e, 'Ctrl+5')).toBe(true);
  });

  it('should return false for invalid shortcut string', () => {
    const e = fakeKeyEvent({ key: 'a', code: 'KeyA' });
    expect(matchesShortcut(e, '')).toBe(false);
    expect(matchesShortcut(e, 'Ctrl')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// Round-trip: formatShortcutFromEvent → matchesShortcut
// ══════════════════════════════════════════════════════════════════

describe('round-trip: format → match', () => {
  const cases: Array<Partial<KeyboardEvent> & { key: string; code: string }> = [
    { key: 'v', code: 'KeyV', altKey: true },
    { key: 'c', code: 'KeyC', ctrlKey: true },
    { key: 'A', code: 'KeyA', ctrlKey: true, shiftKey: true },
    { key: ' ', code: 'Space', ctrlKey: true },
    { key: 'F5', code: 'F5' },
    { key: '/', code: 'Slash', ctrlKey: true },
    { key: 'Escape', code: 'Escape' },
    { key: 'Enter', code: 'Enter' },
    { key: 'ArrowDown', code: 'ArrowDown' },
    { key: '-', code: 'Minus', altKey: true },
  ];

  for (const overrides of cases) {
    const e = fakeKeyEvent(overrides);
    const formatted = formatShortcutFromEvent(e)!;
    it(`format(${formatted}) → matchesShortcut should return true`, () => {
      expect(formatted).not.toBeNull();
      expect(matchesShortcut(e, formatted)).toBe(true);
    });
  }
});

// ══════════════════════════════════════════════════════════════════
// isReservedAppShortcut
// ══════════════════════════════════════════════════════════════════

describe('isReservedAppShortcut', () => {
  it('should detect reserved shortcuts', () => {
    expect(isReservedAppShortcut('ArrowUp')).not.toBeNull();
    expect(isReservedAppShortcut('ArrowDown')).not.toBeNull();
    expect(isReservedAppShortcut('Enter')).not.toBeNull();
    expect(isReservedAppShortcut('Escape')).not.toBeNull();
    expect(isReservedAppShortcut('CtrlOrMeta+C')).not.toBeNull();
    expect(isReservedAppShortcut('Ctrl+C')).not.toBeNull();
  });

  it('should return the matching entry', () => {
    const result = isReservedAppShortcut('ArrowUp');
    expect(result).toEqual({ shortcut: 'ArrowUp', label: '列表上移' });
  });

  it('should return null for non-reserved shortcuts', () => {
    expect(isReservedAppShortcut('Alt+V')).toBeNull();
    expect(isReservedAppShortcut('Ctrl+Shift+Z')).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
// RESERVED_APP_SHORTCUTS
// ══════════════════════════════════════════════════════════════════

describe('RESERVED_APP_SHORTCUTS', () => {
  it('should be a non-empty array of {shortcut, label}', () => {
    expect(RESERVED_APP_SHORTCUTS.length).toBeGreaterThan(0);
    for (const item of RESERVED_APP_SHORTCUTS) {
      expect(item).toHaveProperty('shortcut');
      expect(item).toHaveProperty('label');
      expect(typeof item.shortcut).toBe('string');
      expect(typeof item.label).toBe('string');
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// getGlobalShortcutConflict
// ══════════════════════════════════════════════════════════════════

describe('getGlobalShortcutConflict', () => {
  it('should return error for empty global shortcut', () => {
    expect(getGlobalShortcutConflict('', 'Alt+Z')).toBe('全局唤起快捷键不能为空');
    expect(getGlobalShortcutConflict('  ', 'Alt+Z')).toBe('全局唤起快捷键不能为空');
  });

  it('should return error when same as immersive', () => {
    const err = getGlobalShortcutConflict('Alt+V', 'Alt+V');
    expect(err).toBe('不能与沉浸模式快捷键重复');
  });

  it('should return null when no conflict', () => {
    expect(getGlobalShortcutConflict('Alt+V', 'Alt+Z')).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
// getImmersiveShortcutConflict
// ══════════════════════════════════════════════════════════════════

describe('getImmersiveShortcutConflict', () => {
  it('should return error for empty immersive shortcut', () => {
    expect(getImmersiveShortcutConflict('', 'Alt+V')).toBe('沉浸模式快捷键不能为空');
  });

  it('should return error when same as global', () => {
    const err = getImmersiveShortcutConflict('Alt+V', 'Alt+V');
    expect(err).toBe('不能与全局唤起快捷键重复');
  });

  it('should return error when conflicting with reserved shortcut', () => {
    const err = getImmersiveShortcutConflict('ArrowUp', 'Alt+V');
    expect(err).toContain('与应用内快捷键冲突');
    expect(err).toContain('列表上移');
  });

  it('should return null when no conflict', () => {
    expect(getImmersiveShortcutConflict('Alt+Z', 'Alt+V')).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
// getLikelySystemShortcutWarning
// ══════════════════════════════════════════════════════════════════

describe('getLikelySystemShortcutWarning', () => {
  it('should warn about Alt+Z', () => {
    const warning = getLikelySystemShortcutWarning('Alt+Z');
    expect(warning).not.toBeNull();
    expect(warning).toContain('Alt+Z');
  });

  it('should return null for safe shortcuts', () => {
    expect(getLikelySystemShortcutWarning('Alt+V')).toBeNull();
    expect(getLikelySystemShortcutWarning('Ctrl+Shift+V')).toBeNull();
  });

  it('should return null for empty input', () => {
    expect(getLikelySystemShortcutWarning('')).toBeNull();
    expect(getLikelySystemShortcutWarning('  ')).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
// Edge cases & cache behavior
// ══════════════════════════════════════════════════════════════════

describe('edge cases', () => {
  it('should handle shortcut with only spaces between +', () => {
    expect(normalizeShortcut('+ + +')).toBeNull();
  });

  it('should handle many modifiers with no key', () => {
    expect(normalizeShortcut('Ctrl+Alt+Shift')).toBeNull();
  });

  it('should handle duplicate modifiers gracefully', () => {
    expect(normalizeShortcut('Ctrl+Ctrl+A')).toBe('Ctrl+A');
  });

  it('should handle CtrlOrCommand alias', () => {
    expect(normalizeShortcut('CtrlOrCommand+A')).toBe('CtrlOrMeta+A');
  });

  it('cache stress: many unique shortcuts parse correctly', () => {
    // Push past the cache limit (64) to trigger cache clear
    for (let i = 0; i < 100; i++) {
      const s = `Ctrl+Key${i}`;
      const result = normalizeShortcut(s);
      expect(result).toBe(`Ctrl+Key${i}`);
    }
    // Original still works after cache clear
    expect(normalizeShortcut('Alt+V')).toBe('Alt+V');
  });
});
