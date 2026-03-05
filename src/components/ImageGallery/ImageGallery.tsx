/**
 * ImageGallery — 独立的多图相册组件
 *
 * 支持三种显示模式：
 * - grid（宫格）：根据图片数量自适应 2×1 / 2×2 网格，一眼总览
 * - carousel（轮播）：主图 + overlay 箭头 + 浮动计数胶囊 + 可折叠缩略图条
 * - list（列表）：竖向排列所有图片行，hover 放大预览 + 交替底色 + 元信息
 *
 * 架构：
 * - 本文件为瘦编排器，管理 activeIndex 与 copy-feedback 状态
 * - 三种模式分别由 GalleryGrid / GalleryCarousel / GalleryList 子组件实现
 * - 共享逻辑抽至 hooks/（useCopyFeedback、useWheelNavigation）
 * - 共享 UI 抽至 AnimatedCopyIcon、ModeSegment
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { ClipItem, GalleryWheelMode, GalleryDisplayMode, GalleryScrollDirection } from '../../types';
import { COPY_FEEDBACK_DURATION_MS } from '../../constants';
import { useCopyFeedback } from './hooks/useCopyFeedback';
import { GalleryGrid } from './GalleryGrid';
import { GalleryCarousel } from './GalleryCarousel';
import { GalleryList } from './GalleryList';
import type { GalleryTheme } from './types';
import './styles/image-gallery.css';

// 向后兼容的类型重导出
export type { GalleryDisplayMode, GalleryScrollDirection };
export type { GalleryTheme };

// ============================================================================
// Props
// ============================================================================

export interface ImageGalleryProps {
  /** 图片 URL / 路径列表 */
  imageUrls: string[];
  /** 基础 ClipItem（用于构造 ImageDisplay 需要的 item） */
  baseItem: ClipItem;
  /** 暗色模式 */
  darkMode: boolean;
  /** 点击图片回调（通常打开大图预览） */
  onImageClick?: (url: string) => void;
  /** 复制当前图片回调 */
  onCopyImage?: (url: string) => void;
  /** 列表模式下点击条目回调（通常复制当前条目） */
  onListItemClick?: (url: string) => void;
  /** 列表模式下拖拽单条目回调 */
  onListItemDragStart?: (e: React.DragEvent<HTMLDivElement>, url: string) => void;
  /** 显示模式 */
  displayMode?: GalleryDisplayMode;
  /** 滚动方向（仅 carousel 生效） */
  scrollDirection?: GalleryScrollDirection;
  /** 滚轮触发模式（carousel 生效） */
  wheelMode?: GalleryWheelMode;
  /** 列表模式最大显示条目数（超出后可展开） */
  listMaxVisibleItems?: number;
  /** 是否为文件图片（影响提示文案） */
  isFileGallery?: boolean;
  /** 模式切换回调（让父级保存设置） */
  onDisplayModeChange?: (mode: GalleryDisplayMode) => void;
  /** 方向切换回调 */
  onScrollDirectionChange?: (dir: GalleryScrollDirection) => void;
}

// ============================================================================
// 编排器
// ============================================================================

export const ImageGallery = React.memo(function ImageGallery({
  imageUrls,
  baseItem,
  darkMode,
  onImageClick,
  onCopyImage,
  onListItemClick,
  onListItemDragStart,
  displayMode = 'carousel',
  scrollDirection = 'horizontal',
  wheelMode = 'ctrl',
  listMaxVisibleItems = 6,
  isFileGallery = false,
  onDisplayModeChange,
  onScrollDirectionChange,
}: ImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const theme: GalleryTheme = darkMode ? 'dark' : 'light';

  // ── 泛型 copy-feedback hook（替代重复的 timer 逻辑） ──
  const imageCopy = useCopyFeedback<string>(COPY_FEEDBACK_DURATION_MS);
  const listCopy = useCopyFeedback<number>(COPY_FEEDBACK_DURATION_MS);

  // ── 安全索引 ──
  const safeIndex = useMemo(() => {
    if (imageUrls.length === 0) return 0;
    return Math.min(activeIndex, imageUrls.length - 1);
  }, [activeIndex, imageUrls.length]);

  // ── item 变化时重置所有状态 ──
  useEffect(() => {
    setActiveIndex(0);
    imageCopy.reset();
    listCopy.reset();
  }, [baseItem.id, imageUrls.length, imageCopy.reset, listCopy.reset]);

  // ── 共享回调 ──
  const handleSelectIndex = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  const handleNavigate = useCallback((delta: number) => {
    setActiveIndex((prev) => {
      const len = imageUrls.length;
      if (len <= 1) return prev;
      return (prev + delta + len) % len;
    });
  }, [imageUrls.length]);

  /** Grid / Carousel 的合并复制回调：外部 callback + 内部反馈 */
  const handleTriggerImageCopy = useCallback((url: string) => {
    onCopyImage?.(url);
    imageCopy.trigger(url);
  }, [onCopyImage, imageCopy.trigger]);

  /** List 的选中 + 复制回调 */
  const handleListSelectAndCopy = useCallback((index: number, url: string) => {
    setActiveIndex(index);
    onListItemClick?.(url);
    listCopy.trigger(index);
  }, [onListItemClick, listCopy.trigger]);

  /** List 缩略图预览回调 */
  const handleListPreview = useCallback((index: number, url: string) => {
    setActiveIndex(index);
    onImageClick?.(url);
  }, [onImageClick]);

  /** List 收起时钳位 activeIndex */
  const handleClampIndex = useCallback((maxIndex: number) => {
    setActiveIndex((prev) => Math.min(prev, maxIndex));
  }, []);

  // ── 条件渲染活动模式 ──

  if (displayMode === 'grid') {
    return (
      <GalleryGrid
        key={baseItem.id}
        imageUrls={imageUrls}
        theme={theme}
        isFileGallery={isFileGallery}
        copiedKey={imageCopy.copiedKey}
        onImageClick={onImageClick}
        onCopy={onCopyImage ? handleTriggerImageCopy : undefined}
        onDragStart={onListItemDragStart}
        onSelectIndex={handleSelectIndex}
        displayMode={displayMode}
        onDisplayModeChange={onDisplayModeChange}
      />
    );
  }

  if (displayMode === 'list') {
    return (
      <GalleryList
        key={baseItem.id}
        imageUrls={imageUrls}
        theme={theme}
        isFileGallery={isFileGallery}
        safeIndex={safeIndex}
        copiedListIndex={listCopy.copiedKey}
        listMaxVisibleItems={listMaxVisibleItems}
        onSelectAndCopy={handleListSelectAndCopy}
        onPreview={handleListPreview}
        onDragStart={onListItemDragStart}
        onClampIndex={handleClampIndex}
        displayMode={displayMode}
        onDisplayModeChange={onDisplayModeChange}
      />
    );
  }

  // Carousel（默认）
  return (
    <GalleryCarousel
      key={baseItem.id}
      imageUrls={imageUrls}
      baseItem={baseItem}
      darkMode={darkMode}
      theme={theme}
      safeIndex={safeIndex}
      isFileGallery={isFileGallery}
      copiedKey={imageCopy.copiedKey}
      scrollDirection={scrollDirection}
      wheelMode={wheelMode}
      displayMode={displayMode}
      onSelectIndex={handleSelectIndex}
      onNavigate={handleNavigate}
      onImageClick={onImageClick}
      onCopy={onCopyImage ? handleTriggerImageCopy : undefined}
      onDragStart={onListItemDragStart}
      onDisplayModeChange={onDisplayModeChange}
      onScrollDirectionChange={onScrollDirectionChange}
    />
  );
});
