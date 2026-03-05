import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  File, FileText, FileCode2, FileImage, FileVideo2, FileAudio,
  FileArchive, FileSpreadsheet, FileType, Folder,
  ExternalLink, FolderOpen, Loader2, CircleCheck, CircleAlert, Check,
} from 'lucide-react';
import { getFileName, getFileExtension, getFileCategory, type FileCategory } from '../utils';
import { TauriService } from '../services/tauri';
import { COPY_FEEDBACK_DURATION_MS } from '../constants';
import './styles/file-list-display.css';

// ============================================================================
// 系统文件图标缓存 & Hook
// ============================================================================

/** 
 * 模块级图标缓存（KEY: 可能是扩展名，也可能是特定文件路径） 
 */
const iconCache = new Map<string, string>();
const ICON_CACHE_LIMIT = 400;
/** 去重正在进行中的请求 */
const pendingRequests = new Map<string, Promise<string | null>>();

function getCachedIcon(cacheKey: string): { hit: boolean; value: string | null } {
  if (!iconCache.has(cacheKey)) {
    return { hit: false, value: null };
  }

  const value = iconCache.get(cacheKey) ?? null;
  iconCache.delete(cacheKey);
  if (value) {
    iconCache.set(cacheKey, value);
  }
  return { hit: true, value };
}

function setCachedIcon(cacheKey: string, value: string | null): void {
  if (value == null) {
    iconCache.delete(cacheKey);
    return;
  }

  if (iconCache.has(cacheKey)) {
    iconCache.delete(cacheKey);
  }

  iconCache.set(cacheKey, value);

  while (iconCache.size > ICON_CACHE_LIMIT) {
    const oldestKey = iconCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    iconCache.delete(oldestKey);
  }
}

/** 需要按完整路径获取特定图标的扩展名 */
const SPECIAL_ICON_EXTS = new Set(['exe', 'lnk', 'url', 'ico', 'appref-ms']);

/** 最大重试次数 */
const ICON_MAX_RETRIES = 2;

/**
 * 获取系统文件图标（base64 PNG）
 * - 自动判断是按扩展名获取通用图标，还是按路径获取特定文件图标
 *
 * 改进：
 * - `SPECIAL_ICON_EXTS` 提升为模块级 Set（O(1) 查找，不再每次创建临时数组）
 * - 重试逻辑提取为 `scheduleRetry` 闭包，消除 then/catch 中的重复代码
 */
function useSystemFileIcon(filePath: string): string | null {
  const ext = getFileExtension(filePath);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  const [retryToken, setRetryToken] = useState(0);

  // 特殊文件按完整路径获取图标；通用文件按扩展名获取
  const cacheKey = SPECIAL_ICON_EXTS.has(ext) ? filePath : (ext || 'folder');

  const [icon, setIcon] = useState<string | null>(() => {
    const cached = getCachedIcon(cacheKey);
    return cached.hit ? cached.value : null;
  });

  // ── cacheKey 变更时重置重试状态 ──
  useEffect(() => {
    retryAttemptRef.current = 0;
    setRetryToken(0);
    const clearTimer = () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
    clearTimer();
    return clearTimer;
  }, [cacheKey]);

  // ── 核心加载 ──
  useEffect(() => {
    const cached = getCachedIcon(cacheKey);
    if (cached.hit) {
      setIcon(cached.value);
      return;
    }

    /** 安排一次延迟重试 */
    const scheduleRetry = (baseDelayMs: number) => {
      if (retryAttemptRef.current >= ICON_MAX_RETRIES) return;
      retryAttemptRef.current += 1;
      const delayMs = baseDelayMs * retryAttemptRef.current;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        setRetryToken((v) => v + 1);
      }, delayMs);
    };

    // 去重：复用已有的请求
    let promise = pendingRequests.get(cacheKey);
    if (!promise) {
      promise = TauriService.getFileIcon(cacheKey);
      pendingRequests.set(cacheKey, promise);
    }

    promise.then((result) => {
      setCachedIcon(cacheKey, result);
      pendingRequests.delete(cacheKey);
      setIcon(result);

      if (result) {
        retryAttemptRef.current = 0;
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
      } else {
        scheduleRetry(180);
      }
    }).catch((err) => {
      console.warn('Failed to load icon:', cacheKey, err);
      setCachedIcon(cacheKey, null);
      pendingRequests.delete(cacheKey);
      setIcon(null);
      scheduleRetry(220);
    });
  }, [cacheKey, retryToken]);

  return icon;
}


// ============================================================================
// 文件图标映射
// ============================================================================

/** 文件分类 → 图标映射 */
const FILE_ICON_MAP: Record<FileCategory, { icon: typeof File }> = {
  image:        { icon: FileImage },
  video:        { icon: FileVideo2 },
  audio:        { icon: FileAudio },
  document:     { icon: FileText },
  spreadsheet:  { icon: FileSpreadsheet },
  presentation: { icon: FileType },
  pdf:          { icon: FileText },
  code:         { icon: FileCode2 },
  archive:      { icon: FileArchive },
  executable:   { icon: File },
  font:         { icon: FileType },
  text:         { icon: FileText },
  folder:       { icon: Folder },
  unknown:      { icon: File },
};

const getFileIcon = (category: FileCategory) =>
  FILE_ICON_MAP[category] ?? FILE_ICON_MAP.unknown;

// ============================================================================
// 单个文件项
// ============================================================================

interface FileItemProps {
  filePath: string;
  isSelected: boolean;
  darkMode: boolean;
  compact?: boolean;
  copied?: boolean;
  onCopy?: (filePath: string) => void;
  onDragStartItem?: (e: React.DragEvent<HTMLDivElement>, filePath: string) => void;
  onHoverChange?: (payload: { filePath: string; rowEl: HTMLDivElement } | null) => void;
}

const FileItem = React.memo(function FileItem({
  filePath,
  isSelected,
  darkMode,
  compact = false,
  copied = false,
  onCopy,
  onDragStartItem,
  onHoverChange,
}: FileItemProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [openState, setOpenState] = useState<'idle' | 'opening' | 'success' | 'error'>('idle');
  const openingDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fileName = getFileName(filePath);
  const category = getFileCategory(filePath);
  const { icon: FallbackIcon } = getFileIcon(category);
  
  // Use custom hook to fetch system icon
  const systemIcon = useSystemFileIcon(filePath);

  const clearStatusTimers = useCallback(() => {
    if (openingDelayTimerRef.current) {
      clearTimeout(openingDelayTimerRef.current);
      openingDelayTimerRef.current = null;
    }
    if (resetStateTimerRef.current) {
      clearTimeout(resetStateTimerRef.current);
      resetStateTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearStatusTimers();
    };
  }, [clearStatusTimers]);

  const openFileWithStatus = useCallback(async () => {
    clearStatusTimers();
    openingDelayTimerRef.current = setTimeout(() => {
      setOpenState('opening');
      openingDelayTimerRef.current = null;
    }, 180);

    try {
      await TauriService.openFile(filePath);
      clearStatusTimers();
      setOpenState('success');
      resetStateTimerRef.current = setTimeout(() => {
        setOpenState('idle');
        resetStateTimerRef.current = null;
      }, 1000);
    } catch (error) {
      console.warn('Open file failed:', filePath, error);
      clearStatusTimers();
      setOpenState('error');
      resetStateTimerRef.current = setTimeout(() => {
        setOpenState('idle');
        resetStateTimerRef.current = null;
      }, 1400);
    }
  }, [clearStatusTimers, filePath]);

  const handleCopyItem = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    onCopy?.(filePath);
  };

  const handleCopyByKeyboard = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    onCopy?.(filePath);
  };

  const handleDragStartItem = (e: React.DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    onDragStartItem?.(e, filePath);
  };

  const handleFileDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, [role="button"]')) {
      return;
    }
    void openFileWithStatus();
  };

  const statusTitle =
    openState === 'opening'
      ? '正在打开...'
      : openState === 'success'
        ? '已打开'
        : openState === 'error'
          ? '打开失败'
          : '双击打开文件';

  return (
    <div
      ref={rowRef}
      className="file-list-item"
      data-theme={darkMode ? 'dark' : 'light'}
      data-selected={isSelected ? 'true' : 'false'}
      data-compact={compact ? 'true' : 'false'}
      data-copied={copied ? 'true' : 'false'}
      data-openable="true"
      data-open-state={openState}
      role="button"
      tabIndex={0}
      draggable
      title={`${filePath}\n点击复制文件路径，双击打开文件\n${statusTitle}`}
      onClick={handleCopyItem}
      onKeyDown={handleCopyByKeyboard}
      onDragStart={handleDragStartItem}
      onDoubleClick={handleFileDoubleClick}
      onMouseEnter={() => {
        if (rowRef.current) {
          onHoverChange?.({ filePath, rowEl: rowRef.current });
        }
      }}
      onFocus={() => {
        if (rowRef.current) {
          onHoverChange?.({ filePath, rowEl: rowRef.current });
        }
      }}
    >
      {/* 系统图标优先，回退到 lucide 图标 */}
      {systemIcon ? (
        <img
          src={systemIcon}
          alt=""
          className="file-list-item__system-icon"
          draggable={false}
        />
      ) : (
        <FallbackIcon
          className="file-list-item__fallback-icon"
          data-file-category={category}
        />
      )}
      
      <span
        className="file-list-item__name"
        title={filePath}
      >
        {fileName}
      </span>

      <span className="file-list-item__copy-mark" data-visible={copied ? 'true' : 'false'} aria-hidden="true">
        <Check className="file-list-item__copy-mark-icon" />
      </span>

      <span className="file-list-item__status" data-state={openState} aria-hidden="true">
        {openState === 'opening' && <Loader2 className="file-list-item__status-icon file-list-item__status-icon-spin" />}
        {openState === 'success' && <CircleCheck className="file-list-item__status-icon" />}
        {openState === 'error' && <CircleAlert className="file-list-item__status-icon" />}
      </span>

    </div>
  );
});

// ============================================================================
// 文件列表组件
// ============================================================================

interface FileListDisplayProps {
  files: string[];
  isSelected: boolean;
  darkMode: boolean;
  onItemCopy?: (filePath: string) => void;
  onItemDragStart?: (e: React.DragEvent<HTMLDivElement>, filePath: string) => void;
  maxVisibleItems?: number;
}

export const FileListDisplay = React.memo(function FileListDisplay({ files, isSelected, darkMode, onItemCopy, onItemDragStart, maxVisibleItems = 5 }: FileListDisplayProps) {
  const isSingle = files.length === 1;
  const itemsRef = useRef<HTMLDivElement | null>(null);
  const normalizedMaxVisibleItems = Math.min(30, Math.max(1, Math.trunc(maxVisibleItems)));
  const [expanded, setExpanded] = useState(false);
  const [hoveredAction, setHoveredAction] = useState<{ filePath: string; top: number } | null>(null);
  const canExpand = files.length > normalizedMaxVisibleItems;
  const displayFiles = canExpand && !expanded
    ? files.slice(0, normalizedMaxVisibleItems)
    : files;
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setExpanded(false);
  }, [files.length, normalizedMaxVisibleItems]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const handleItemCopy = useCallback((index: number, filePath: string) => {
    onItemCopy?.(filePath);
    setCopiedIndex(index);
    if (copiedTimerRef.current) {
      clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = setTimeout(() => {
      setCopiedIndex(null);
      copiedTimerRef.current = null;
    }, COPY_FEEDBACK_DURATION_MS);
  }, [onItemCopy]);

  const handleHoverChange = useCallback((payload: { filePath: string; rowEl: HTMLDivElement } | null) => {
    if (!payload) {
      setHoveredAction(null);
      return;
    }

    const listEl = itemsRef.current;
    if (!listEl) return;

    const listRect = listEl.getBoundingClientRect();
    const rowRect = payload.rowEl.getBoundingClientRect();
    const top = rowRect.top - listRect.top + rowRect.height / 2;

    setHoveredAction({ filePath: payload.filePath, top });
  }, []);

  return (
    <div
      className="file-list-display"
      data-theme={darkMode ? 'dark' : 'light'}
      data-selected={isSelected ? 'true' : 'false'}
      data-single={isSingle ? 'true' : 'false'}
    >
      {/* 文件列表 */}
      <div
        ref={itemsRef}
        className="file-list-display__items"
        onMouseLeave={() => setHoveredAction(null)}
      >
        {displayFiles.map((file, i) => (
          <FileItem
            key={file}
            filePath={file}
            isSelected={isSelected}
            darkMode={darkMode}
            compact={!isSingle}
            copied={copiedIndex === i}
            onCopy={(filePath) => handleItemCopy(i, filePath)}
            onDragStartItem={onItemDragStart}
            onHoverChange={handleHoverChange}
          />
        ))}

        {hoveredAction && (
          <div
            className="file-list-display__hover-actions"
            style={{ top: `${hoveredAction.top}px` }}
            data-theme={darkMode ? 'dark' : 'light'}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="file-list-item__action-btn"
              title="打开文件"
              onClick={() => { void TauriService.openFile(hoveredAction.filePath); }}
            >
              <ExternalLink className="file-list-item__action-icon" />
            </button>
            <button
              type="button"
              className="file-list-item__action-btn"
              title="打开文件位置"
              onClick={() => { void TauriService.openFileLocation(hoveredAction.filePath); }}
            >
              <FolderOpen className="file-list-item__action-icon" />
            </button>
          </div>
        )}
      </div>

      {canExpand && (
        <div className="file-list-display__toggle-wrap">
          <button
            type="button"
            className="file-list-display__toggle-btn"
            data-theme={darkMode ? 'dark' : 'light'}
            aria-expanded={expanded ? 'true' : 'false'}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }}
          >
            {expanded ? '收起列表' : `展开剩余 ${files.length - normalizedMaxVisibleItems} 项`}
          </button>
        </div>
      )}

      {/* 文件数量标签 */}
      {!isSingle && (
        <div className="file-list-display__summary">
          <Folder className="file-list-display__summary-icon" />
          <span>共 {files.length} 个文件</span>
        </div>
      )}
    </div>
  );
});
