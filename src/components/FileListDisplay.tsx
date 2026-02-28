import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  File, FileText, FileCode2, FileImage, FileVideo2, FileAudio,
  FileArchive, FileSpreadsheet, FileType, Folder,
  ExternalLink, FolderOpen, Loader2, CircleCheck, CircleAlert,
} from 'lucide-react';
import { getFileName, getFileExtension, getFileCategory, type FileCategory } from '../utils';
import { TauriService } from '../services/tauri';
import './styles/file-list-display.css';

// ============================================================================
// 系统文件图标缓存 & Hook
// ============================================================================

/** 
 * 模块级图标缓存（KEY: 可能是扩展名，也可能是特定文件路径） 
 */
const iconCache = new Map<string, string | null>();
const ICON_CACHE_LIMIT = 400;
/** 去重正在进行中的请求 */
const pendingRequests = new Map<string, Promise<string | null>>();

function getCachedIcon(cacheKey: string): { hit: boolean; value: string | null } {
  if (!iconCache.has(cacheKey)) {
    return { hit: false, value: null };
  }

  const value = iconCache.get(cacheKey) ?? null;
  iconCache.delete(cacheKey);
  iconCache.set(cacheKey, value);
  return { hit: true, value };
}

function setCachedIcon(cacheKey: string, value: string | null): void {
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

/**
 * 获取系统文件图标（base64 PNG）
 * - 自动判断是按扩展名获取通用图标，还是按路径获取特定文件图标
 */
function useSystemFileIcon(filePath: string): string | null {
  const ext = getFileExtension(filePath);
  
  // 对于 .exe, .lnk 等特殊文件，图标通常是文件特定的，需要按完整路径获取
  // 其他文件类型通常共享同类型的图标，按扩展名获取即可（节省资源）
  const isSpecial = ['exe', 'lnk', 'url', 'ico', 'appref-ms'].includes(ext.toLowerCase());
  
  // 决定缓存Key和请求参数
  // 如果是特殊文件，Key就是完整路径；如果是通用文件，Key就是扩展名
  const cacheKey = isSpecial ? filePath : (ext || 'folder'); 
  
  const [icon, setIcon] = useState<string | null>(() => {
    const cached = getCachedIcon(cacheKey);
    return cached.hit ? cached.value : null;
  });

  useEffect(() => {
    // 检查缓存
    const cached = getCachedIcon(cacheKey);
    if (cached.hit) {
      setIcon(cached.value);
      return;
    }

    // 去重：复用已有的请求
    let promise = pendingRequests.get(cacheKey);
    if (!promise) {
      // 调用后端：如果 Key 是路径，后端会尝试获取特定文件图标；
      // 如果 Key 是扩展名，后端会获取通用图标
      promise = TauriService.getFileIcon(cacheKey);
      pendingRequests.set(cacheKey, promise);
    }

    promise.then((result) => {
      setCachedIcon(cacheKey, result);
      pendingRequests.delete(cacheKey);
      setIcon(result);
    }).catch(err => {
      console.warn("Failed to load icon:", cacheKey, err);
      // 失败后缓存 null 防止反复请求（例如文件不存在）
      setCachedIcon(cacheKey, null);
      pendingRequests.delete(cacheKey);
      setIcon(null);
    });
  }, [filePath, ext, cacheKey]);

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
  showActions: boolean;
  compact?: boolean;
}

const FileItem = React.memo(function FileItem({
  filePath,
  isSelected,
  darkMode,
  showActions,
  compact = false,
}: FileItemProps) {
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

  const handleOpenFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    void openFileWithStatus();
  };

  const handleOpenLocation = (e: React.MouseEvent) => {
    e.stopPropagation();
    TauriService.openFileLocation(filePath);
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
      className="file-list-item"
      data-theme={darkMode ? 'dark' : 'light'}
      data-selected={isSelected ? 'true' : 'false'}
      data-compact={compact ? 'true' : 'false'}
      data-openable="true"
      data-open-state={openState}
      title={`${filePath}\n${statusTitle}`}
      onDoubleClick={handleFileDoubleClick}
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

      <span className="file-list-item__status" data-state={openState} aria-hidden="true">
        {openState === 'opening' && <Loader2 className="file-list-item__status-icon file-list-item__status-icon-spin" />}
        {openState === 'success' && <CircleCheck className="file-list-item__status-icon" />}
        {openState === 'error' && <CircleAlert className="file-list-item__status-icon" />}
      </span>

      {showActions && (
        <div className="file-list-item__actions">
          <button
            type="button"
            onClick={handleOpenFile}
            className="file-list-item__action-btn"
            title="打开文件"
          >
            <ExternalLink className="file-list-item__action-icon" />
          </button>
          <button
            type="button"
            onClick={handleOpenLocation}
            className="file-list-item__action-btn"
            title="打开文件位置"
          >
            <FolderOpen className="file-list-item__action-icon" />
          </button>
        </div>
      )}
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
}

export const FileListDisplay = React.memo(function FileListDisplay({ files, isSelected, darkMode }: FileListDisplayProps) {
  const isSingle = files.length === 1;
  const displayFiles = files.slice(0, 5); // 最多显示 5 个文件
  const remaining = files.length - displayFiles.length;

  return (
    <div
      className="file-list-display"
      data-theme={darkMode ? 'dark' : 'light'}
      data-selected={isSelected ? 'true' : 'false'}
      data-single={isSingle ? 'true' : 'false'}
    >
      {/* 文件列表 */}
      <div className="file-list-display__items">
        {displayFiles.map((file, i) => (
          <FileItem
            key={i}
            filePath={file}
            isSelected={isSelected}
            darkMode={darkMode}
            showActions={isSingle}
            compact={!isSingle}
          />
        ))}
      </div>

      {/* 剩余文件提示 */}
      {remaining > 0 && (
        <div className="file-list-display__remaining">
          还有 {remaining} 个文件...
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
