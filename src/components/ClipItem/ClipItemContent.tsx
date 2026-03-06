import React, { useMemo } from 'react';
import { Globe, HardDrive, FileCode2 } from 'lucide-react';
import { ClipItem, ImageType, GalleryDisplayMode, GalleryScrollDirection, GalleryWheelMode } from '../../types';
import { decodeFileList, detectImageType, findDateTimesInText } from '../../utils';
import type { DateTimeMatch } from '../../utils';
import { ImageDisplay } from '../ImageDisplay';
import { FileListDisplay } from '../FileListDisplay';
import { ImageGallery } from '../ImageGallery';
import { ImagePreview } from './display/ImagePreview';
import { HighlightText } from './display/HighlightText';
import { HighlightDateTimeText } from './display/HighlightDateTimeText';
import { ColorContentBlock } from './color/ColorContentBlock';
import { LinkOpenStatus } from './display/LinkOpenStatus';
import { useUrlOpenState, buildOpenTargetTitle } from './useUrlOpenState';
import './styles/clip-item-content.css';

/** 空匹配数组常量，避免非文本类型每次创建新引用 */
const EMPTY_DT_MATCHES: readonly DateTimeMatch[] = [];

// ============================================================================
// 配置对象接口 — 将相关 props 分组，减少扁平式参数穿透
// ============================================================================

export interface GalleryContentConfig {
  displayMode: GalleryDisplayMode;
  scrollDirection: GalleryScrollDirection;
  wheelMode: GalleryWheelMode;
  listMaxVisibleItems: number;
  onDisplayModeChange: (mode: GalleryDisplayMode) => void;
  onScrollDirectionChange: (dir: GalleryScrollDirection) => void;
  onListItemClick: (url: string) => void;
  onListItemDragStart: (e: React.DragEvent<HTMLDivElement>, url: string) => void;
  onCopyImage: (url: string) => void;
}

export interface FileListContentConfig {
  maxVisibleItems: number;
  onItemClick: (filePath: string) => void;
  onItemDragStart: (e: React.DragEvent<HTMLDivElement>, filePath: string) => void;
}

export interface ColorContentConfig {
  onUpdatePickedColor: (id: number, color: string | null) => Promise<void>;
  onCopyAsNewColor: (color: string) => Promise<void>;
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
  gallery: GalleryContentConfig;
  fileList: FileListContentConfig;
  color: ColorContentConfig;
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
  gallery,
  fileList,
  color,
  copyText,
}: ClipItemContentProps) {
  // --- URL 打开状态管理（提取至 hook） ---
  const trimmedText = useMemo(() => item.text.trim(), [item.text]);
  const { openPhase, statusLabel, handleDoubleClick: handleUrlDoubleClick } = useUrlOpenState(imageType, trimmedText);

  // --- 衍生状态 ---
  const displayText = useMemo(() => item.text.replace(/\n/g, ' ↵ '), [item.text]);
  // 性能: 仅对纯文本类型执行日期检测，图片/文件/URL/颜色跳过
  const isPlainTextType = type === 'text' || type === 'code';
  const dtMatches = useMemo(
    () => (isPlainTextType ? findDateTimesInText(displayText) : EMPTY_DT_MATCHES),
    [isPlainTextType, displayText],
  );
  const hasDateTime = dtMatches.length > 0;
  const isUrl = useMemo(() => /^https?:\/\/\S+$/i.test(trimmedText), [trimmedText]);
  const isRich = item.content_type === 'rich';
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

  const renderUrlOpenStatus = () => (
    <span className="clip-item-content-link-status" data-state={openPhase} aria-hidden="true">
      <LinkOpenStatus state={openPhase} />
    </span>
  );

  const imageOpenTitle = buildOpenTargetTitle(
    imageType === ImageType.HttpUrl ? '链接: ' : '文件: ',
    item.text,
    statusLabel,
  );
  const urlOpenTitle = buildOpenTargetTitle('链接: ', trimmedText, statusLabel);

  // --- 文件列表 ---
  if (type === 'files' && !showFilesAsGallery) {
    return (
      <FileListDisplay
        files={files}
        isSelected={isSelected}
        darkMode={darkMode}
        onItemCopy={fileList.onItemClick}
        onItemDragStart={fileList.onItemDragStart}
        maxVisibleItems={fileList.maxVisibleItems}
      />
    );
  }

  // --- 颜色值 ---
  if (type === 'color') {
    return (
      <ColorContentBlock
        item={item}
        darkMode={darkMode}
        onUpdatePickedColor={color.onUpdatePickedColor}
        onCopyAsNewColor={color.onCopyAsNewColor}
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
        displayMode={gallery.displayMode}
        scrollDirection={gallery.scrollDirection}
        wheelMode={gallery.wheelMode}
        listMaxVisibleItems={gallery.listMaxVisibleItems}
        isFileGallery={showFilesAsGallery}
        onCopyImage={gallery.onCopyImage}
        onListItemClick={gallery.onListItemClick}
        onListItemDragStart={gallery.onListItemDragStart}
        onDisplayModeChange={gallery.onDisplayModeChange}
        onScrollDirectionChange={gallery.onScrollDirectionChange}
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
            data-open-state={openPhase}
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
          data-open-state={openPhase}
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
          data-open-state={openPhase}
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
