import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Images,
} from 'lucide-react';
import type { ClipItem, GalleryWheelMode, GalleryDisplayMode, GalleryScrollDirection } from '../../types';
import type { GalleryTheme } from './types';
import { resolveImageSrc } from '../../utils/imageUrl';
import { ImageDisplay } from '../ImageDisplay';
import { AnimatedCopyIcon } from './AnimatedCopyIcon';
import { ModeSegment } from './ModeSegment';
import { useWheelNavigation } from './hooks/useWheelNavigation';

// ============================================================================
// 类型
// ============================================================================

export interface GalleryCarouselProps {
  imageUrls: string[];
  baseItem: ClipItem;
  darkMode: boolean;
  theme: GalleryTheme;
  safeIndex: number;
  isFileGallery: boolean;
  copiedKey: string | null;
  scrollDirection: GalleryScrollDirection;
  wheelMode: GalleryWheelMode;
  displayMode: GalleryDisplayMode;
  onSelectIndex: (index: number) => void;
  onNavigate: (delta: number) => void;
  onImageClick?: (url: string) => void;
  onCopy?: (url: string) => void;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>, url: string) => void;
  onDisplayModeChange?: (mode: GalleryDisplayMode) => void;
  onScrollDirectionChange?: (dir: GalleryScrollDirection) => void;
}

// ============================================================================
// Carousel 轮播视图
// ============================================================================

export const GalleryCarousel = React.memo(function GalleryCarousel({
  imageUrls, baseItem, darkMode, theme, safeIndex, isFileGallery,
  copiedKey, scrollDirection, wheelMode, displayMode,
  onSelectIndex, onNavigate, onImageClick, onCopy, onDragStart,
  onDisplayModeChange, onScrollDirectionChange,
}: GalleryCarouselProps) {
  const [thumbExpanded, setThumbExpanded] = useState(false);
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const thumbTrackRef = useRef<HTMLDivElement | null>(null);
  /** 使用 Map 替代裸数组，自动清理已卸载元素 */
  const thumbnailRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const isVertical = scrollDirection === 'vertical';

  // ── 当前活动图片 ──
  const activeImageUrl = useMemo(
    () => imageUrls[safeIndex] ?? baseItem.text,
    [imageUrls, safeIndex, baseItem.text],
  );
  const activeImageItem = useMemo<ClipItem>(
    () => ({ ...baseItem, text: activeImageUrl }),
    [baseItem, activeImageUrl],
  );

  // ── 滚轮导航（抽至独立 hook） ──
  useWheelNavigation({
    enabled: true,
    elementRef: galleryRef,
    wheelMode,
    itemCount: imageUrls.length,
    onSwitch: onNavigate,
  });

  // ── 自动滚动缩略图到可见区域 ──
  useEffect(() => {
    if (!thumbExpanded) return;
    const thumb = thumbnailRefs.current.get(safeIndex);
    const track = thumbTrackRef.current;
    if (!thumb || !track) return;
    const targetLeft = thumb.offsetLeft - (track.clientWidth - thumb.clientWidth) / 2;
    track.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  }, [safeIndex, thumbExpanded]);

  // ── 事件处理 ──
  const handleCopy = useCallback(
    (e: React.MouseEvent) => { e.stopPropagation(); onCopy?.(activeImageUrl); },
    [onCopy, activeImageUrl],
  );

  const toggleDirection = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onScrollDirectionChange?.(scrollDirection === 'horizontal' ? 'vertical' : 'horizontal');
    },
    [scrollDirection, onScrollDirectionChange],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => { e.stopPropagation(); onDragStart?.(e, activeImageUrl); },
    [onDragStart, activeImageUrl],
  );

  const PrevIcon = isVertical ? ChevronUp : ChevronLeft;
  const NextIcon = isVertical ? ChevronDown : ChevronRight;

  return (
    <div
      ref={galleryRef}
      className={`img-gallery img-gallery--carousel ${isVertical ? 'img-gallery--vertical' : 'img-gallery--horizontal'}`}
      data-theme={theme}
      role="region"
      aria-roledescription="carousel"
      aria-label={`${imageUrls.length} 张图片轮播`}
    >
      {/* ── 顶栏 ── */}
      <div className="img-gallery__topbar" data-theme={theme}>
        <div className="img-gallery__topbar-info">
          {imageUrls.length > 1 && (
            <span className="img-gallery__meta-count" aria-live="polite">
              {safeIndex + 1}/{imageUrls.length}
            </span>
          )}
          <span className="img-gallery__footer-hint">
            {isFileGallery
              ? wheelMode === 'ctrl' ? '文件图片 · Ctrl+滚轮切换' : '文件图片 · 滚轮切换'
              : wheelMode === 'ctrl' ? 'Ctrl+滚轮切换' : '滚轮切换'}
          </span>
        </div>
        <div className="img-gallery__topbar-actions">
          {onCopy && imageUrls.length > 0 && (
            <button
              type="button"
              className="img-gallery__toolbar-btn"
              data-theme={theme}
              data-copied={copiedKey === activeImageUrl ? 'true' : 'false'}
              onClick={handleCopy}
              title="复制当前图片"
            >
              <AnimatedCopyIcon copied={copiedKey === activeImageUrl} />
            </button>
          )}
          {onScrollDirectionChange && (
            <button
              type="button"
              className="img-gallery__toolbar-btn"
              data-theme={theme}
              onClick={toggleDirection}
              title={isVertical ? '切换为水平滚动' : '切换为垂直滚动'}
            >
              {isVertical
                ? <ChevronLeft className="img-gallery__icon-12" />
                : <ChevronUp className="img-gallery__icon-12" />}
            </button>
          )}
          {onDisplayModeChange && (
            <ModeSegment current={displayMode} onChange={onDisplayModeChange} theme={theme} />
          )}
        </div>
      </div>

      {/* ── 主舞台 ── */}
      <div 
        className="img-gallery__carousel-stage" 
        data-theme={theme}
        role="group"
        aria-roledescription="slide"
        aria-labelledby={`gallery-thumb-${safeIndex}`}
      >
        <div id="gallery-main-image" className="img-gallery__main-image" draggable onDragStart={handleDragStart}>
          <ImageDisplay
            item={activeImageItem}
            darkMode={darkMode}
            centered
            showLinkInfo={false}
            disableLazyLoad
            onClick={(text) => onImageClick?.(text)}
          />
        </div>

        {imageUrls.length > 1 && (
          <>
            {/* Overlay 上一张 */}
            <button
              type="button"
              className={`img-gallery__overlay-nav img-gallery__overlay-nav--prev ${isVertical ? 'img-gallery__overlay-nav--vertical' : ''}`}
              data-theme={theme}
              onClick={(e) => { e.stopPropagation(); onNavigate(-1); }}
              aria-label="上一张"
              aria-controls="gallery-main-image"
            >
              <PrevIcon className="img-gallery__icon-14" />
            </button>

            {/* Overlay 下一张 */}
            <button
              type="button"
              className={`img-gallery__overlay-nav img-gallery__overlay-nav--next ${isVertical ? 'img-gallery__overlay-nav--vertical' : ''}`}
              data-theme={theme}
              onClick={(e) => { e.stopPropagation(); onNavigate(1); }}
              aria-label="下一张"
              aria-controls="gallery-main-image"
            >
              <NextIcon className="img-gallery__icon-14" />
            </button>

            {/* 浮动计数胶囊 */}
            <button
              type="button"
              className="img-gallery__counter-pill"
              data-theme={theme}
              onClick={(e) => { e.stopPropagation(); setThumbExpanded((v) => !v); }}
              title={thumbExpanded ? '收起缩略图' : '展开缩略图'}
              aria-expanded={thumbExpanded}
              aria-controls="gallery-thumbnails"
            >
              <Images className="img-gallery__icon-12" />
              <span>{safeIndex + 1}/{imageUrls.length}</span>
            </button>
          </>
        )}
      </div>

      {/* ── 缩略图条 ── */}
      {thumbExpanded && imageUrls.length > 1 && (
        <div id="gallery-thumbnails" ref={thumbTrackRef} className="img-gallery__thumb-track custom-scrollbar" role="tablist" aria-label="缩略图">
          {imageUrls.map((url, i) => (
            <button
              key={`${url}-${i}`}
              id={`gallery-thumb-${i}`}
              type="button"
              role="tab"
              ref={(el) => {
                if (el) thumbnailRefs.current.set(i, el);
                else thumbnailRefs.current.delete(i);
              }}
              className="img-gallery__thumb"
              data-active={i === safeIndex ? 'true' : 'false'}
              data-theme={theme}
              aria-selected={i === safeIndex}
              aria-label={`第 ${i + 1} 张`}
              onClick={(e) => { e.stopPropagation(); onSelectIndex(i); }}
              onDoubleClick={(e) => { e.stopPropagation(); onImageClick?.(url); }}
              title={`第 ${i + 1} 张`}
            >
              <img src={resolveImageSrc(url)} alt={`${i + 1}`} className="img-gallery__thumb-img" loading="lazy" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
