import React, { useState, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Images, Check } from 'lucide-react';
import type { GalleryDisplayMode } from '../../types';
import type { GalleryTheme } from './types';
import { resolveImageSrc } from '../../utils/imageUrl';
import { ModeSegment } from './ModeSegment';

const SPRING = { type: 'spring' as const, stiffness: 500, damping: 30 };

// ============================================================================
// List Row（单行）
// ============================================================================

interface ListRowProps {
  url: string;
  src: string;
  index: number;
  theme: GalleryTheme;
  isActive: boolean;
  isCopied: boolean;
  isEven: boolean;
  onSelect: (index: number, url: string) => void;
  onPreview: (index: number, url: string) => void;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>, url: string) => void;
}

const ListRow = React.memo(function ListRow({
  url, src, index, theme, isActive, isCopied, isEven,
  onSelect, onPreview, onDragStart,
}: ListRowProps) {
  const fileName = useMemo(() => url.split(/[\\/]/).pop() ?? url, [url]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => { e.stopPropagation(); onSelect(index, url); },
    [index, url, onSelect],
  );
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      onSelect(index, url);
    },
    [index, url, onSelect],
  );
  const handlePreview = useCallback(
    (e: React.MouseEvent) => { e.stopPropagation(); onPreview(index, url); },
    [index, url, onPreview],
  );
  const handleDrag = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => { e.stopPropagation(); onDragStart?.(e, url); },
    [url, onDragStart],
  );

  return (
    <div
      className="img-gallery__list-row"
      data-theme={theme}
      data-even={isEven ? 'true' : 'false'}
      data-active={isActive ? 'true' : 'false'}
      data-copied={isCopied ? 'true' : 'false'}
      role="button"
      tabIndex={0}
      draggable
      onClick={handleClick}
      onDragStart={handleDrag}
      onKeyDown={handleKeyDown}
      title={url}
    >
      <span className="img-gallery__list-row-index">{index + 1}</span>
      <button
        type="button"
        className="img-gallery__list-row-thumb-btn"
        title="预览大图"
        onClick={handlePreview}
      >
        <img src={src} alt={`${index + 1}`} className="img-gallery__list-row-thumb" loading="lazy" draggable={false} />
      </button>
      <span className="img-gallery__list-row-name">{fileName}</span>
      <span className="img-gallery__list-row-copy-mark" data-visible={isCopied ? 'true' : 'false'}>
        <AnimatePresence mode="wait" initial={false}>
          {isCopied && (
            <motion.div
              key="copied"
              initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={SPRING}
            >
              <Check className="img-gallery__icon-12 img-gallery__copy-icon-ok" />
            </motion.div>
          )}
        </AnimatePresence>
      </span>
    </div>
  );
});

// ============================================================================
// Gallery List（列表视图）
// ============================================================================

export interface GalleryListProps {
  imageUrls: string[];
  theme: GalleryTheme;
  isFileGallery: boolean;
  safeIndex: number;
  copiedListIndex: number | null;
  listMaxVisibleItems: number;
  onSelectAndCopy: (index: number, url: string) => void;
  onPreview: (index: number, url: string) => void;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>, url: string) => void;
  /** 收起列表时通知父级钳位 activeIndex */
  onClampIndex?: (maxIndex: number) => void;
  displayMode: GalleryDisplayMode;
  onDisplayModeChange?: (mode: GalleryDisplayMode) => void;
}

export const GalleryList = React.memo(function GalleryList({
  imageUrls, theme, isFileGallery, safeIndex, copiedListIndex,
  listMaxVisibleItems, onSelectAndCopy, onPreview, onDragStart,
  onClampIndex, displayMode, onDisplayModeChange,
}: GalleryListProps) {
  const [listExpanded, setListExpanded] = useState(false);

  const normalizedMax = useMemo(
    () => Math.min(30, Math.max(1, Math.trunc(listMaxVisibleItems))),
    [listMaxVisibleItems],
  );

  const canToggleList = imageUrls.length > normalizedMax;
  const isCollapsed = canToggleList && !listExpanded;
  const visibleUrls = isCollapsed ? imageUrls.slice(0, normalizedMax) : imageUrls;

  /** 预解析可见缩略图 src */
  const resolvedSrcs = useMemo(() => visibleUrls.map(resolveImageSrc), [visibleUrls]);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (listExpanded) {
        // 收起时钳位 activeIndex 至可见范围
        onClampIndex?.(normalizedMax - 1);
        setListExpanded(false);
      } else {
        setListExpanded(true);
      }
    },
    [listExpanded, normalizedMax, onClampIndex],
  );

  return (
    <div className="img-gallery img-gallery--list" data-theme={theme}>
      {/* 顶栏 */}
      <div className="img-gallery__topbar" data-theme={theme}>
        <div className="img-gallery__topbar-info">
          <Images className="img-gallery__icon-12" />
          <span className="img-gallery__meta-count">
            {imageUrls.length} 张{isFileGallery ? '文件图片' : '图片'}
          </span>
        </div>
        {onDisplayModeChange && (
          <ModeSegment current={displayMode} onChange={onDisplayModeChange} theme={theme} />
        )}
      </div>

      {/* 列表 */}
      <div className="img-gallery__list-wrap custom-scrollbar">
        {visibleUrls.map((url, i) => (
          <ListRow
            key={`${url}-${i}`}
            url={url}
            src={resolvedSrcs[i]}
            index={i}
            theme={theme}
            isActive={i === safeIndex}
            isCopied={copiedListIndex === i}
            isEven={i % 2 === 0}
            onSelect={onSelectAndCopy}
            onPreview={onPreview}
            onDragStart={onDragStart}
          />
        ))}
      </div>

      {/* 展开/收起 */}
      {canToggleList && (
        <div className="img-gallery__list-toggle-wrap">
          <button
            type="button"
            className="img-gallery__list-toggle-btn"
            data-theme={theme}
            aria-expanded={listExpanded ? 'true' : 'false'}
            onClick={handleToggle}
          >
            {listExpanded
              ? '收起列表'
              : `展开剩余 ${imageUrls.length - normalizedMax} 项`}
          </button>
        </div>
      )}
    </div>
  );
});
