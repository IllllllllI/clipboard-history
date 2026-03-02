import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { Globe, HardDrive, FileCode2, Images, ExternalLink, Check, Loader2, CircleCheck, CircleAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ClipItem, ImageType, GalleryDisplayMode, GalleryScrollDirection, GalleryWheelMode } from '../../types';
import { decodeFileList, detectImageType, findDateTimesInText, normalizeFilePath } from '../../utils';
import { expandHex } from '../../utils/colorConvert';
import { TauriService } from '../../services/tauri';
import { ImageDisplay } from '../ImageDisplay';
import { FileListDisplay } from '../FileListDisplay';
import { ImageGallery } from '../ImageGallery';
import { ImagePreview } from './ImagePreview';
import { HighlightText } from './HighlightText';
import { HighlightDateTimeText } from './DateTimeChip';
import { ColorPickerPopover } from './ClipItemColorPicker';
import './styles/clip-item-content.css';

/** 标准化 hex 用于比较：展开短 hex、小写、去除不透明 alpha（ff） */
function normalizeHex(hex: string): string {
  const expanded = expandHex(hex).toLowerCase();
  // 去除完全不透明的 alpha 后缀 ff
  if (expanded.length === 9 && expanded.endsWith('ff')) {
    return expanded.slice(0, 7);
  }
  return expanded;
}

interface ClipItemContentProps {
  item: ClipItem;
  type: string;
  isImage: boolean;
  imageType: ImageType;
  imageUrls: string[];
  searchQuery: string;
  showImagePreview: boolean;
  setPreviewImageUrl: (url: string) => void;
  isSelected: boolean;
  darkMode: boolean;
  galleryDisplayMode: GalleryDisplayMode;
  galleryScrollDirection: GalleryScrollDirection;
  galleryWheelMode: GalleryWheelMode;
  galleryListMaxVisibleItems: number;
  fileListMaxVisibleItems: number;
  onFileListItemClick: (filePath: string) => void;
  onFileListItemDragStart: (e: React.DragEvent<HTMLDivElement>, filePath: string) => void;
  onGalleryDisplayModeChange: (mode: GalleryDisplayMode) => void;
  onGalleryScrollDirectionChange: (dir: GalleryScrollDirection) => void;
  onGalleryListItemClick: (url: string) => void;
  onGalleryListItemDragStart: (e: React.DragEvent<HTMLDivElement>, url: string) => void;
  onGalleryCopyImage: (url: string) => void;
  onUpdatePickedColor: (id: number, color: string | null) => Promise<void>;
  onCopyAsNewColor: (color: string) => Promise<void>;
  copyText: (text: string) => Promise<void>;
}

/** 根据内容类型渲染剪贴板条目的正文区域 */
export const ClipItemContent = React.memo(function ClipItemContent({
  item,
  type,
  isImage,
  imageType,
  imageUrls,
  searchQuery,
  showImagePreview,
  setPreviewImageUrl,
  isSelected,
  darkMode,
  galleryDisplayMode,
  galleryScrollDirection,
  galleryWheelMode,
  galleryListMaxVisibleItems,
  fileListMaxVisibleItems,
  onFileListItemClick,
  onFileListItemDragStart,
  onGalleryDisplayModeChange,
  onGalleryScrollDirectionChange,
  onGalleryListItemClick,
  onGalleryListItemDragStart,
  onGalleryCopyImage,
  onUpdatePickedColor,
  onCopyAsNewColor,
  copyText,
}: ClipItemContentProps) {
  // ⚠ 所有 Hooks 必须在条件分支前调用，确保 React Hooks 调用规则
  // pickedColor 使用数据库持久化的 item.picked_color
  // localPickedColor 仅在调色板打开期间作为临时 draft
  const [localPickedColor, setLocalPickedColor] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [copiedColor, setCopiedColor] = useState<string | null>(null);
  const [urlOpenState, setUrlOpenState] = useState<'idle' | 'opening' | 'success' | 'error'>('idle');
  const colorBtnRef = useRef<HTMLDivElement>(null);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlOpeningDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlStateResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearUrlStateTimers = useCallback(() => {
    if (urlOpeningDelayTimerRef.current) {
      clearTimeout(urlOpeningDelayTimerRef.current);
      urlOpeningDelayTimerRef.current = null;
    }

    if (urlStateResetTimerRef.current) {
      clearTimeout(urlStateResetTimerRef.current);
      urlStateResetTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current) {
        clearTimeout(copyFeedbackTimerRef.current);
      }

      clearUrlStateTimers();
    };
  }, [clearUrlStateTimers]);

  const showCopiedFeedback = useCallback((value: string) => {
    setCopiedColor(value);
    if (copyFeedbackTimerRef.current) {
      clearTimeout(copyFeedbackTimerRef.current);
    }
    copyFeedbackTimerRef.current = setTimeout(() => {
      setCopiedColor(null);
      copyFeedbackTimerRef.current = null;
    }, 2000);
  }, []);

  const handleColorConfirm = useCallback(async (color: string) => {
    setShowColorPicker(false);
    // 不在此处清 localPickedColor，保持显示新色直到 DB 刷新完成

    // 标准化比较：处理短 hex (#f00 vs #ff0000)、大小写、不透明 alpha
    const nextPicked = normalizeHex(color) === normalizeHex(item.text) ? null : color;
    await onUpdatePickedColor(item.id, nextPicked);
    // DB 已更新 + loadHistory 完成，item.picked_color 已是最新值
    setLocalPickedColor(null);
  }, [item.id, item.text, onUpdatePickedColor]);

  const handleColorCopy = useCallback(async (color: string) => {
    await onCopyAsNewColor(color);
  }, [onCopyAsNewColor]);

  const handleColorClose = useCallback(() => {
    setShowColorPicker(false);
    setLocalPickedColor(null);
  }, []);

  const trimmedText = useMemo(() => item.text.trim(), [item.text]);
  const displayText = useMemo(() => item.text.replace(/\n/g, ' ↵ '), [item.text]);
  const dtMatches = useMemo(() => findDateTimesInText(displayText), [displayText]);
  const hasDateTime = dtMatches.length > 0;
  const isUrl = useMemo(() => /^https?:\/\/\S+$/i.test(trimmedText), [trimmedText]);
  const files = useMemo(() => (type === 'files' ? decodeFileList(item.text) : []), [type, item.text]);
  const fileImageUrls = useMemo(
    () => files.filter((path) => detectImageType(path) === ImageType.LocalFile),
    [files],
  );
  const showFilesAsGallery = useMemo(
    () => showImagePreview && type === 'files' && files.length > 0 && fileImageUrls.length === files.length,
    [showImagePreview, type, files.length, fileImageUrls.length],
  );
  const galleryImageUrls = useMemo(
    () => (type === 'multi-image' ? imageUrls : showFilesAsGallery ? fileImageUrls : []),
    [type, imageUrls, showFilesAsGallery, fileImageUrls],
  );

  const openUrlWithStatus = useCallback(async () => {
    clearUrlStateTimers();
    urlOpeningDelayTimerRef.current = setTimeout(() => {
      setUrlOpenState('opening');
      urlOpeningDelayTimerRef.current = null;
    }, 180);

    const value = trimmedText;

    try {
      if (imageType === ImageType.LocalFile) {
        await TauriService.openFile(normalizeFilePath(value));
      } else {
        await TauriService.openPath(value);
      }

      clearUrlStateTimers();
      setUrlOpenState('success');
      urlStateResetTimerRef.current = setTimeout(() => {
        setUrlOpenState('idle');
        urlStateResetTimerRef.current = null;
      }, 1000);
    } catch (error) {
      clearUrlStateTimers();
      setUrlOpenState('error');
      console.warn('Open url failed:', value, error);
      urlStateResetTimerRef.current = setTimeout(() => {
        setUrlOpenState('idle');
        urlStateResetTimerRef.current = null;
      }, 1400);
    }
  }, [clearUrlStateTimers, imageType, trimmedText]);

  const handleUrlDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void openUrlWithStatus();
  }, [openUrlWithStatus]);

  const openStatusTitle =
    urlOpenState === 'opening'
      ? '正在打开...'
      : urlOpenState === 'success'
        ? '已打开'
        : urlOpenState === 'error'
          ? '打开失败'
          : imageType === ImageType.LocalFile
            ? '双击打开文件'
            : '双击打开链接';

  const handleCopyColor = useCallback((e: React.MouseEvent, value: string) => {
    e.stopPropagation();
    void copyText(value).then(() => {
      showCopiedFeedback(value);
    });
  }, [copyText, showCopiedFeedback]);

  // --- 文件列表 ---
  if (type === 'files' && !showFilesAsGallery) {
    return (
      <FileListDisplay
        files={files}
        isSelected={isSelected}
        darkMode={darkMode}
        onItemCopy={onFileListItemClick}
        onItemDragStart={onFileListItemDragStart}
        maxVisibleItems={fileListMaxVisibleItems}
      />
    );
  }

  // --- 颜色值 ---
  if (type === 'color') {
    // 优先级: 调色板临时 draft > 数据库持久化 > 原始 text
    const displayColor = localPickedColor || item.picked_color || item.text;
    // ColorPickerPopover 使用的 pickedColor：打开期间用 localDraft，关闭后用持久化值
    const pickerColor = showColorPicker ? localPickedColor : item.picked_color;
    // 是否存在不同于原始色的自定义颜色
    const hasPickedDiff = !!(item.picked_color && normalizeHex(item.picked_color) !== normalizeHex(item.text));

    const openPicker = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!showColorPicker) {
        setLocalPickedColor(item.picked_color);
      }
      setShowColorPicker(!showColorPicker);
    };

    return (
      <div className="clip-item-content-color-row">
        {hasPickedDiff ? (
          <>
            {/* 原始颜色色块 */}
            <div
              className="clip-item-content-color-chip"
              data-theme={darkMode ? 'dark' : 'light'}
              title={`原始: ${item.text}`}
            >
              <div className="clip-item-content-color-chip-fill" style={{ backgroundColor: item.text }} />
            </div>
            <span className="clip-item-content-color-arrow">→</span>
            {/* 调色后色块（可点击打开调色板） */}
            <div
              ref={colorBtnRef}
              className="clip-item-content-color-chip clip-item-content-color-chip-picked clip-item-content-color-chip-clickable"
              data-theme={darkMode ? 'dark' : 'light'}
              title="点击修改颜色"
              onClick={openPicker}
            >
              <div className="clip-item-content-color-chip-fill" style={{ backgroundColor: displayColor }} />
            </div>
          </>
        ) : (
          /* 仅原始色块（可点击打开调色板） */
          <div
            ref={colorBtnRef}
            className="clip-item-content-color-chip clip-item-content-color-chip-clickable"
            data-theme={darkMode ? 'dark' : 'light'}
            title="点击调出颜色板"
            onClick={openPicker}
          >
            <div className="clip-item-content-color-chip-fill" style={{ backgroundColor: item.text }} />
          </div>
        )}

        {/* 文字：原始色值 + 调色后色值 */}
        <div 
          className="clip-item-content-color-text-wrap"
          onClick={(e) => handleCopyColor(e, item.text)}
          title="点击复制原始颜色"
        >
          <p className="clip-item-content-color-text">
            {item.text}
          </p>
          <AnimatePresence>
            {copiedColor === item.text && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.15 }}
              >
                <Check className="clip-item-content-copy-check" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {hasPickedDiff && (
          <div 
            className="clip-item-content-color-text-wrap"
            onClick={(e) => {
              if (item.picked_color) {
                handleCopyColor(e, item.picked_color);
              }
            }}
            title="点击复制新颜色"
          >
            <span className="clip-item-content-color-new" data-theme={darkMode ? 'dark' : 'light'}>
              → {item.picked_color}
            </span>
            <AnimatePresence>
              {copiedColor === item.picked_color && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.15 }}
                >
                  <Check className="clip-item-content-copy-check-small" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <ColorPickerPopover
          originalColor={item.text}
          pickedColor={pickerColor}
          darkMode={darkMode}
          onColorChange={setLocalPickedColor}
          onConfirm={handleColorConfirm}
          onCopy={handleColorCopy}
          onClose={handleColorClose}
          anchorRef={colorBtnRef}
          isOpen={showColorPicker}
        />
      </div>
    );
  }

  // --- 文件图片相册 / 多图相册 ---
  if (showFilesAsGallery || (showImagePreview && isImage && type === 'multi-image')) {
    return (
      <ImageGallery
        imageUrls={galleryImageUrls}
        baseItem={item}
        darkMode={darkMode}
        onImageClick={setPreviewImageUrl}
        displayMode={galleryDisplayMode}
        scrollDirection={galleryScrollDirection}
        wheelMode={galleryWheelMode}
        listMaxVisibleItems={galleryListMaxVisibleItems}
        isFileGallery={showFilesAsGallery}
        onCopyImage={onGalleryCopyImage}
        onListItemClick={onGalleryListItemClick}
        onListItemDragStart={onGalleryListItemDragStart}
        onDisplayModeChange={onGalleryDisplayModeChange}
        onScrollDirectionChange={onGalleryScrollDirectionChange}
      />
    );
  }

  // --- 图片（预览开启） ---
  if (showImagePreview && isImage) {
    // 单张图片
    return (
      <div className="clip-item-content-image-single">
        <div className="clip-item-content-image-display-wrap">
          <ImageDisplay
            item={item}
            darkMode={darkMode}
            centered
            showLinkInfo={false}
            disableLazyLoad
            onClick={(text) => setPreviewImageUrl(text)}
          />
        </div>
        {imageType !== ImageType.Base64 && (
          <div
            className="clip-item-content-image-link"
            data-theme={darkMode ? 'dark' : 'light'}
            data-open-state={urlOpenState}
          >
            {imageType === ImageType.HttpUrl ? (
              <Globe className="clip-item-content-icon-12" />
            ) : (
              <HardDrive className="clip-item-content-icon-12" />
            )}
            <span
              className="clip-item-content-image-link-text"
              title={(imageType === ImageType.HttpUrl ? "链接: " : "文件: ") + item.text + "\n" + openStatusTitle}
              onDoubleClick={handleUrlDoubleClick}
            >
              {item.text}
            </span>
            <span className="clip-item-content-link-status" data-state={urlOpenState} aria-hidden="true">
              {urlOpenState === 'opening' ? (
                <Loader2 className="clip-item-content-icon-12 clip-item-content-link-status-spin" />
              ) : urlOpenState === 'success' ? (
                <CircleCheck className="clip-item-content-icon-12" />
              ) : urlOpenState === 'error' ? (
                <CircleAlert className="clip-item-content-icon-12" />
              ) : (
                <ExternalLink className="clip-item-content-icon-12 clip-item-content-link-fade" />
              )}
            </span>
          </div>
        )}
      </div>
    );
  }

  // --- 图片（无预览模式） ---
  if (isImage) {
    return (
      <p className="clip-item-content-text">
        <span
          className="clip-item-content-image-link"
          data-theme={darkMode ? 'dark' : 'light'}
          data-open-state={urlOpenState}
        >
          {imageType === ImageType.HttpUrl ? (
            <Globe className="clip-item-content-icon-14" />
          ) : imageType === ImageType.LocalFile ? (
            <HardDrive className="clip-item-content-icon-14" />
          ) : (
            <FileCode2 className="clip-item-content-icon-14" />
          )}
          {imageType === ImageType.Base64 ? (
            <span className="truncate">[Base64 \u56fe\u7247\u6570\u636e]</span>
          ) : (
            <span
              className="clip-item-content-image-link-text"
              title={(imageType === ImageType.HttpUrl ? "链接: " : "文件: ") + item.text + "\n" + openStatusTitle}
              onDoubleClick={handleUrlDoubleClick}
            >
              {item.text}
            </span>
          )}
          {imageType !== ImageType.Base64 && (
            <span className="clip-item-content-link-status" data-state={urlOpenState} aria-hidden="true">
              {urlOpenState === 'opening' ? (
                <Loader2 className="clip-item-content-icon-12 clip-item-content-link-status-spin" />
              ) : urlOpenState === 'success' ? (
                <CircleCheck className="clip-item-content-icon-12" />
              ) : urlOpenState === 'error' ? (
                <CircleAlert className="clip-item-content-icon-12" />
              ) : (
                <ExternalLink className="clip-item-content-icon-12 clip-item-content-link-fade" />
              )}
            </span>
          )}
        </span>
      </p>
    );
  }

  if (type === 'multi-image') {
    return (
      <p className="clip-item-content-text">
        {`[${imageUrls.length} 张图片]`}
      </p>
    );
  }

  // --- URL 链接 ---
  if (isUrl) {
    return (
      <p className="clip-item-content-text">
        <span
          className="clip-item-content-link"
          data-theme={darkMode ? 'dark' : 'light'}
          data-open-state={urlOpenState}
          title={"链接: " + trimmedText + "\n" + openStatusTitle}
          onDoubleClick={handleUrlDoubleClick}
        >
          <Globe className="clip-item-content-icon-14-shrink" />
          <span className="clip-item-content-link-text-wrap">
            <HighlightText text={trimmedText} highlight={searchQuery} darkMode={darkMode} />
          </span>
          <span className="clip-item-content-link-status" data-state={urlOpenState} aria-hidden="true">
            {urlOpenState === 'opening' ? (
              <Loader2 className="clip-item-content-icon-12 clip-item-content-link-status-spin" />
            ) : urlOpenState === 'success' ? (
              <CircleCheck className="clip-item-content-icon-12" />
            ) : urlOpenState === 'error' ? (
              <CircleAlert className="clip-item-content-icon-12" />
            ) : (
              <ExternalLink className="clip-item-content-icon-12 clip-item-content-link-fade" />
            )}
          </span>
        </span>
      </p>
    );
  }

  // --- 文本（含日期时间检测） ---
  if (hasDateTime) {
    return (
      <p className="clip-item-content-text clip-item-content-text-notruncate">
        <HighlightDateTimeText
          text={displayText}
          matches={dtMatches}
          searchQuery={searchQuery}
          isSelected={isSelected}
          darkMode={darkMode}
          copyText={copyText}
        />
      </p>
    );
  }

  // --- 普通文本 ---
  return (
    <p className="clip-item-content-text">
      <HighlightText text={displayText} highlight={searchQuery} darkMode={darkMode} />
    </p>
  );
});
