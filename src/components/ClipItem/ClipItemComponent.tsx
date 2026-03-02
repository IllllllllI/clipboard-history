import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Tag as TagIcon } from 'lucide-react';
import { ClipItem, ImageType, GalleryDisplayMode, GalleryScrollDirection } from '../../types';
import { formatDate, detectType, detectImageType, isFileList, decodeFileList } from '../../utils';
import { hexToRgba } from '../../utils/color';
import { ClipboardDB } from '../../services/db';
import { useAppContext } from '../../contexts/AppContext';
import {
  TAG_LIST_ANIMATION_DURATION_MS,
  TAG_LIST_ANIMATION_EASING,
  TAG_LIST_MARGIN_TOP_PX,
  TAG_LIST_OPACITY_DURATION_MS,
  TAG_PILL_SPRING_DAMPING,
  TAG_PILL_SPRING_STIFFNESS,
} from '../ClipListParts/constants';
import { getItemIcon } from './constants';
import { ClipItemContent } from './ClipItemContent';
import { ActionButtons } from './ActionButtons';
import './styles/clip-item.css';

interface ClipItemProps {
  item: ClipItem;
  index: number;
}

/**
 * 剪贴板历史条目组件
 *
 * 职责：布局骨架 + 选中/拖拽/交互事件。
 * 实际内容渲染委托给 ClipItemContent，操作按钮委托给 ActionButtons。
 */
export const ClipItemComponent = React.memo(
  function ClipItemComponent({ item, index }: ClipItemProps) {
    const {
      selectedIndex,
      settings,
      updateSettings,
      searchQuery,
      copiedId,
      loadHistory,
      setSelectedIndex,
      handleDoubleClick,
      handleDragStart,
      handleDragEnd,
      handleTogglePin,
      handleToggleFavorite,
      copyToClipboard,
      copyText,
      handleRemove,
      handleUpdatePickedColor,
      setPreviewImageUrl,
      setEditingClip,
      tags,
      handleAddTagToItem,
      handleRemoveTagFromItem,
    } = useAppContext();

    const isSelected = selectedIndex === index;
    const [suppressActiveFeedback, setSuppressActiveFeedback] = useState(false);

    // --- 衍生状态 ---
    const type = useMemo(() => detectType(item.text), [item.text]);
    const isFiles = type === 'files';
    const imageType = useMemo(
      () => (isFiles ? ImageType.None : detectImageType(item.text)),
      [isFiles, item.text],
    );
    const isImage = imageType !== ImageType.None;
    const hasTags = (item.tags?.length ?? 0) > 0;
    const tagListRef = useRef<HTMLDivElement>(null);
    const [tagListHeight, setTagListHeight] = useState(0);
    const imageUrls = useMemo(
      () =>
        type === 'multi-image'
          ? item.text
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
          : [item.text],
      [type, item.text],
    );
    const filePaths = useMemo(
      () => (isFiles ? decodeFileList(item.text) : []),
      [isFiles, item.text],
    );
    const isFilesGallery = useMemo(
      () => settings.showImagePreview
        && isFiles
        && filePaths.length > 0
        && filePaths.every((path) => detectImageType(path) === ImageType.LocalFile),
      [settings.showImagePreview, isFiles, filePaths],
    );

    // --- 图标 ---
    const IconComponent = useMemo(
      () => getItemIcon(item, type, imageType),
      [item, type, imageType],
    );

    // --- 语义化颜色指示器 ---
    const accentType = useMemo(() => {
      if (type === 'code') return 'code';
      if (type === 'url') return 'url';
      if (isImage || type === 'multi-image') return 'image';
      if (isFiles) return 'files';
      if (type === 'color') return 'color';
      return 'default';
    }, [type, isImage, isFiles]);

    const handleGalleryDisplayModeChange = useCallback((mode: GalleryDisplayMode) => {
      updateSettings({ galleryDisplayMode: mode });
    }, [updateSettings]);

    const handleGalleryScrollDirectionChange = useCallback((dir: GalleryScrollDirection) => {
      updateSettings({ galleryScrollDirection: dir });
    }, [updateSettings]);

    const handleGalleryListItemClick = useCallback((url: string) => {
      void copyToClipboard(
        { ...item, text: url },
        { suppressCopiedIdFeedback: true },
      );
    }, [copyToClipboard, item]);

    const handleGalleryCopyImage = useCallback((url: string) => {
      void copyToClipboard(
        { ...item, text: url },
        { suppressCopiedIdFeedback: true },
      );
    }, [copyToClipboard, item]);

    const handleCopyAsNewColor = useCallback(
      async (color: string) => {
        await copyText(color);
        await ClipboardDB.addClip(color);
        await loadHistory();
      },
      [copyText, loadHistory],
    );

    // --- 事件 ---
    const handleClick = useCallback(() => setSelectedIndex(index), [setSelectedIndex, index]);
    const handleDblClick = useCallback(
      (e: React.MouseEvent) => {
        // 双击按钮、链接、输入框等交互元素时不触发粘贴
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, select, textarea, [role="button"]')) return;
        handleDoubleClick(item);
      },
      [handleDoubleClick, item],
    );
    const onDragStart = useCallback(
      (e: unknown) => handleDragStart(e as React.DragEvent, item.text),
      [handleDragStart, item.text],
    );

    const handlePointerDownCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const isInteractiveTarget = Boolean(
        target.closest('button, a, input, select, textarea, [role="button"]'),
      );
      setSuppressActiveFeedback(isInteractiveTarget);
    }, []);

    const clearSuppressActiveFeedback = useCallback(() => {
      setSuppressActiveFeedback(false);
    }, []);

    useLayoutEffect(() => {
      if (isImage || !hasTags) {
        setTagListHeight(0);
        return;
      }

      const element = tagListRef.current;
      if (!element) return;

      const syncHeight = () => {
        setTagListHeight(element.scrollHeight);
      };

      syncHeight();

      const observer = new ResizeObserver(syncHeight);
      observer.observe(element);

      return () => observer.disconnect();
    }, [isImage, hasTags, item.tags]);

    const containerClass = 'clip-item-root';

    return (
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={handleDragEnd}
        onDoubleClick={handleDblClick}
        onClick={handleClick}
        onPointerDownCapture={handlePointerDownCapture}
        onPointerUpCapture={clearSuppressActiveFeedback}
        onPointerCancel={clearSuppressActiveFeedback}
        onPointerLeave={clearSuppressActiveFeedback}
        className={containerClass}
        data-selected={isSelected ? 'true' : 'false'}
        data-theme={settings.darkMode ? 'dark' : 'light'}
        data-files={isFiles ? 'true' : 'false'}
        data-files-gallery={isFilesGallery ? 'true' : 'false'}
        data-press-feedback={suppressActiveFeedback ? 'off' : 'on'}
      >
        {/* 语义化颜色指示线 */}
        <div className="clip-item-accent" data-type={accentType} />

        {/* 左侧图标 */}
        <div className="clip-item-icon-wrap" data-selected={isSelected ? 'true' : 'false'}>
          <IconComponent className="clip-item-icon-16" />
        </div>

        {/* 主体内容 */}
        <div className="clip-item-content-wrap">
          <ClipItemContent
            item={item}
            type={type}
            isImage={isImage}
            imageType={imageType}
            imageUrls={imageUrls}
            searchQuery={searchQuery}
            showImagePreview={settings.showImagePreview}
            setPreviewImageUrl={setPreviewImageUrl}
            isSelected={isSelected}
            darkMode={settings.darkMode}
            galleryDisplayMode={settings.galleryDisplayMode}
            galleryScrollDirection={settings.galleryScrollDirection}
            galleryWheelMode={settings.galleryWheelMode}
            galleryListMaxVisibleItems={settings.galleryListMaxVisibleItems}
            onGalleryDisplayModeChange={handleGalleryDisplayModeChange}
            onGalleryScrollDirectionChange={handleGalleryScrollDirectionChange}
            onGalleryListItemClick={handleGalleryListItemClick}
            onGalleryCopyImage={handleGalleryCopyImage}
            onUpdatePickedColor={handleUpdatePickedColor}
            onCopyAsNewColor={handleCopyAsNewColor}
            copyText={copyText}
          />

          {/* 标签列表 */}
          {isImage ? (
            <div
              className="clip-item-tag-list"
              data-has-tags={hasTags ? 'true' : 'false'}
              data-image-slot="true"
            >
              <AnimatePresence>
                {(item.tags ?? []).map((tag) => {
                  const tagStyle = tag.color
                    ? {
                        backgroundColor: hexToRgba(tag.color, settings.darkMode ? 0.2 : 0.12),
                        color: tag.color,
                        borderColor: hexToRgba(tag.color, settings.darkMode ? 0.4 : 0.28),
                      }
                    : {};

                  return (
                    <motion.span
                      layout
                      initial={{ opacity: 0, scale: 0.8, filter: 'blur(2px)' }}
                      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{
                        type: 'spring',
                        stiffness: TAG_PILL_SPRING_STIFFNESS,
                        damping: TAG_PILL_SPRING_DAMPING,
                      }}
                      key={tag.id}
                      className="clip-item-tag-pill"
                      data-default={!tag.color ? 'true' : 'false'}
                      data-theme={settings.darkMode ? 'dark' : 'light'}
                      style={tagStyle}
                    >
                      <TagIcon className="clip-item-tag-icon" strokeWidth={2.5} />
                      {tag.name}
                    </motion.span>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {hasTags && (
                <motion.div
                  key="clip-item-tag-list-shell"
                  className="clip-item-tag-list-shell"
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: tagListHeight, marginTop: TAG_LIST_MARGIN_TOP_PX }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{
                    opacity: {
                      duration: TAG_LIST_OPACITY_DURATION_MS / 1000,
                      ease: TAG_LIST_ANIMATION_EASING,
                    },
                    height: {
                      duration: TAG_LIST_ANIMATION_DURATION_MS / 1000,
                      ease: TAG_LIST_ANIMATION_EASING,
                    },
                    marginTop: {
                      duration: TAG_LIST_ANIMATION_DURATION_MS / 1000,
                      ease: TAG_LIST_ANIMATION_EASING,
                    },
                  }}
                >
                  <div ref={tagListRef} className="clip-item-tag-list" data-has-tags="true">
                    <AnimatePresence>
                      {(item.tags ?? []).map((tag) => {
                        const tagStyle = tag.color
                          ? {
                              backgroundColor: hexToRgba(tag.color, settings.darkMode ? 0.2 : 0.12),
                              color: tag.color,
                              borderColor: hexToRgba(tag.color, settings.darkMode ? 0.4 : 0.28),
                            }
                          : {};

                        return (
                          <motion.span
                            layout
                            initial={{ opacity: 0, scale: 0.8, filter: 'blur(2px)' }}
                            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{
                              type: 'spring',
                              stiffness: TAG_PILL_SPRING_STIFFNESS,
                              damping: TAG_PILL_SPRING_DAMPING,
                            }}
                            key={tag.id}
                            className="clip-item-tag-pill"
                            data-default={!tag.color ? 'true' : 'false'}
                            data-theme={settings.darkMode ? 'dark' : 'light'}
                            style={tagStyle}
                          >
                            <TagIcon className="clip-item-tag-icon" strokeWidth={2.5} />
                            {tag.name}
                          </motion.span>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* 右侧：时间 + 操作 */}
        <div className="clip-item-side-meta" data-theme={settings.darkMode ? 'dark' : 'light'}>
          <span className="clip-item-time" data-selected={isSelected ? 'true' : 'false'}>
            {formatDate(item.timestamp)}
          </span>

          <ActionButtons
            item={item}
            isSelected={isSelected}
            isFiles={isFiles}
            isImage={isImage}
            darkMode={settings.darkMode}
            copiedId={copiedId}
            tags={tags}
            onTogglePin={handleTogglePin}
            onToggleFavorite={handleToggleFavorite}
            onCopy={copyToClipboard}
            onRemove={handleRemove}
            onEdit={setEditingClip}
            onAddTag={handleAddTagToItem}
            onRemoveTag={handleRemoveTagFromItem}
          />
        </div>
      </div>
    );
  },
  (prev, next) => prev.item === next.item && prev.index === next.index,
);
