/**
 * 应用全局状态 Context（组合层）
 *
 * 组合 SettingsContext / ClipboardContext / UIContext，
 * 对外保持原有的 `useAppContext` API 完全兼容，
 * 同时允许组件按需订阅细粒度 Context 以减少不必要的重渲染。
 *
 * ## 迁移指南
 * - 新代码推荐直接使用 `useSettingsContext` / `useClipboardContext` / `useUIContext`
 * - 旧代码的 `useAppContext` 继续可用，无需修改
 */

import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { ClipItem, AppSettings, AppStats, DownloadState } from '../types';
import { SettingsProvider, useSettingsContext } from './SettingsContext';
import { ClipboardProvider, useClipboardContext } from './ClipboardContext';
import { UIProvider, useUIContext, FilterType } from './UIContext';
import { useShortcuts } from '../hooks/useShortcuts';
import { useKeyboardNavigation } from '../hooks/useKeyboardNavigation';
import { confirm } from '@tauri-apps/plugin-dialog';
import { isTauri } from '../services/tauri';

const toMsg = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

// Re-export for backward compatibility
export type { FilterType } from './UIContext';

// ============================================================================
// 兼容层：AppContextValue
// ============================================================================

export interface AppContextValue {
  // 沉浸模式
  immersiveMode: boolean;
  toggleImmersiveMode: () => void;

  // 设置
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;

  // 统计
  stats: AppStats;
  shortcutError: string | null;
  shortcutRegistering: boolean;

  // 历史记录
  history: ClipItem[];
  filteredHistory: ClipItem[];
  loadHistory: () => Promise<void>;

  // 标签
  tags: import('../types').Tag[];
  handleCreateTag: (name: string, color: string | null) => Promise<void>;
  handleUpdateTag: (id: number, name: string, color: string | null) => Promise<void>;
  handleDeleteTag: (id: number) => Promise<void>;
  handleAddTagToItem: (itemId: number, tagId: number) => Promise<void>;
  handleRemoveTagFromItem: (itemId: number, tagId: number) => Promise<void>;

  // 搜索与过滤
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeFilter: FilterType;
  setActiveFilter: (f: FilterType) => void;

  // 选中
  selectedIndex: number;
  setSelectedIndex: (idx: number) => void;

  // 弹窗
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  showAddModal: boolean;
  setShowAddModal: (v: boolean) => void;
  showTagManager: boolean;
  setShowTagManager: (v: boolean) => void;
  previewImageUrl: string | null;
  setPreviewImageUrl: (url: string | null) => void;
  editingClip: ClipItem | null;
  setEditingClip: (item: ClipItem | null) => void;

  // 下载状态
  downloadState: DownloadState;
  clearDownloadState: () => void;

  // 剪贴板操作
  copyToClipboard: (item: ClipItem, options?: { suppressCopiedIdFeedback?: boolean }) => Promise<void>;
  copyText: (text: string) => Promise<void>;
  copiedId: number | null;

  // 列表操作
  handleDoubleClick: (item: ClipItem) => Promise<void>;
  handleDragStart: (e: React.DragEvent | React.MouseEvent, text: string) => Promise<void>;
  handleDragEnd: () => Promise<void>;
  handleTogglePin: (item: ClipItem) => Promise<void>;
  handleToggleFavorite: (item: ClipItem) => Promise<void>;
  handleRemove: (id: number) => Promise<void>;
  handleClearAll: () => Promise<void>;
  handleSaveSnippet: (text: string) => Promise<void>;
  handleUpdateClip: (id: number, text: string) => Promise<void>;
  handleUpdatePickedColor: (id: number, color: string | null) => Promise<void>;

  // 导入导出
  exportData: () => void;
  importData: (e: React.ChangeEvent<HTMLInputElement>) => void;

  // 错误
  error: string | null;
}

// ============================================================================
// 兼容层 Context
// ============================================================================

const AppContext = createContext<AppContextValue | null>(null);

/**
 * 获取 App Context（保持向后兼容）
 *
 * 新代码推荐使用细粒度 Context：
 * - `useSettingsContext()` — 仅设置
 * - `useClipboardContext()` — 剪贴板历史 & 操作
 * - `useUIContext()` — UI 状态（搜索/过滤/弹窗/拖拽）
 */
export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext 必须在 AppProvider 内使用');
  return ctx;
}

// ============================================================================
// 内部桥接组件
// ============================================================================

function AppBridge({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings } = useSettingsContext();

  // 从 ClipboardContext 解构稳定引用
  const {
    history, tags, loadHistory,
    copyToClipboard, copyText, copiedId, stats,
    handleTogglePin, handleRemove, handleClearAll: clearAllRaw,
    handleToggleFavorite,
    handleSaveSnippet, handleUpdateClip,
    handleUpdatePickedColor,
    handleCreateTag, handleUpdateTag, handleDeleteTag,
    handleAddTagToItem, handleRemoveTagFromItem,
    exportData, importData: importDataRaw,
    error,
  } = useClipboardContext();

  // 从 UIContext 解构稳定引用
  const {
    immersiveMode, toggleImmersiveMode,
    searchQuery, setSearchQuery,
    activeFilter, setActiveFilter,
    filterHistory,
    selectedIndex, setSelectedIndex,
    showSettings, setShowSettings,
    showAddModal, setShowAddModal,
    showTagManager, setShowTagManager,
    previewImageUrl, setPreviewImageUrl,
    editingClip, setEditingClip,
    downloadState,
    clearDownloadState,
    handleDragStart: dragStartRaw,
    handleDragEnd,
    handleDoubleClick: doubleClickRaw,
  } = useUIContext();

  const { shortcutError, isRegistering: shortcutRegistering } = useShortcuts(
    settings.globalShortcut,
    settings.windowPlacement,
  );

  // 计算过滤后的历史 — 仅依赖 filterHistory 函数引用和 history 数组
  const filteredHistory = useMemo(
    () => filterHistory(history),
    [filterHistory, history],
  );

  // 包装 handleDoubleClick：隐藏 copyToClipboard 参数
  const handleDoubleClick = useCallback(
    (item: ClipItem) => doubleClickRaw(item, copyToClipboard),
    [doubleClickRaw, copyToClipboard],
  );

  // 包装 handleDragStart：隐藏 copyToClipboard 参数
  const handleDragStart = useCallback(
    (e: React.DragEvent | React.MouseEvent, text: string) => dragStartRaw(e, text, copyToClipboard),
    [dragStartRaw, copyToClipboard],
  );

  // 包装 handleClearAll：在桥接层添加 confirm（数据层保持纯净）
  const handleClearAll = useCallback(async () => {
    try {
      const confirmed = isTauri
        ? await confirm('确定要清空所有历史记录吗？', { title: '清空确认', kind: 'warning' })
        : window.confirm('确定要清空所有历史记录吗？');

      if (confirmed) {
        await clearAllRaw();
      }
    } catch (err) {
      alert(`清空失败：${toMsg(err)}`);
    }
  }, [clearAllRaw]);

  // 包装 importData：在桥接层添加 alert 反馈（数据层只返回结果，不做 UI 交互）
  const importData = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const err = await importDataRaw(e);
      alert(err ? `导入失败：${err}` : '导入成功！');
    } catch (err) {
      alert(`导入失败：${toMsg(err)}`);
    }
  }, [importDataRaw]);

  // 键盘导航 — 从桥接层提取到专用 hook
  useKeyboardNavigation({
    filteredHistory,
    selectedIndex,
    setSelectedIndex,
    copyToClipboard,
    handleDoubleClick,
    previewImageUrl,
    setPreviewImageUrl,
    globalShortcut: settings.globalShortcut,
    immersiveShortcut: settings.immersiveShortcut,
    toggleImmersiveMode,
    modalOpen: showSettings || showAddModal,
  });

  // 构造兼容层 value — 所有依赖都是稳定引用，不再依赖整个 context 对象
  const value: AppContextValue = useMemo(() => ({
    immersiveMode, toggleImmersiveMode,
    settings, updateSettings,
    stats, shortcutError, shortcutRegistering,
    history, filteredHistory,
    loadHistory,
    tags,
    handleCreateTag, handleUpdateTag, handleDeleteTag,
    handleAddTagToItem, handleRemoveTagFromItem,
    searchQuery, setSearchQuery,
    activeFilter, setActiveFilter,
    selectedIndex, setSelectedIndex,
    showSettings, setShowSettings,
    showAddModal, setShowAddModal,
    showTagManager, setShowTagManager,
    previewImageUrl, setPreviewImageUrl,
    editingClip, setEditingClip,
    downloadState,
    clearDownloadState,
    copyToClipboard, copyText, copiedId,
    handleDoubleClick, handleDragStart, handleDragEnd,
    handleTogglePin, handleRemove, handleClearAll,
    handleToggleFavorite,
    handleSaveSnippet, handleUpdateClip,
    handleUpdatePickedColor,
    exportData, importData,
    error,
  }), [
    immersiveMode, toggleImmersiveMode,
    settings, updateSettings,
    stats, shortcutError, shortcutRegistering,
    history, filteredHistory, loadHistory,
    tags,
    handleCreateTag, handleUpdateTag, handleDeleteTag,
    handleAddTagToItem, handleRemoveTagFromItem,
    searchQuery, setSearchQuery,
    activeFilter, setActiveFilter,
    selectedIndex, setSelectedIndex,
    showSettings, setShowSettings,
    showAddModal, setShowAddModal,
    showTagManager, setShowTagManager,
    previewImageUrl, setPreviewImageUrl,
    editingClip, setEditingClip,
    downloadState,
    clearDownloadState,
    copyToClipboard, copyText, copiedId,
    handleDoubleClick, handleDragStart, handleDragEnd,
    handleTogglePin, handleRemove, handleClearAll,
    handleToggleFavorite,
    handleSaveSnippet, handleUpdateClip,
    handleUpdatePickedColor,
    exportData, importData,
    error,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ============================================================================
// Provider 组件
// ============================================================================

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <AppProviderInner>{children}</AppProviderInner>
    </SettingsProvider>
  );
}

/**
 * 内部组件：读取 settings 后创建 ClipboardProvider + UIProvider。
 * UIProvider 不再依赖 copyToClipboard，消除了原来的中间层 AppProviderWithClipboard。
 */
function AppProviderInner({ children }: { children: React.ReactNode }) {
  const { settings } = useSettingsContext();

  return (
    <ClipboardProvider settings={settings}>
      <UIProvider settings={settings}>
        <AppBridge>{children}</AppBridge>
      </UIProvider>
    </ClipboardProvider>
  );
}
