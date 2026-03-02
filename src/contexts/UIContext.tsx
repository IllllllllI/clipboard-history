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

interface ImageCommandErrorLike {
  code?: string;
  stage?: string;
  message?: string;
}

/** 错误信息提取 */
const toMsg = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseImageCommandError = (err: unknown): ImageCommandErrorLike | null => {
  if (isObjectRecord(err)) {
    const code = typeof err.code === 'string' ? err.code : undefined;
    const stage = typeof err.stage === 'string' ? err.stage : undefined;
    const message = typeof err.message === 'string' ? err.message : undefined;
    if (code || stage || message) {
      return { code, stage, message };
    }
  }

  return null;
};

const isCancelledCode = (code?: string): boolean => code === 'E_CANCELLED';

/** 将后端 failed 事件中的 error_code/stage + error_message 映射为用户提示 */
const mapHttpImageFailedEventError = (errorCode?: string, stage?: string, errorMessage?: string): string => {
  const stageTitle = (() => {
    switch (errorCode) {
      case 'E_NET_REQUEST':
      case 'E_NET_TIMEOUT':
        return '图片下载失败';
      case 'E_FORMAT_INVALID':
        return '图片格式校验失败';
      case 'E_DECODE_FAILED':
        return '图片解码失败';
      case 'E_CLIPBOARD_BUSY':
        return '剪贴板被占用，请稍后重试';
      case 'E_CLIPBOARD_WRITE':
        return '写入剪贴板失败';
      case 'E_RESOURCE_LIMIT':
        return '资源限制触发';
      case 'E_FILE_IO':
        return '文件处理失败';
      case 'E_CANCELLED':
        return '操作已取消';
      default:
        break;
    }

    switch (stage) {
      case 'download':
        return '图片下载失败';
      case 'format':
        return '图片格式校验失败';
      case 'decode':
        return '图片解码失败';
      case 'clipboard':
        return '写入剪贴板失败';
      case 'resource':
        return '资源限制触发';
      default:
        return '图片处理失败';
    }
  })();

  if (errorMessage && errorMessage.trim()) {
    return `${stageTitle}: ${errorMessage}`;
  }

  return stageTitle;
};

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
  activeDownloadRequestIdRef: React.MutableRefObject<string | null>,
  copyToClipboard: (item: ClipItem) => Promise<void>,
  copyFallback: CopyTextFallback,
): Promise<void> {
  // 1) 文件列表
  if (isFileList(text)) {
    await copyToClipboard(textFallbackItem(text));
    return;
  }

  // 2) 链接图片（支持进度事件 + 取消）
  if (detectImageType(text) === ImageType.HttpUrl) {
    const previousRequestId = activeDownloadRequestIdRef.current;
    if (previousRequestId) {
      try { await TauriService.cancelImageDownload(previousRequestId); } catch { /* 忽略 */ }
    }

    const requestId = TauriService.createImageDownloadRequestId();
    activeDownloadRequestIdRef.current = requestId;
    setDownloadState({ isDownloading: true, progress: 0, error: null });
    try {
      await TauriService.downloadAndCopyImage(text, requestId);
    } catch (err) {
      const commandError = parseImageCommandError(err);
      const msg = commandError?.message ?? toMsg(err);
      const isCancelled = isCancelledCode(commandError?.code);
      if (isCancelled) {
        activeDownloadRequestIdRef.current = null;
        setDownloadState({ isDownloading: false, progress: 0, error: null });
        return;
      }

      // 若后端已经发出 failed 事件，监听器会清理 requestId 并设置结构化错误；
      // 此处仅在“事件未到达/未发出”时做兜底，避免重复提示。
      if (activeDownloadRequestIdRef.current === requestId) {
        activeDownloadRequestIdRef.current = null;
        setDownloadState({
          isDownloading: false,
          progress: 0,
          error: mapHttpImageFailedEventError(commandError?.code, commandError?.stage, msg),
        });
      }

      await copyFallback(text);
    }
    return;
  }

  // 3) 图片类型策略表
  const strategy = IMAGE_COPY_STRATEGIES[detectImageType(text)];
  if (strategy) {
    try { await strategy.action(text, setDownloadState); }
    catch (err) {
      const commandError = parseImageCommandError(err);
      const msg = commandError?.message ?? toMsg(err);
      const isCancelled = isCancelledCode(commandError?.code);
      if (isCancelled) {
        setDownloadState({ isDownloading: false, progress: 0, error: null });
        return;
      }

      setDownloadState({
        isDownloading: false,
        progress: 0,
        error: mapHttpImageFailedEventError(commandError?.code, commandError?.stage, msg),
      });
      await copyFallback(text);
    }
    return;
  }

  // 4) 普通文件
  if (detectContentType(text) === 'file') {
    await copyFallback(normalizeFilePath(text));
    return;
  }

  // 5) 纯文本 fallback
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
  clearDownloadState: () => void;

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

const DOWNLOAD_HUD_FOLLOW_INTERVAL_MS = 90;
const DOWNLOAD_HUD_SHOW_DELAY_MS = 150;
const DOWNLOAD_HUD_MIN_VISIBLE_MS = 200;

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
  const clearDownloadState = useCallback(() => {
    setDownloadState({ isDownloading: false, progress: 0, error: null });
  }, []);
  const originalPosition = useRef<PhysicalPosition | null>(null);
  const pendingDragTextRef = useRef<string | null>(null);
  const pendingDragCopyRef = useRef<((item: ClipItem) => Promise<void>) | null>(null);
  const activeDownloadRequestIdRef = useRef<string | null>(null);
  const prefetchRequestIdRef = useRef<string | null>(null);
  const prefetchPromiseRef = useRef<Promise<void> | null>(null);
  const prefetchTextRef = useRef<string | null>(null);
  const dragStateResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRestoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloadHudFollowTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const downloadHudShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloadHudHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloadHudVisibleSinceRef = useRef<number | null>(null);
  const dragHiddenRef = useRef(false);
  const lowerSearchQuery = useMemo(() => searchQuery.toLowerCase(), [searchQuery]);

  const resetPrefetchState = useCallback(() => {
    prefetchRequestIdRef.current = null;
    prefetchPromiseRef.current = null;
    prefetchTextRef.current = null;
  }, []);

  const stopDownloadHudFollow = useCallback(() => {
    if (downloadHudShowTimerRef.current) {
      clearTimeout(downloadHudShowTimerRef.current);
      downloadHudShowTimerRef.current = null;
    }

    if (downloadHudHideTimerRef.current) {
      clearTimeout(downloadHudHideTimerRef.current);
      downloadHudHideTimerRef.current = null;
    }

    const hideNow = () => {
      if (downloadHudFollowTimerRef.current) {
        clearInterval(downloadHudFollowTimerRef.current);
        downloadHudFollowTimerRef.current = null;
      }

      downloadHudVisibleSinceRef.current = null;

      if (isTauri) {
        void TauriService.hideDownloadHud();
      }
    };

    const visibleSince = downloadHudVisibleSinceRef.current;
    if (!visibleSince) {
      hideNow();
      return;
    }

    const elapsed = Date.now() - visibleSince;
    const remaining = DOWNLOAD_HUD_MIN_VISIBLE_MS - elapsed;
    if (remaining <= 0) {
      hideNow();
      return;
    }

    downloadHudHideTimerRef.current = setTimeout(() => {
      downloadHudHideTimerRef.current = null;
      hideNow();
    }, remaining);
  }, []);

  const startDownloadHudFollow = useCallback(() => {
    if (!isTauri) return;

    if (downloadHudHideTimerRef.current) {
      clearTimeout(downloadHudHideTimerRef.current);
      downloadHudHideTimerRef.current = null;
    }

    if (downloadHudFollowTimerRef.current || downloadHudShowTimerRef.current) return;

    downloadHudShowTimerRef.current = setTimeout(() => {
      downloadHudShowTimerRef.current = null;

      if (downloadHudFollowTimerRef.current) return;

      void TauriService.showDownloadHud();
      void TauriService.positionDownloadHudNearCursor();
      downloadHudVisibleSinceRef.current = Date.now();

      downloadHudFollowTimerRef.current = setInterval(() => {
        void TauriService.positionDownloadHudNearCursor();
      }, DOWNLOAD_HUD_FOLLOW_INTERVAL_MS);
    }, DOWNLOAD_HUD_SHOW_DELAY_MS);
  }, []);

  useEffect(() => {
    if (!isTauri) return;

    let mounted = true;
    let unlisten: (() => void) | null = null;

    void TauriService.listenImageDownloadProgress((payload) => {
      if (!mounted) return;

      const activeRequestId = activeDownloadRequestIdRef.current;
      if (activeRequestId && payload.request_id !== activeRequestId) return;
      if (!activeRequestId) {
        activeDownloadRequestIdRef.current = payload.request_id;
      }

      if (payload.status === 'failed') {
        if (payload.error_code === 'E_CANCELLED') {
          setDownloadState({ isDownloading: false, progress: 0, error: null });
          activeDownloadRequestIdRef.current = null;
          stopDownloadHudFollow();
          return;
        }

        setDownloadState({
          isDownloading: false,
          progress: Math.max(0, Math.min(100, payload.progress ?? 0)),
          error: mapHttpImageFailedEventError(payload.error_code, payload.stage, payload.error_message),
        });
        activeDownloadRequestIdRef.current = null;
        stopDownloadHudFollow();
        return;
      }

      if (payload.status === 'cancelled') {
        setDownloadState({ isDownloading: false, progress: 0, error: null });
        activeDownloadRequestIdRef.current = null;
        stopDownloadHudFollow();
        return;
      }

      if (payload.status === 'completed') {
        setDownloadState({ isDownloading: false, progress: 100, error: null });
        activeDownloadRequestIdRef.current = null;
        stopDownloadHudFollow();
        return;
      }

      if (dragHiddenRef.current && settings.showDragDownloadHud) {
        startDownloadHudFollow();
      }

      setDownloadState({
        isDownloading: true,
        progress: Math.max(0, Math.min(100, payload.progress ?? 0)),
        error: null,
      });
    }).then((dispose) => {
      unlisten = dispose;
    }).catch(() => {
      // 忽略监听初始化失败，由调用链错误处理兜底
    });

    return () => {
      mounted = false;
      if (unlisten) unlisten();

      const requestId = activeDownloadRequestIdRef.current;
      if (requestId) {
        void TauriService.cancelImageDownload(requestId);
      }

      resetPrefetchState();

      if (dragStateResetTimerRef.current) clearTimeout(dragStateResetTimerRef.current);
      if (dragRestoreTimerRef.current) clearTimeout(dragRestoreTimerRef.current);
      stopDownloadHudFollow();
    };
  }, [resetPrefetchState, settings.showDragDownloadHud, startDownloadHudFollow, stopDownloadHudFollow]);

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

    pendingDragTextRef.current = text;
    pendingDragCopyRef.current = copyToClipboard;
    resetPrefetchState();

    if (settings.prefetchImageOnDragStart && detectImageType(text) === ImageType.HttpUrl) {
      const requestId = TauriService.createImageDownloadRequestId();
      activeDownloadRequestIdRef.current = requestId;
      prefetchRequestIdRef.current = requestId;
      prefetchTextRef.current = text;
      setDownloadState({ isDownloading: true, progress: 0, error: null });

      prefetchPromiseRef.current = TauriService.downloadAndCopyImage(text, requestId);
    }

    try {
      // 隐藏窗口（如果设置了拖拽时隐藏）
      if (settings.hideOnDrag) {
        try {
          originalPosition.current = await TauriService.getPosition();
          await TauriService.moveOffScreen();
          dragHiddenRef.current = true;
        } catch { /* 继续执行 */ }
      }
    } catch (err) {
      setDownloadState({ isDownloading: false, progress: 0, error: `拖拽操作失败: ${toMsg(err)}` });
      pendingDragTextRef.current = null;
      pendingDragCopyRef.current = null;
      resetPrefetchState();
    }
  }, [resetPrefetchState, settings.hideOnDrag, settings.prefetchImageOnDragStart]);

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

    const text = pendingDragTextRef.current;
    const copyToClipboard = pendingDragCopyRef.current;

    const clearPendingDrag = () => {
      pendingDragTextRef.current = null;
      pendingDragCopyRef.current = null;
    };

    try {
      if (text && copyToClipboard) {
        const isHttpImage = detectImageType(text) === ImageType.HttpUrl;
        if (
          dragHiddenRef.current
          && settings.showDragDownloadHud
          && isHttpImage
          && !!activeDownloadRequestIdRef.current
        ) {
          startDownloadHudFollow();
        }

        const copyFallback: CopyTextFallback = async (t) => {
          try {
            await TauriService.writeClipboard(t);
          } catch {
            await copyToClipboard(textFallbackItem(t));
          }
        };

        const hasMatchingPrefetch =
          isHttpImage
          && prefetchPromiseRef.current
          && prefetchTextRef.current === text;

        if (hasMatchingPrefetch) {
          const prefetchPromise = prefetchPromiseRef.current;
          const prefetchRequestId = prefetchRequestIdRef.current;

          try {
            await prefetchPromise;
          } catch (err) {
            const commandError = parseImageCommandError(err);
            const msg = commandError?.message ?? toMsg(err);
            const isCancelled = isCancelledCode(commandError?.code);

            if (isCancelled) {
              activeDownloadRequestIdRef.current = null;
              setDownloadState({ isDownloading: false, progress: 0, error: null });
            } else {
              if (prefetchRequestId && activeDownloadRequestIdRef.current === prefetchRequestId) {
                activeDownloadRequestIdRef.current = null;
                setDownloadState({
                  isDownloading: false,
                  progress: 0,
                  error: mapHttpImageFailedEventError(commandError?.code, commandError?.stage, msg),
                });
              }
              await copyFallback(text);
            }
          } finally {
            resetPrefetchState();
          }
        } else {
          await dispatchDragCopy(text, setDownloadState, activeDownloadRequestIdRef, copyToClipboard, copyFallback);
        }
      }

      try {
        await TauriService.clickAndPaste();
      } catch (err) {
        setDownloadState({ isDownloading: false, progress: 0, error: `粘贴操作失败: ${toMsg(err)}。请手动使用 Ctrl+V 粘贴。` });
      }

      if (settings.hideAfterDrag) {
        try { await TauriService.hideWindow(); } catch { /* 忽略 */ }
        dragHiddenRef.current = true;
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
        dragHiddenRef.current = false;
        stopDownloadHudFollow();
      }
    } catch (err) {
      setDownloadState({ isDownloading: false, progress: 0, error: `拖拽结束处理失败: ${toMsg(err)}` });
    } finally {
      clearPendingDrag();
      resetPrefetchState();
      dragHiddenRef.current = false;
      stopDownloadHudFollow();

      if (dragStateResetTimerRef.current) {
        clearTimeout(dragStateResetTimerRef.current);
      }
      dragStateResetTimerRef.current = setTimeout(() => {
        setDownloadState(prev => prev.isDownloading ? { isDownloading: false, progress: 0, error: null } : prev);
        dragStateResetTimerRef.current = null;
      }, 100);

      await restorePosition();
    }
  }, [resetPrefetchState, settings.hideAfterDrag, settings.hideOnDrag, settings.showDragDownloadHud, restorePosition, startDownloadHudFollow, stopDownloadHudFollow]);

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
    clearDownloadState,
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
    clearDownloadState,
    handleDragStart, handleDragEnd,
    handleDoubleClick,
  ]);

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  );
}
