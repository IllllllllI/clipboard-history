import React, { useMemo, useCallback } from 'react';
import { Images } from 'lucide-react';
import type { GalleryDisplayMode } from '../../types';
import type { GalleryTheme } from './types';
import { resolveImageSrc } from '../../utils/imageUrl';
import { AnimatedCopyIcon } from './AnimatedCopyIcon';
import { ModeSegment } from './ModeSegment';

// ============================================================================
// 常量
// ============================================================================

const MAX_VISIBLE = 4;

// ============================================================================
// Grid Cell（单元格）
// ============================================================================

interface GridCellProps {
  url: string;
  src: string;
  index: number;
  overflowCount: number;
  isOverflowCell: boolean;
  theme: GalleryTheme;
  copied: boolean;
  hasCopy: boolean;
  onCellClick: (url: string, index: number) => void;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>, url: string) => void;
  onCopy: (url: string) => void;
}

const GridCell = React.memo(function GridCell({
  url, src, index, overflowCount, isOverflowCell,
  theme, copied, hasCopy, onCellClick, onDragStart, onCopy,
}: GridCellProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => { e.stopPropagation(); onCellClick(url, index); },
    [url, index, onCellClick],
  );
  const handleDrag = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => { e.stopPropagation(); onDragStart?.(e, url); },
    [url, onDragStart],
  );
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      onCellClick(url, index);
    },
    [url, index, onCellClick],
  );
  const handleCopy = useCallback(
    (e: React.MouseEvent) => { e.stopPropagation(); onCopy(url); },
    [url, onCopy],
  );

  return (
    <div
      className="img-gallery__grid-cell"
      data-theme={theme}
      role="button"
      tabIndex={0}
      draggable
      onClick={handleClick}
      onDragStart={handleDrag}
      onKeyDown={handleKeyDown}
      title={`第 ${index + 1} 张`}
    >
      <img src={src} alt={`第 ${index + 1} 张`} className="img-gallery__grid-cell-img" loading="lazy" draggable={false} />

      {hasCopy && (
        <button
          type="button"
          className="img-gallery__grid-copy-fab"
          data-theme={theme}
          data-copied={copied ? 'true' : 'false'}
          title="复制此图"
          onClick={handleCopy}
        >
          <AnimatedCopyIcon copied={copied} />
        </button>
      )}

      {isOverflowCell && (
        <div className="img-gallery__grid-overflow" aria-label={`还有 ${overflowCount} 张`}>
          <span>+{overflowCount}</span>
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Gallery Grid（宫格视图）
// ============================================================================

export interface GalleryGridProps {
  imageUrls: string[];
  theme: GalleryTheme;
  isFileGallery: boolean;
  copiedKey: string | null;
  onImageClick?: (url: string) => void;
  onCopy?: (url: string) => void;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>, url: string) => void;
  onSelectIndex: (index: number) => void;
  displayMode: GalleryDisplayMode;
  onDisplayModeChange?: (mode: GalleryDisplayMode) => void;
}

export const GalleryGrid = React.memo(function GalleryGrid({
  imageUrls, theme, isFileGallery, copiedKey,
  onImageClick, onCopy, onDragStart,
  onSelectIndex, displayMode, onDisplayModeChange,
}: GalleryGridProps) {
  const visibleUrls = useMemo(() => imageUrls.slice(0, MAX_VISIBLE), [imageUrls]);
  const overflowCount = Math.max(0, imageUrls.length - MAX_VISIBLE);

  /** 预解析可见缩略图 src，避免渲染循环内重复调用 */
  const resolvedSrcs = useMemo(() => visibleUrls.map(resolveImageSrc), [visibleUrls]);

  const cols = visibleUrls.length <= 1 ? 1 : 2;

  const handleCellClick = useCallback(
    (url: string, index: number) => { onSelectIndex(index); onImageClick?.(url); },
    [onSelectIndex, onImageClick],
  );

  const handleCopy = useCallback(
    (url: string) => { onCopy?.(url); },
    [onCopy],
  );

  return (
    <div className="img-gallery img-gallery--grid" data-theme={theme} role="group" aria-label={`${imageUrls.length} 张图片宫格`}>
      {/* 顶栏 */}
      <div className="img-gallery__topbar" data-theme={theme}>
        <div className="img-gallery__topbar-info">
          <Images className="img-gallery__icon-12" />
          <span className="img-gallery__meta-count">
            {imageUrls.length} 张{isFileGallery ? '文件图片' : '图片'}
          </span>
        </div>
        <div className="img-gallery__topbar-actions">
          {onDisplayModeChange && (
            <ModeSegment current={displayMode} onChange={onDisplayModeChange} theme={theme} />
          )}
        </div>
      </div>

      {/* 宫格 */}
      <div className="img-gallery__grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {visibleUrls.map((url, i) => (
          <GridCell
            key={`${url}-${i}`}
            url={url}
            src={resolvedSrcs[i]}
            index={i}
            overflowCount={overflowCount}
            isOverflowCell={overflowCount > 0 && i === visibleUrls.length - 1}
            theme={theme}
            copied={copiedKey === url}
            hasCopy={!!onCopy}
            onCellClick={handleCellClick}
            onDragStart={onDragStart}
            onCopy={handleCopy}
          />
        ))}
      </div>
    </div>
  );
});
