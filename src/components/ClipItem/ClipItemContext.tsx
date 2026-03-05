/**
 * ClipItem 稳定上下文
 *
 * 将 ClipItemComponent 所需的 **低频变化** 依赖（回调 / 设置 / 标签）
 * 集中到一个窄 Context 中，使每个列表项不再直接订阅三个全局 Context。
 *
 * ## 为什么需要
 * React Context 没有 selector 机制：context value 中 **任意字段** 变化
 * 都会触发所有 `useContext` 消费者重渲染，且 React.memo 对 context
 * 触发的内部渲染无效。原先 ClipItemComponent 订阅了 SettingsContext、
 * ClipboardContext、UIContext，当 selectedIndex（键盘导航）、copiedId（复制）
 * 等高频字段变化时，所有列表项同时重渲染。
 *
 * ## 设计
 * - **ClipItemProvider** 放置在 ClipList 内，只消费三个全局 Context 一次。
 * - 通过 `useMemo` 将 value 稳定化：只有 settings/tags/回调引用真正变化时
 *   才生成新 value。高频字段（selectedIndex、copiedId、searchQuery）
 *   **不**进入此 Context，而是通过 props 经由 VirtualizedClipRow 传入
 *   ClipItemComponent，由 React.memo 比较器精确拦截。
 * - 同时将 handleDoubleClick / handleDragStart 的 copyToClipboard 注入
 *   统一在此处完成，消除每个列表项内部的重复 useCallback 包装。
 */

import React, { createContext, useContext, useMemo, useCallback } from 'react';
import type { ClipItem, AppSettings, Tag } from '../../types';
import { useSettingsContext } from '../../contexts/SettingsContext';
import { useClipboardContext } from '../../contexts/ClipboardContext';
import { useUIContext } from '../../contexts/UIContext';

// ============================================================================
// 接口
// ============================================================================

export interface ClipItemStableContextValue {
  // ── 设置 ──
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;

  // ── 剪贴板操作 ──
  copyToClipboard: (
    item: ClipItem,
    options?: { suppressCopiedIdFeedback?: boolean },
  ) => Promise<void>;
  copyText: (text: string) => Promise<void>;
  loadHistory: () => Promise<void>;
  addClipEntry: (text: string) => Promise<void>;
  tags: Tag[];
  handleTogglePin: (item: ClipItem) => Promise<void>;
  handleToggleFavorite: (item: ClipItem) => Promise<void>;
  handleRemove: (id: number) => Promise<void>;
  handleUpdatePickedColor: (id: number, color: string | null) => Promise<void>;
  handleAddTagToItem: (itemId: number, tagId: number) => Promise<void>;
  handleRemoveTagFromItem: (itemId: number, tagId: number) => Promise<void>;

  // ── UI 操作（稳定回调）──
  setSelectedIndex: (idx: number) => void;
  handleDoubleClick: (item: ClipItem) => void;
  handleDragStart: (e: React.DragEvent | React.MouseEvent, text: string) => void;
  handleDragEnd: () => void;
  setPreviewImageUrl: (url: string | null) => void;
  setEditingClip: (item: ClipItem | null) => void;
}

// ============================================================================
// Context
// ============================================================================

const ClipItemStableContext = createContext<ClipItemStableContextValue | null>(null);

export function useClipItemStableContext(): ClipItemStableContextValue {
  const ctx = useContext(ClipItemStableContext);
  if (!ctx) throw new Error('useClipItemStableContext 必须在 ClipItemProvider 内使用');
  return ctx;
}

// ============================================================================
// Provider
// ============================================================================

export function ClipItemProvider({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings } = useSettingsContext();

  const {
    copyToClipboard, copyText, loadHistory, addClipEntry,
    tags, handleTogglePin, handleToggleFavorite,
    handleRemove, handleUpdatePickedColor,
    handleAddTagToItem, handleRemoveTagFromItem,
  } = useClipboardContext();

  const {
    setSelectedIndex,
    handleDoubleClick: doubleClickRaw,
    handleDragStart: dragStartRaw,
    handleDragEnd,
    setPreviewImageUrl,
    setEditingClip,
  } = useUIContext();

  // 注入 copyToClipboard，消除列表项内部的重复包装 ──
  const handleDoubleClick = useCallback(
    (item: ClipItem) => { void doubleClickRaw(item, copyToClipboard); },
    [doubleClickRaw, copyToClipboard],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent | React.MouseEvent, text: string) => {
      void dragStartRaw(e, text, copyToClipboard);
    },
    [dragStartRaw, copyToClipboard],
  );

  // useMemo 保证：只有 settings/tags/回调引用真正变化时才生成新 value ──
  const value = useMemo<ClipItemStableContextValue>(() => ({
    settings, updateSettings,
    copyToClipboard, copyText, loadHistory, addClipEntry,
    tags, handleTogglePin, handleToggleFavorite,
    handleRemove, handleUpdatePickedColor,
    handleAddTagToItem, handleRemoveTagFromItem,
    setSelectedIndex,
    handleDoubleClick, handleDragStart, handleDragEnd,
    setPreviewImageUrl, setEditingClip,
  }), [
    settings, updateSettings,
    copyToClipboard, copyText, loadHistory, addClipEntry,
    tags, handleTogglePin, handleToggleFavorite,
    handleRemove, handleUpdatePickedColor,
    handleAddTagToItem, handleRemoveTagFromItem,
    setSelectedIndex,
    handleDoubleClick, handleDragStart, handleDragEnd,
    setPreviewImageUrl, setEditingClip,
  ]);

  return (
    <ClipItemStableContext.Provider value={value}>
      {children}
    </ClipItemStableContext.Provider>
  );
}
