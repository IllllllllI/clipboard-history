import React, { useState, useEffect } from 'react';
import {
  File, FileText, FileCode2, FileImage, FileVideo2, FileAudio,
  FileArchive, FileSpreadsheet, FileType, Folder,
  ExternalLink, FolderOpen,
} from 'lucide-react';
import { getFileName, getFileExtension, getFileCategory, type FileCategory } from '../utils';
import { TauriService } from '../services/tauri';

// ============================================================================
// 系统文件图标缓存 & Hook
// ============================================================================

/** 
 * 模块级图标缓存（KEY: 可能是扩展名，也可能是特定文件路径） 
 */
const iconCache = new Map<string, string | null>();
/** 去重正在进行中的请求 */
const pendingRequests = new Map<string, Promise<string | null>>();

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
  
  const [icon, setIcon] = useState<string | null>(iconCache.get(cacheKey) ?? null);

  useEffect(() => {
    // 检查缓存
    if (iconCache.has(cacheKey)) {
      setIcon(iconCache.get(cacheKey) ?? null);
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
      iconCache.set(cacheKey, result);
      pendingRequests.delete(cacheKey);
      setIcon(result);
    }).catch(err => {
      console.warn("Failed to load icon:", cacheKey, err);
      // 失败后缓存 null 防止反复请求（例如文件不存在）
      iconCache.set(cacheKey, null); 
      pendingRequests.delete(cacheKey);
      setIcon(null);
    });
  }, [filePath, ext, cacheKey]);

  return icon;
}


// ============================================================================
// 文件图标映射
// ============================================================================

/** 文件分类 → 图标 + 颜色映射 */
const FILE_ICON_MAP: Record<FileCategory, { icon: typeof File; color: string }> = {
  image:        { icon: FileImage,       color: 'text-emerald-500' },
  video:        { icon: FileVideo2,      color: 'text-purple-500' },
  audio:        { icon: FileAudio,       color: 'text-pink-500' },
  document:     { icon: FileText,        color: 'text-blue-500' },
  spreadsheet:  { icon: FileSpreadsheet, color: 'text-green-600' },
  presentation: { icon: FileType,        color: 'text-orange-500' },
  pdf:          { icon: FileText,        color: 'text-red-500' },
  code:         { icon: FileCode2,       color: 'text-cyan-500' },
  archive:      { icon: FileArchive,     color: 'text-yellow-600' },
  executable:   { icon: File,            color: 'text-red-600' },
  font:         { icon: FileType,        color: 'text-indigo-500' },
  text:         { icon: FileText,        color: 'text-neutral-500' },
  folder:       { icon: Folder,          color: 'text-amber-500' },
  unknown:      { icon: File,            color: 'text-neutral-400' },
};

const getFileIcon = (category: FileCategory) =>
  FILE_ICON_MAP[category] ?? FILE_ICON_MAP.unknown;

// ============================================================================
// 单个文件项
// ============================================================================

interface FileItemProps {
  filePath: string;
  isSelected: boolean;
  compact?: boolean;
}

const FileItem = React.memo(function FileItem({ filePath, isSelected, compact = false }: FileItemProps) {
  const fileName = getFileName(filePath);
  const ext = getFileExtension(filePath);
  const category = getFileCategory(filePath);
  const { icon: FallbackIcon, color } = getFileIcon(category);
  
  // Use custom hook to fetch system icon
  const systemIcon = useSystemFileIcon(filePath);

  const handleOpenFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    TauriService.openFile(filePath);
  };

  const handleOpenLocation = (e: React.MouseEvent) => {
    e.stopPropagation();
    TauriService.openFileLocation(filePath);
  };

  return (
    <div
      className={`group/file flex items-center gap-2 rounded-lg transition-all ${
        compact ? 'px-2 py-1' : 'px-2.5 py-1.5'
      } ${
        isSelected
          ? 'bg-white/10 hover:bg-white/15'
          : 'bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.06] dark:hover:bg-white/[0.06]'
      }`}
    >
      {/* 系统图标优先，回退到 lucide 图标 */}
      {systemIcon ? (
        <img
          src={systemIcon}
          alt=""
          className="w-4 h-4 shrink-0 object-contain"
          draggable={false}
        />
      ) : (
        <FallbackIcon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white/80' : color}`} />
      )}
      
      <span
        className={`text-sm truncate flex-1 min-w-0 ${
          isSelected ? 'text-white/90' : 'text-neutral-700 dark:text-neutral-300'
        }`}
        title={filePath}
      >
        {fileName}
      </span>

      <div className={`flex items-center gap-0.5 shrink-0 ${
        isSelected ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover/file:opacity-100'
      } transition-opacity`}>
        <button
          onClick={handleOpenFile}
          className={`p-1 rounded transition-colors ${
            isSelected
              ? 'hover:bg-white/20 text-white/80'
              : 'hover:bg-black/10 dark:hover:bg-white/10 text-neutral-500 dark:text-neutral-400'
          }`}
          title="打开文件"
        >
          <ExternalLink className="w-3 h-3" />
        </button>
        <button
          onClick={handleOpenLocation}
          className={`p-1 rounded transition-colors ${
            isSelected
              ? 'hover:bg-white/20 text-white/80'
              : 'hover:bg-black/10 dark:hover:bg-white/10 text-neutral-500 dark:text-neutral-400'
          }`}
          title="打开文件位置"
        >
          <FolderOpen className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
});

// ============================================================================
// 文件列表组件
// ============================================================================

interface FileListDisplayProps {
  files: string[];
  isSelected: boolean;
}

export const FileListDisplay = React.memo(function FileListDisplay({ files, isSelected }: FileListDisplayProps) {
  const isSingle = files.length === 1;
  const displayFiles = files.slice(0, 5); // 最多显示 5 个文件
  const remaining = files.length - displayFiles.length;

  return (
    <div className="w-full flex flex-col gap-1">
      {/* 文件列表 */}
      <div className="flex flex-col gap-0.5">
        {displayFiles.map((file, i) => (
          <FileItem
            key={i}
            filePath={file}
            isSelected={isSelected}
            compact={!isSingle}
          />
        ))}
      </div>

      {/* 剩余文件提示 */}
      {remaining > 0 && (
        <div className={`text-[10px] px-2 ${
          isSelected ? 'text-indigo-200' : 'text-neutral-400 dark:text-neutral-500'
        }`}>
          还有 {remaining} 个文件...
        </div>
      )}

      {/* 文件数量标签 */}
      {!isSingle && (
        <div className={`flex items-center gap-1.5 text-[10px] px-2 mt-0.5 ${
          isSelected ? 'text-indigo-200' : 'text-neutral-500 dark:text-neutral-400'
        }`}>
          <Folder className="w-3 h-3" />
          <span>共 {files.length} 个文件</span>
        </div>
      )}
    </div>
  );
});
