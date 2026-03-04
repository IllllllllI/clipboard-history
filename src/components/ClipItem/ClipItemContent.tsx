import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { Globe, HardDrive, FileCode2, Images } from 'lucide-react';
import { ClipItem, ImageType, GalleryDisplayMode, GalleryScrollDirection, GalleryWheelMode } from '../../types';
import { decodeFileList, detectImageType, findDateTimesInText, normalizeFilePath } from '../../utils';
import { TauriService } from '../../services/tauri';
import { ImageDisplay } from '../ImageDisplay';
import { FileListDisplay } from '../FileListDisplay';
import { ImageGallery } from '../ImageGallery';
import { ImagePreview } from './ImagePreview';
import { HighlightText } from './HighlightText';
import { HighlightDateTimeText } from './DateTimeChip';
import { ColorContentBlock } from './ColorContentBlock';
import { LinkOpenStatus } from './LinkOpenStatus';
import './styles/clip-item-content.css';

const URL_OPENING_DELAY_MS = 180;
const URL_SUCCESS_RESET_DELAY_MS = 1000;
const URL_ERROR_RESET_DELAY_MS = 1400;

type UrlOpenState = 'idle' | 'opening' | 'success' | 'error';

function getUrlOpenStatusTitle(
  state: UrlOpenState,
  imageType: ImageType,
): string {
  if (state === 'opening') return '正在打开...';
  if (state === 'success') return '已打开';
  if (state === 'error') return '打开失败';
  return imageType === ImageType.LocalFile ? '双击打开文件' : '双击打开链接';
}

function buildOpenTargetTitle(prefix: string, value: string, statusTitle: string): string {
  return `${prefix}${value}\n${statusTitle}`;
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
  const [urlOpenState, setUrlOpenState] = useState<UrlOpenState>('idle');
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
      clearUrlStateTimers();
    };
  }, [clearUrlStateTimers]);

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
  const theme = darkMode ? 'dark' : 'light';

  const openUrlWithStatus = useCallback(async () => {
    const scheduleUrlStateReset = (state: UrlOpenState, delayMs: number) => {
      setUrlOpenState(state);
      urlStateResetTimerRef.current = setTimeout(() => {
        setUrlOpenState('idle');
        urlStateResetTimerRef.current = null;
      }, delayMs);
    };

    clearUrlStateTimers();
    urlOpeningDelayTimerRef.current = setTimeout(() => {
      setUrlOpenState('opening');
      urlOpeningDelayTimerRef.current = null;
    }, URL_OPENING_DELAY_MS);

    const value = trimmedText;

    try {
      if (imageType === ImageType.LocalFile) {
        await TauriService.openFile(normalizeFilePath(value));
      } else {
        await TauriService.openPath(value);
      }

      clearUrlStateTimers();
      scheduleUrlStateReset('success', URL_SUCCESS_RESET_DELAY_MS);
    } catch (error) {
      clearUrlStateTimers();
      scheduleUrlStateReset('error', URL_ERROR_RESET_DELAY_MS);
      console.warn('Open url failed:', value, error);
    }
  }, [clearUrlStateTimers, imageType, trimmedText]);

  const handleUrlDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void openUrlWithStatus();
  }, [openUrlWithStatus]);

  const openStatusTitle = getUrlOpenStatusTitle(urlOpenState, imageType);

  const renderUrlOpenStatus = useCallback(() => (
    <span className="clip-item-content-link-status" data-state={urlOpenState} aria-hidden="true">
      <LinkOpenStatus state={urlOpenState} />
    </span>
  ), [urlOpenState]);

  const imageOpenTitle = buildOpenTargetTitle(
    imageType === ImageType.HttpUrl ? '链接: ' : '文件: ',
    item.text,
    openStatusTitle,
  );
  const urlOpenTitle = buildOpenTargetTitle('链接: ', trimmedText, openStatusTitle);

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
    return (
      <ColorContentBlock
        item={item}
        darkMode={darkMode}
        onUpdatePickedColor={onUpdatePickedColor}
        onCopyAsNewColor={onCopyAsNewColor}
        copyText={copyText}
      />
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
            data-theme={theme}
            data-open-state={urlOpenState}
          >
            {imageType === ImageType.HttpUrl ? (
              <Globe className="clip-item-content-icon-12" />
            ) : (
              <HardDrive className="clip-item-content-icon-12" />
            )}
            <span
              className="clip-item-content-image-link-text"
              title={imageOpenTitle}
              onDoubleClick={handleUrlDoubleClick}
            >
              {item.text}
            </span>
            {renderUrlOpenStatus()}
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
          data-theme={theme}
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
              title={imageOpenTitle}
              onDoubleClick={handleUrlDoubleClick}
            >
              {item.text}
            </span>
          )}
          {imageType !== ImageType.Base64 && (
            renderUrlOpenStatus()
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
          data-theme={theme}
          data-open-state={urlOpenState}
          title={urlOpenTitle}
          onDoubleClick={handleUrlDoubleClick}
        >
          <Globe className="clip-item-content-icon-14-shrink" />
          <span className="clip-item-content-link-text-wrap">
            <HighlightText text={trimmedText} highlight={searchQuery} darkMode={darkMode} />
          </span>
          {renderUrlOpenStatus()}
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
