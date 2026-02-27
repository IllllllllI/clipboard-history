/**
 * UI 状态 Context
 *
 * 管理搜索、过滤、选中、弹窗、拖拽下载等纯 UI 状态。
 * 从 AppContext 拆分，使 UI 交互状态变更不触发数据层重渲染。
 *
 * 设计原则：UIContext 不依赖 ClipboardContext，通过参数注入解耦。
 */

import React, { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { PhysicalPosition } from '@tauri-apps/api/window';
import { ClipItem, AppSettings, DownloadState, ImageType } from '../types';
import { TauriService, isTauri } from '../services/tauri';
import { detectType, detectImageType, detectContentType, normalizeFilePath, isFileList } from '../utils';

// ============================================================================
// 过滤类型
// ============================================================================

export type FilterType = 'all' | 'pinned' | 'favorite' | 'url' | 'color' | 'snippet' | 'image' | 'file';

// 过滤谓词映射表 — 新增 filter 类型只需加一行
const FILTER_PREDICATES: Record<FilterType, (item: ClipItem, type: string) => boolean> = {
  all:      () => true,
  pinned:   (item) => !!item.is_pinned,
  favorite: (item) => !!item.is_favorite,
  url:      (_item, type) => type === 'url',
  color:    (_item, type) => type === 'color',
  snippet:  (item) => !!item.is_snippet,
  image:    (_item, type) => type === 'image' || type === 'image-url' || type === 'multi-image',
  file:     (_item, type) => type === 'files',
};

// ============================================================================
// 拖拽策略
// ============================================================================

type CopyTextFallback = (text: string) => Promise<void>;

/** 错误信息提取 */
const toMsg = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/** 构造纯文本回退用的 ClipItem */
const textFallbackItem = (text: string): ClipItem => ({
  id: 0, text, timestamp: Date.now(), is_pinned: 0, is_snippet: 0, is_favorite: 0, tags: [], picked_color: null,
});

// ============================================================================
// 图片拖拽复制策略表（模块级常量，避免每次调用重建）
// ============================================================================

interface ImageCopyStrategy {
  label: string;
  action: (
    text: string,
    setDownloadState: React.Dispatch<React.SetStateAction<DownloadState>>,
  ) => Promise<void>;
}

const IMAGE_COPY_STRATEGIES: Partial<Record<ImageType, ImageCopyStrategy>> = {
  [ImageType.HttpUrl]: {
    label: '图片下载失败',
    action: async (text, setDownloadState) => {
      setDownloadState({ isDownloading: true, progress: 0, error: null });
      await TauriService.downloadAndCopyImage(text);
      setDownloadState({ isDownloading: false, progress: 100, error: null });
    },
  },
  [ImageType.Base64]: {
    label: 'Base64图片处理失败',
    action: (text) => TauriService.copyBase64Image(text),
  },
  [ImageType.LocalFile]: {
    label: '本地图片处理失败',
    action: (text) => TauriService.copyLocalImage(normalizeFilePath(text)),
  },
};

/**
 * 按内容类型分派拖拽复制策略，消除原来 70 行 if/else 嵌套。
 */
async function dispatchDragCopy(
  text: string,
  setDownloadState: React.Dispatch<React.SetStateAction<DownloadState>>,
  copyFallback: CopyTextFallback,
): Promise<void> {
  // 1) 文件列表
  if (isFileList(text)) {
    const files = text.slice('[FILES]\n'.length).split('\n').filter(Boolean);
    if (files.length > 0) {
      try { await TauriService.copyFileToClipboard(files[0]); }
      catch (err) { setDownloadState({ isDownloading: false, progress: 0, error: `文件复制失败: ${toMsg(err)}` }); }
    }
    return;
  }

  // 2) 图片类型策略表
  const strategy = IMAGE_COPY_STRATEGIES[detectImageType(text)];
  if (strategy) {
    try { await strategy.action(text, setDownloadState); }
    catch (err) {
      setDownloadState({ isDownloading: false, progress: 0, error: `${strategy.label}: ${toMsg(err)}` });
      await copyFallback(text);
    }
    return;
  }

  // 3) 普通文件
  if (detectContentType(text) === 'file') {
    try { await TauriService.copyFileToClipboard(normalizeFilePath(text)); }
    catch (err) {
      setDownloadState({ isDownloading: false, progress: 0, error: `文件复制失败: ${toMsg(err)}` });
      await copyFallback(text);
    }
    return;
  }

  // 4) 纯文本 fallback
  await copyFallback(text);
}

// ============================================================================
// Context
// ============================================================================

export interface UIContextValue {
  // 沉浸模式
  immersiveMode: boolean;
  toggleImmersiveMode: () => void;

  // 搜索与过滤
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeFilter: FilterType;
  setActiveFilter: (f: FilterType) => void;
  filterHistory: (history: ClipItem[]) => ClipItem[];

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

  // 拖拽 — 需要注入 copyToClipboard 以解耦
  handleDragStart: (
    e: React.DragEvent | React.MouseEvent,
    text: string,
    copyToClipboard: (item: ClipItem) => Promise<void>,
  ) => Promise<void>;
  handleDragEnd: () => Promise<void>;

  // 双击粘贴 — 需要注入 copyToClipboard
  handleDoubleClick: (item: ClipItem, copyToClipboard: (item: ClipItem) => Promise<void>) => Promise<void>;
}

const UIContext = createContext<UIContextValue | null>(null);

export function useUIContext(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUIContext 必须在 UIProvider 内使用');
  return ctx;
}

/** UIProvider 不再依赖 copyToClipboard prop — 完全解耦 */
export function UIProvider({
  settings,
  children,
}: {
  settings: AppSettings;
  children: React.ReactNode;
}) {
  const [immersiveMode, setImmersiveMode] = useState(false);
  const toggleImmersiveMode = useCallback(() => setImmersiveMode(prev => !prev), []);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [editingClip, setEditingClip] = useState<ClipItem | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState>({
    isDownloading: false, progress: 0, error: null,
  });
  const originalPosition = useRef<PhysicalPosition | null>(null);
  const dragStateResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRestoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lowerSearchQuery = useMemo(() => searchQuery.toLowerCase(), [searchQuery]);

  useEffect(() => {
    return () => {
      if (dragStateResetTimerRef.current) clearTimeout(dragStateResetTimerRef.current);
      if (dragRestoreTimerRef.current) clearTimeout(dragRestoreTimerRef.current);
    };
  }, []);

  // 过滤历史
  const filterHistory = useCallback((history: ClipItem[]) => {
    const predicate = FILTER_PREDICATES[activeFilter];
    return history.filter(item => {
      const isBase64Image = item.text.startsWith('data:image/');
      const matchesSearch = isBase64Image || item.text.toLowerCase().includes(lowerSearchQuery);
      return matchesSearch && predicate(item, detectType(item.text));
    });
  }, [lowerSearchQuery, activeFilter]);

  // 双击粘贴 — copyFn 由调用者注入
  const handleDoubleClick = useCallback(async (item: ClipItem, copyFn: (item: ClipItem) => Promise<void>) => {
    if (!settings.doubleClickPaste) return;
    await copyFn(item);
    await TauriService.pasteText(settings.hideOnAction);
  }, [settings.doubleClickPaste, settings.hideOnAction]);

  // 拖拽开始 — copyToClipboard 由调用者注入，不再作为闭包依赖
  const handleDragStart = useCallback(async (
    _e: React.DragEvent | React.MouseEvent,
    text: string,
    copyToClipboard: (item: ClipItem) => Promise<void>,
  ) => {
    if (!isTauri) return;

    const copyFallback: CopyTextFallback = (t) => copyToClipboard(textFallbackItem(t));

    try {
      await dispatchDragCopy(text, setDownloadState, copyFallback);

      // 隐藏窗口（如果设置了拖拽时隐藏）
      if (settings.hideOnDrag) {
        try {
          originalPosition.current = await TauriService.getPosition();
          await TauriService.moveOffScreen();
        } catch { /* 继续执行 */ }
      }
    } catch (err) {
      setDownloadState({ isDownloading: false, progress: 0, error: `拖拽操作失败: ${toMsg(err)}` });
      try { await copyFallback(text); } catch { /* 忽略 */ }
    } finally {
      if (dragStateResetTimerRef.current) {
        clearTimeout(dragStateResetTimerRef.current);
      }
      dragStateResetTimerRef.current = setTimeout(() => {
        setDownloadState(prev => prev.isDownloading ? { isDownloading: false, progress: 0, error: null } : prev);
        dragStateResetTimerRef.current = null;
      }, 100);
    }
  }, [settings.hideOnDrag]);

  /** 恢复窗口原始位置（DRY — 消除 3 处重复） */
  const restorePosition = useCallback(async () => {
    if (!settings.hideOnDrag || !originalPosition.current) return;
    try { await TauriService.setPosition(originalPosition.current); }
    catch { /* 忽略 */ }
    finally { originalPosition.current = null; }
  }, [settings.hideOnDrag]);

  // 拖拽结束
  const handleDragEnd = useCallback(async () => {
    if (!isTauri) return;

    try {
      try {
        await TauriService.clickAndPaste();
      } catch (err) {
        setDownloadState({ isDownloading: false, progress: 0, error: `粘贴操作失败: ${toMsg(err)}。请手动使用 Ctrl+V 粘贴。` });
      }

      if (settings.hideAfterDrag) {
        try { await TauriService.hideWindow(); } catch { /* 忽略 */ }
        // 延迟恢复位置，确保隐藏动画完成
        if (dragRestoreTimerRef.current) {
          clearTimeout(dragRestoreTimerRef.current);
        }
        dragRestoreTimerRef.current = setTimeout(() => {
          void restorePosition();
          dragRestoreTimerRef.current = null;
        }, 100);
      } else {
        await restorePosition();
        try { await TauriService.showWindow(); } catch { /* 忽略 */ }
      }
    } catch (err) {
      setDownloadState({ isDownloading: false, progress: 0, error: `拖拽结束处理失败: ${toMsg(err)}` });
    } finally {
      await restorePosition();
    }
  }, [settings.hideAfterDrag, settings.hideOnDrag, restorePosition]);

  const value = useMemo<UIContextValue>(() => ({
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
    handleDragStart, handleDragEnd,
    handleDoubleClick,
  }), [
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
    handleDragStart, handleDragEnd,
    handleDoubleClick,
  ]);

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  );
}
