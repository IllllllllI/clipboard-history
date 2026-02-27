/**
 * 键盘导航 Hook
 *
 * 处理 ArrowUp/ArrowDown 选中、Enter 粘贴、Ctrl+C 复制、Esc 关闭预览。
 * 从 AppContext 桥接层提取，职责更清晰。
 *
 * 设计要点：
 * - 用 useRef 持有最新值，useEffect 只注册一次监听器，避免高频重注册
 * - 过滤输入元素事件，避免搜索框打字时拦截
 * - Escape 关闭预览独立于 modalOpen 检查
 */

import { useEffect, useRef } from 'react';
import { ClipItem } from '../types';
import { getImmersiveShortcutConflict } from '../utils';

export const KEYBOARD_NAV_SCROLL_EVENT = 'clip:keyboard-nav-scroll';

interface UseKeyboardNavigationOptions {
  filteredHistory: ClipItem[];
  selectedIndex: number;
  setSelectedIndex: (idx: number) => void;
  copyToClipboard: (item: ClipItem) => Promise<void>;
  handleDoubleClick: (item: ClipItem) => Promise<void>;
  previewImageUrl: string | null;
  setPreviewImageUrl: (url: string | null) => void;
  globalShortcut: string;
  immersiveShortcut: string;
  toggleImmersiveMode: () => void;
  /** 当这些弹窗打开时，禁用导航（不包含图片预览，Escape 需要单独处理） */
  modalOpen: boolean;
}

type ParsedShortcut = {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
};

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
      parsed.ctrl = true;
      parsed.meta = true;
      continue;
    }
    parsed.key = token;
  }

  if (!parsed.key) return null;
  return parsed;
}

function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);
  if (!parsed) return false;
  if (e.repeat) return false;

  const expectsCtrl = parsed.ctrl;
  const expectsMeta = parsed.meta;
  const wantsEitherCtrlOrMeta = expectsCtrl && expectsMeta;

  if (wantsEitherCtrlOrMeta) {
    if (!(e.ctrlKey || e.metaKey)) return false;
  } else {
    if (e.ctrlKey !== expectsCtrl) return false;
    if (e.metaKey !== expectsMeta) return false;
  }

  if (e.altKey !== parsed.alt) return false;
  if (e.shiftKey !== parsed.shift) return false;

  const key = parsed.key;
  const eventKey = e.key.toLowerCase();

  if (key.length === 1 && key >= 'a' && key <= 'z') {
    return e.code === `Key${key.toUpperCase()}` || eventKey === key;
  }

  if (key.length === 1 && key >= '0' && key <= '9') {
    return e.code === `Digit${key}` || eventKey === key;
  }

  return eventKey === key;
}

/** 是否为可编辑元素（搜索框、textarea 等） */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export function useKeyboardNavigation(opts: UseKeyboardNavigationOptions): void {
  // 用 ref 持有最新值，避免 useEffect 依赖频繁变化的值而重新注册监听器
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const {
        filteredHistory,
        selectedIndex,
        setSelectedIndex,
        copyToClipboard,
        handleDoubleClick,
        previewImageUrl,
        setPreviewImageUrl,
        globalShortcut,
        immersiveShortcut,
        toggleImmersiveMode,
        modalOpen,
      } = optsRef.current;

      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-shortcut-recorder="true"]')) {
        return;
      }

      // 弹窗打开时禁用导航/快捷键拦截（避免影响设置中的按键录制）
      if (modalOpen) return;

      const immersiveConflict = getImmersiveShortcutConflict(immersiveShortcut || 'Alt+Z', globalShortcut || 'Alt+V');

      if (!immersiveConflict && matchesShortcut(e, immersiveShortcut || 'Alt+Z')) {
        e.preventDefault();
        e.stopPropagation();
        toggleImmersiveMode();
        return;
      }

      // Escape 关闭图片预览（独立于 modalOpen，因为预览本身也是 modal）
      if (e.key === 'Escape') {
        if (previewImageUrl) {
          setPreviewImageUrl(null);
          e.preventDefault();
        }
        return;
      }

      // 输入元素内不拦截（允许搜索框正常输入）
      if (isEditableTarget(e.target)) return;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = Math.min(selectedIndex + 1, filteredHistory.length - 1);
          if (nextIndex !== selectedIndex) {
            setSelectedIndex(nextIndex);
            window.dispatchEvent(new CustomEvent<number>(KEYBOARD_NAV_SCROLL_EVENT, { detail: nextIndex }));
          }
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const nextIndex = Math.max(selectedIndex - 1, 0);
          if (nextIndex !== selectedIndex) {
            setSelectedIndex(nextIndex);
            window.dispatchEvent(new CustomEvent<number>(KEYBOARD_NAV_SCROLL_EVENT, { detail: nextIndex }));
          }
          break;
        }
        case 'Enter': {
          e.preventDefault();
          const item = filteredHistory[selectedIndex];
          if (item) handleDoubleClick(item);
          break;
        }
        case 'c':
          if (e.ctrlKey || e.metaKey) {
            const item = filteredHistory[selectedIndex];
            if (item) copyToClipboard(item);
          }
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []); // 空依赖 — 只注册一次，通过 ref 读取最新值
}
