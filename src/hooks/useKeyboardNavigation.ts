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
 * - 快捷键解析 / 匹配复用 shortcut.ts（单一来源，带有界缓存）
 */

import { useEffect, useRef } from 'react';
import type { ClipItem } from '../types';
import { getImmersiveShortcutConflict, matchesShortcut } from '../utils';

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
    /** 上/下移动选中项并触发虚拟列表滚动 */
    const moveBy = (
      delta: number,
      idx: number,
      len: number,
      setIdx: (i: number) => void,
    ) => {
      const next = Math.max(0, Math.min(idx + delta, len - 1));
      if (next === idx) return;
      setIdx(next);
      window.dispatchEvent(
        new CustomEvent<number>(KEYBOARD_NAV_SCROLL_EVENT, { detail: next }),
      );
    };

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

      // 快捷键录制器内不拦截
      if ((e.target as HTMLElement | null)?.closest('[data-shortcut-recorder="true"]')) {
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

      // 弹窗打开时禁用导航/快捷键拦截（避免影响设置中的按键录制）
      if (modalOpen) return;

      // 沉浸模式切换
      if (
        !getImmersiveShortcutConflict(immersiveShortcut || 'Alt+Z', globalShortcut || 'Alt+V') &&
        matchesShortcut(e, immersiveShortcut || 'Alt+Z')
      ) {
        e.preventDefault();
        e.stopPropagation();
        toggleImmersiveMode();
        return;
      }

      // 输入元素内不拦截（允许搜索框正常输入）
      if (isEditableTarget(e.target)) return;

      // ── 列表导航 & 操作 ──
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          moveBy(1, selectedIndex, filteredHistory.length, setSelectedIndex);
          break;
        case 'ArrowUp':
          e.preventDefault();
          moveBy(-1, selectedIndex, filteredHistory.length, setSelectedIndex);
          break;
        case 'Enter': {
          e.preventDefault();
          const item = filteredHistory[selectedIndex];
          if (item) void handleDoubleClick(item);
          break;
        }
        default:
          // Ctrl+C / Cmd+C — 使用 e.code 保证非 QWERTY 布局兼容
          if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
            const item = filteredHistory[selectedIndex];
            if (item) void copyToClipboard(item);
          }
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []); // 空依赖 — 只注册一次，通过 ref 读取最新值
}
