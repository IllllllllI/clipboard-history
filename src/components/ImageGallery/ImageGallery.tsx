/**
 * ImageGallery — 独立的多图相册组件
 *
 * 支持三种显示模式：
 * - grid（宫格）：根据图片数量自适应 2×1 / 2×2 / 2×3 网格，一眼总览
 * - carousel（轮播）：主图 + overlay 箭头 + 浮动计数胶囊 + 可折叠缩略图条
 * - list（列表）：竖向排列所有图片行，hover 放大预览 + 交替底色 + 元信息
 *
 * 鼠标滚轮 / 触控板均可在 carousel 模式下切换图片。
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Images, LayoutGrid, Rows3, Copy, Check,
} from 'lucide-react';
import { ClipItem, GalleryWheelMode } from '../../types';
import { resolveImageSrc } from '../../utils/imageUrl';
import { ImageDisplay } from '../ImageDisplay';
import { COPY_FEEDBACK_DURATION_MS } from '../../constants';
import './image-gallery.css';

// ============================================================================
// 类型
// ============================================================================

export type GalleryDisplayMode = 'grid' | 'carousel' | 'list';
export type GalleryScrollDirection = 'horizontal' | 'vertical';

export interface ImageGalleryProps {
  /** 图片 URL / 路径列表 */
  imageUrls: string[];
  /** 基础 ClipItem（用于构造 ImageDisplay 需要的 item） */
  baseItem: ClipItem;
  /** 暗色模式 */
  darkMode: boolean;
  /** 点击图片回调（通常打开大图预览） */
  onImageClick?: (url: string) => void;
  /** 复制当前图片回调（通常用于单图复制） */
  onCopyImage?: (url: string) => void;
  /** 列表模式下点击条目回调（通常复制当前条目） */
  onListItemClick?: (url: string) => void;
  /** 显示模式 */
  displayMode?: GalleryDisplayMode;
  /** 滚动方向（仅 carousel 生效） */
  scrollDirection?: GalleryScrollDirection;
  /** 滚轮触发模式（carousel 生效） */
  wheelMode?: GalleryWheelMode;
  /** 列表模式最大显示条目数（超出后可展开） */
  listMaxVisibleItems?: number;
  /** 是否为文件图片（影响底部提示文案） */
  isFileGallery?: boolean;
  /** 可选：模式切换回调（让父级保存设置） */
  onDisplayModeChange?: (mode: GalleryDisplayMode) => void;
  /** 可选：方向切换回调 */
  onScrollDirectionChange?: (dir: GalleryScrollDirection) => void;
}

// ============================================================================
// 常量
// ============================================================================

const WHEEL_THROTTLE_MS = 140;
const WHEEL_MIN_DELTA = 12;

/** 模式定义：用于分段控件 */
const MODE_OPTIONS: { value: GalleryDisplayMode; icon: typeof LayoutGrid; title: string }[] = [
  { value: 'grid', icon: LayoutGrid, title: '宫格' },
  { value: 'carousel', icon: Images, title: '轮播' },
  { value: 'list', icon: Rows3, title: '列表' },
];

// ============================================================================
// 分段切换控件
// ============================================================================

interface ModeSegmentProps {
  current: GalleryDisplayMode;
  onChange: (mode: GalleryDisplayMode) => void;
  theme: string;
}

const ModeSegment = React.memo(function ModeSegment({ current, onChange, theme }: ModeSegmentProps) {
  return (
    <div className="img-gallery__segment" data-theme={theme}>
      {MODE_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = opt.value === current;
        return (
          <button
            key={opt.value}
            type="button"
            className="img-gallery__segment-btn"
            data-active={active ? 'true' : 'false'}
            data-theme={theme}
            onClick={(e) => { e.stopPropagation(); onChange(opt.value); }}
            title={opt.title}
          >
            <Icon className="img-gallery__icon-12" />
          </button>
        );
      })}
    </div>
  );
});

// ============================================================================
// Grid 宫格子组件
// ============================================================================

interface GridCellProps {
  url: string;
  index: number;
  overflowCount: number;
  isOverflowCell: boolean;
  theme: string;
  onClick: (url: string) => void;
  onCopy?: (url: string) => void;
  copied: boolean;
}

const GridCell = React.memo(function GridCell({ url, index, overflowCount, isOverflowCell, theme, onClick, onCopy, copied }: GridCellProps) {
  const src = resolveImageSrc(url);

  return (
    <div
      className="img-gallery__grid-cell"
      data-theme={theme}
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onClick(url); }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        onClick(url);
      }}
      title={`第 ${index + 1} 张`}
    >
      <img src={src} alt={`${index + 1}`} className="img-gallery__grid-cell-img" draggable={false} />
      {onCopy && (
        <button
          type="button"
          className="img-gallery__grid-copy-fab"
          data-theme={theme}
          data-copied={copied ? 'true' : 'false'}
          title="复制此图"
          onClick={(e) => {
            e.stopPropagation();
            onCopy(url);
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.div
                key="copied"
                initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              >
                <Check className="img-gallery__icon-12 img-gallery__copy-icon-ok" />
              </motion.div>
            ) : (
              <motion.div
                key="copy"
                initial={{ opacity: 0, scale: 0.5, rotate: 45 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              >
                <Copy className="img-gallery__icon-12" />
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      )}
      {isOverflowCell && (
        <div className="img-gallery__grid-overflow">
          <span>+{overflowCount}</span>
        </div>
      )}
    </div>
  );
});

// ============================================================================
// 主组件
// ============================================================================

export const ImageGallery = React.memo(function ImageGallery({
  imageUrls,
  baseItem,
  darkMode,
  onImageClick,
  onCopyImage,
  onListItemClick,
  displayMode = 'carousel',
  scrollDirection = 'horizontal',
  wheelMode = 'ctrl',
  listMaxVisibleItems = 6,
  isFileGallery = false,
  onDisplayModeChange,
  onScrollDirectionChange,
}: ImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [thumbExpanded, setThumbExpanded] = useState(false);
  const [listExpanded, setListExpanded] = useState(false);
  const [copiedImageUrl, setCopiedImageUrl] = useState<string | null>(null);
  const [copiedListIndex, setCopiedListIndex] = useState<number | null>(null);
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const thumbTrackRef = useRef<HTMLDivElement | null>(null);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const wheelTimestampRef = useRef(0);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listCopyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme = darkMode ? 'dark' : 'light';
  const isVertical = scrollDirection === 'vertical';
  const normalizedListMaxVisibleItems = useMemo(
    () => Math.min(30, Math.max(1, Math.trunc(listMaxVisibleItems))),
    [listMaxVisibleItems],
  );

  // ── 安全索引 ──
  const safeIndex = useMemo(() => {
    if (imageUrls.length === 0) return 0;
    return Math.min(activeIndex, imageUrls.length - 1);
  }, [activeIndex, imageUrls.length]);

  // ── 当前活动图片的虚拟 ClipItem ──
  const activeImageUrl = useMemo(
    () => imageUrls[safeIndex] ?? baseItem.text,
    [imageUrls, safeIndex, baseItem.text],
  );
  const activeImageItem = useMemo<ClipItem>(
    () => ({ ...baseItem, text: activeImageUrl }),
    [baseItem, activeImageUrl],
  );

  // ── item 变化时重置 ──
  useEffect(() => {
    setActiveIndex(0);
    setThumbExpanded(false);
    setListExpanded(false);
    setCopiedImageUrl(null);
    setCopiedListIndex(null);
  }, [baseItem.id, imageUrls.length]);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current) {
        clearTimeout(copyFeedbackTimerRef.current);
      }
      if (listCopyFeedbackTimerRef.current) {
        clearTimeout(listCopyFeedbackTimerRef.current);
      }
    };
  }, []);

  // ── 自动滚动缩略图到可见区域 ──
  useEffect(() => {
    if (!thumbExpanded) return;
    const thumb = thumbnailRefs.current[safeIndex];
    if (!thumb) return;
    const track = thumbTrackRef.current;
    if (!track) return;

    const targetLeft = thumb.offsetLeft - (track.clientWidth - thumb.clientWidth) / 2;
    track.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  }, [safeIndex, thumbExpanded]);

  // ── 切换图片 ──
  const switchBy = useCallback((delta: number) => {
    if (imageUrls.length <= 1) return;
    setActiveIndex((prev) => (prev + delta + imageUrls.length) % imageUrls.length);
  }, [imageUrls.length]);

  const triggerCopyImage = useCallback((url: string) => {
    if (!onCopyImage) return;
    onCopyImage(url);
    setCopiedImageUrl(url);
    if (copyFeedbackTimerRef.current) {
      clearTimeout(copyFeedbackTimerRef.current);
    }
    copyFeedbackTimerRef.current = setTimeout(() => {
      setCopiedImageUrl(null);
      copyFeedbackTimerRef.current = null;
    }, COPY_FEEDBACK_DURATION_MS);
  }, [onCopyImage]);

  const triggerListItemCopy = useCallback((index: number, url: string) => {
    onListItemClick?.(url);
    setCopiedListIndex(index);
    if (listCopyFeedbackTimerRef.current) {
      clearTimeout(listCopyFeedbackTimerRef.current);
    }
    listCopyFeedbackTimerRef.current = setTimeout(() => {
      setCopiedListIndex(null);
      listCopyFeedbackTimerRef.current = null;
    }, COPY_FEEDBACK_DURATION_MS);
  }, [onListItemClick]);

  // ── 滚轮切换 ──
  useEffect(() => {
    if (displayMode !== 'carousel') return;
    const element = galleryRef.current;
    if (!element) return;

    const handleNativeWheel = (event: WheelEvent) => {
      if (wheelMode === 'ctrl' && !event.ctrlKey) return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();

      const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX)
        ? event.deltaY : event.deltaX;
      if (Math.abs(delta) < WHEEL_MIN_DELTA) return;

      const now = Date.now();
      if (now - wheelTimestampRef.current < WHEEL_THROTTLE_MS) return;
      wheelTimestampRef.current = now;

      if (imageUrls.length > 1) switchBy(delta > 0 ? 1 : -1);
    };

    element.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleNativeWheel);
  }, [displayMode, isVertical, imageUrls.length, switchBy, wheelMode]);

  // ── 模式切换 ──
  const handleModeChange = useCallback((mode: GalleryDisplayMode) => {
    onDisplayModeChange?.(mode);
  }, [onDisplayModeChange]);

  const toggleDirection = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const next: GalleryScrollDirection = scrollDirection === 'horizontal' ? 'vertical' : 'horizontal';
    onScrollDirectionChange?.(next);
  }, [scrollDirection, onScrollDirectionChange]);

  const PrevIcon = isVertical ? ChevronUp : ChevronLeft;
  const NextIcon = isVertical ? ChevronDown : ChevronRight;

  // ============================
  // Grid 宫格模式
  // ============================
  if (displayMode === 'grid') {
    const maxVisible = 4;
    const visibleUrls = imageUrls.slice(0, maxVisible);
    const overflowCount = Math.max(0, imageUrls.length - maxVisible);
    const count = visibleUrls.length;

    // 紧凑宫格：单图 1 列，其余固定 2 列
    const cols = count <= 1 ? 1 : 2;

    return (
      <div className="img-gallery img-gallery--grid" data-theme={theme}>
        {/* 顶栏：信息 + 分段控件 */}
        <div className="img-gallery__topbar" data-theme={theme}>
          <div className="img-gallery__topbar-info">
            <Images className="img-gallery__icon-12" />
            <span className="img-gallery__meta-count">{imageUrls.length} 张{isFileGallery ? '文件图片' : '图片'}</span>
          </div>
          <div className="img-gallery__topbar-actions">
            {onDisplayModeChange && (
              <ModeSegment current={displayMode} onChange={handleModeChange} theme={theme} />
            )}
          </div>
        </div>

        {/* 宫格 */}
        <div
          className="img-gallery__grid"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {visibleUrls.map((url, i) => (
            <GridCell
              key={`${url}-${i}`}
              url={url}
              index={i}
              overflowCount={overflowCount}
              isOverflowCell={overflowCount > 0 && i === visibleUrls.length - 1}
              theme={theme}
              onClick={(u) => {
                setActiveIndex(i);
                onImageClick?.(u);
              }}
              onCopy={triggerCopyImage}
              copied={copiedImageUrl === url}
            />
          ))}
        </div>
      </div>
    );
  }

  // ============================
  // 列表模式
  // ============================
  if (displayMode === 'list') {
    const canToggleList = imageUrls.length > normalizedListMaxVisibleItems;
    const isListCollapsed = canToggleList && !listExpanded;
    const visibleListUrls = isListCollapsed
      ? imageUrls.slice(0, normalizedListMaxVisibleItems)
      : imageUrls;

    return (
      <div className="img-gallery img-gallery--list" data-theme={theme}>
        {/* 顶栏 */}
        <div className="img-gallery__topbar" data-theme={theme}>
          <div className="img-gallery__topbar-info">
            <Images className="img-gallery__icon-12" />
            <span className="img-gallery__meta-count">{imageUrls.length} 张{isFileGallery ? '文件图片' : '图片'}</span>
          </div>
          {onDisplayModeChange && (
            <ModeSegment current={displayMode} onChange={handleModeChange} theme={theme} />
          )}
        </div>

        {/* 列表 */}
        <div className="img-gallery__list-wrap custom-scrollbar">
          {visibleListUrls.map((url, i) => {
            const thumbSrc = resolveImageSrc(url);
            const fileName = url.split(/[\\/]/).pop() ?? url;
            return (
              <div
                key={`${url}-${i}`}
                className="img-gallery__list-row"
                data-theme={theme}
                data-even={i % 2 === 0 ? 'true' : 'false'}
                data-active={i === safeIndex ? 'true' : 'false'}
                data-copied={copiedListIndex === i ? 'true' : 'false'}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIndex(i);
                  triggerListItemCopy(i, url);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveIndex(i);
                  triggerListItemCopy(i, url);
                }}
                title={url}
              >
                <span className="img-gallery__list-row-index">{i + 1}</span>
                <button
                  type="button"
                  className="img-gallery__list-row-thumb-btn"
                  title="预览大图"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveIndex(i);
                    onImageClick?.(url);
                  }}
                >
                  <img
                    src={thumbSrc}
                    alt={`${i + 1}`}
                    className="img-gallery__list-row-thumb"
                    draggable={false}
                  />
                </button>
                <span className="img-gallery__list-row-name">{fileName}</span>
                <span className="img-gallery__list-row-copy-mark" data-visible={copiedListIndex === i ? 'true' : 'false'}>
                  <AnimatePresence mode="wait" initial={false}>
                    {copiedListIndex === i && (
                      <motion.div
                        key="copied"
                        initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      >
                        <Check className="img-gallery__icon-12 img-gallery__copy-icon-ok" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </span>
              </div>
            );
          })}
        </div>

        {canToggleList && (
          <div className="img-gallery__list-toggle-wrap">
            <button
              type="button"
              className="img-gallery__list-toggle-btn"
              data-theme={theme}
              aria-expanded={listExpanded ? 'true' : 'false'}
              onClick={(e) => {
                e.stopPropagation();
                setListExpanded((prev) => {
                  const next = !prev;
                  if (!next) {
                    setActiveIndex((current) => Math.min(current, normalizedListMaxVisibleItems - 1));
                  }
                  return next;
                });
              }}
            >
              {listExpanded
                ? '收起列表'
                : `展开剩余 ${imageUrls.length - normalizedListMaxVisibleItems} 项`}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ============================
  // 轮播模式（carousel）
  // ============================
  return (
    <div
      ref={galleryRef}
      className={`img-gallery img-gallery--carousel ${isVertical ? 'img-gallery--vertical' : 'img-gallery--horizontal'}`}
      data-theme={theme}
    >
      {/* 顶栏：分段控件 + 方向切换 */}
      <div className="img-gallery__topbar" data-theme={theme}>
        <div className="img-gallery__topbar-info">
          {imageUrls.length > 1 && (
            <span className="img-gallery__meta-count">{safeIndex + 1}/{imageUrls.length}</span>
          )}
          <span className="img-gallery__footer-hint">
            {isFileGallery
              ? wheelMode === 'ctrl' ? '文件图片 · Ctrl+滚轮切换' : '文件图片 · 滚轮切换'
              : wheelMode === 'ctrl' ? 'Ctrl+滚轮切换' : '滚轮切换'}
          </span>
        </div>
        <div className="img-gallery__topbar-actions">
          {onCopyImage && imageUrls.length > 0 && (
            <button
              type="button"
              className="img-gallery__toolbar-btn"
              data-theme={theme}
              data-copied={copiedImageUrl === activeImageUrl ? 'true' : 'false'}
              onClick={(e) => {
                e.stopPropagation();
                triggerCopyImage(activeImageUrl);
              }}
              title="复制当前图片"
            >
              <AnimatePresence mode="wait" initial={false}>
                {copiedImageUrl === activeImageUrl ? (
                  <motion.div
                    key="copied"
                    initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  >
                    <Check className="img-gallery__icon-12 img-gallery__copy-icon-ok" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="copy"
                    initial={{ opacity: 0, scale: 0.5, rotate: 45 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  >
                    <Copy className="img-gallery__icon-12" />
                  </motion.div>
                )}
              </AnimatePresence>
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
              {isVertical ? <ChevronLeft className="img-gallery__icon-12" /> : <ChevronUp className="img-gallery__icon-12" />}
            </button>
          )}
          {onDisplayModeChange && (
            <ModeSegment current={displayMode} onChange={handleModeChange} theme={theme} />
          )}
        </div>
      </div>

      {/* 主区域：overlay 箭头 + 主图 + 浮动计数 */}
      <div className="img-gallery__carousel-stage" data-theme={theme}>
        <div className="img-gallery__main-image">
          <ImageDisplay
            item={activeImageItem}
            darkMode={darkMode}
            centered
            showLinkInfo={false}
            disableLazyLoad
            onClick={(text) => onImageClick?.(text)}
          />
        </div>

        {/* Overlay 左/上箭头 */}
        {imageUrls.length > 1 && (
          <button
            type="button"
            className={`img-gallery__overlay-nav img-gallery__overlay-nav--prev ${isVertical ? 'img-gallery__overlay-nav--vertical' : ''}`}
            data-theme={theme}
            onClick={(e) => { e.stopPropagation(); switchBy(-1); }}
            aria-label="上一张"
          >
            <PrevIcon className="img-gallery__icon-14" />
          </button>
        )}

        {/* Overlay 右/下箭头 */}
        {imageUrls.length > 1 && (
          <button
            type="button"
            className={`img-gallery__overlay-nav img-gallery__overlay-nav--next ${isVertical ? 'img-gallery__overlay-nav--vertical' : ''}`}
            data-theme={theme}
            onClick={(e) => { e.stopPropagation(); switchBy(1); }}
            aria-label="下一张"
          >
            <NextIcon className="img-gallery__icon-14" />
          </button>
        )}

        {/* 浮动计数胶囊 */}
        {imageUrls.length > 1 && (
          <button
            type="button"
            className="img-gallery__counter-pill"
            data-theme={theme}
            onClick={(e) => { e.stopPropagation(); setThumbExpanded((v) => !v); }}
            title={thumbExpanded ? '收起缩略图' : '展开缩略图'}
          >
            <Images className="img-gallery__icon-12" />
            <span>{safeIndex + 1}/{imageUrls.length}</span>
          </button>
        )}
      </div>

      {/* 缩略图条（可折叠） */}
      {thumbExpanded && imageUrls.length > 1 && (
        <div ref={thumbTrackRef} className="img-gallery__thumb-track custom-scrollbar">
          {imageUrls.map((url, i) => {
            const thumbSrc = resolveImageSrc(url);
            return (
              <button
                key={`${url}-${i}`}
                type="button"
                ref={(el) => { thumbnailRefs.current[i] = el; }}
                className="img-gallery__thumb"
                data-active={i === safeIndex ? 'true' : 'false'}
                data-theme={theme}
                onClick={(e) => { e.stopPropagation(); setActiveIndex(i); }}
                onDoubleClick={(e) => { e.stopPropagation(); onImageClick?.(url); }}
                title={`第 ${i + 1} 张`}
              >
                <img src={thumbSrc} alt={`${i + 1}`} className="img-gallery__thumb-img" draggable={false} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
