import React, { useCallback, useMemo, useRef } from 'react';
import { ClipItem } from '../../types';
import { formatDateParts } from '../../utils';
import { useClipItemStableContext } from './ClipItemContext';
import { ClipItemContent } from './ClipItemContent';
import { ActionButtons } from './actions/ActionButtons';
import { TagDropdown } from './actions/TagDropdown';
import { ClipItemTimeMeta } from './favorite/ClipItemTimeMeta';
import { useFavoriteVisualState } from './favorite/useFavoriteVisualState';
import { useClipItemHudController } from '../../hud/clipitem/useClipItemHudController';
import { useClipItemDerivedState } from './useClipItemDerivedState';
import { useClipItemCallbacks } from './useClipItemCallbacks';
import { ClipItemTagList } from './tags/ClipItemTagList';
import './styles/clip-item-hud.css';
import './styles/clip-item.css';

interface ClipItemProps {
  item: ClipItem;
  index: number;
  /** 是否为当前选中项（由 ClipList 根据 selectedIndex 计算后注入） */
  isSelected: boolean;
  /** 是否为最近复制项（由 ClipList 根据 copiedId 计算后注入） */
  isCopied: boolean;
  /** 当前搜索关键词（用于高亮） */
  searchQuery: string;
}

const FAVORITE_BURST_DURATION_MS = 560;
const FAVORITE_BURST_DURATION_SEC = `${FAVORITE_BURST_DURATION_MS / 1000}s`;
/**
 * 剪贴板历史条目组件
 *
 * 职责：布局骨架 + 选中/拖拽/交互事件。
 * 实际内容渲染委托给 ClipItemContent，操作按钮委托给 ActionButtons。
 *
 * ## 性能设计
 * - 不再直接订阅 SettingsContext / ClipboardContext / UIContext。
 *   改为从 **ClipItemStableContext**（低频变化）获取回调与设置，
 *   高频变化的 isSelected / isCopied / searchQuery 通过 props 注入，
 *   由 React.memo 比较器精确拦截，避免全量重渲染。
 */
export const ClipItemComponent = React.memo(
  function ClipItemComponent({ item, index, isSelected, isCopied, searchQuery }: ClipItemProps) {
    const {
      settings, updateSettings,
      copyToClipboard, copyText, addClipEntry,
      tags,
      handleTogglePin, handleToggleFavorite,
      handleRemove, handleUpdatePickedColor,
      handleAddTagToItem, handleRemoveTagFromItem,
      setSelectedIndex,
      handleDoubleClick, handleDragStart, handleDragEnd,
      setPreviewImageUrl, setEditingClip,
    } = useClipItemStableContext();

    const rootRef = useRef<HTMLDivElement>(null);

    // --- 衍生状态（提取至 hook） ---
    const {
      type, isFiles, imageType, isImage, imageUrls, filePaths, imageFormat,
      isFilesGallery, accentType, IconComponent,
    } = useClipItemDerivedState(item, settings.showImagePreview);

    const theme = settings.darkMode ? 'dark' : 'light';
    const itemTags = item.tags ?? [];

    // --- 回调（提取至 hook） ---
    const {
      handleGalleryDisplayModeChange,
      handleGalleryScrollDirectionChange,
      handleGalleryItemCopy,
      handleFileListItemClick,
      handleCopyAsNewColor,
      handleTimeClick,
      handleTimeKeyDown,
    } = useClipItemCallbacks({
      item,
      copyToClipboard,
      copyText,
      updateSettings,
      addClipEntry,
      handleTogglePin,
      handleToggleFavorite,
    });

    // --- 配置对象（分组传递给 ClipItemContent）---
    const galleryConfig = useMemo(() => ({
      displayMode: settings.galleryDisplayMode,
      scrollDirection: settings.galleryScrollDirection,
      wheelMode: settings.galleryWheelMode,
      listMaxVisibleItems: settings.galleryListMaxVisibleItems,
      onDisplayModeChange: handleGalleryDisplayModeChange,
      onScrollDirectionChange: handleGalleryScrollDirectionChange,
      onListItemClick: handleGalleryItemCopy,
      onListItemDragStart: handleDragStart,
      onCopyImage: handleGalleryItemCopy,
    }), [
      settings.galleryDisplayMode, settings.galleryScrollDirection,
      settings.galleryWheelMode, settings.galleryListMaxVisibleItems,
      handleGalleryDisplayModeChange, handleGalleryScrollDirectionChange,
      handleGalleryItemCopy, handleDragStart,
    ]);

    const fileListConfig = useMemo(() => ({
      maxVisibleItems: settings.fileListMaxVisibleItems,
      onItemClick: handleFileListItemClick,
      onItemDragStart: handleDragStart,
    }), [settings.fileListMaxVisibleItems, handleFileListItemClick, handleDragStart]);

    const colorConfig = useMemo(() => ({
      onUpdatePickedColor: handleUpdatePickedColor,
      onCopyAsNewColor: handleCopyAsNewColor,
    }), [handleUpdatePickedColor, handleCopyAsNewColor]);

    // --- 收藏视觉效果 ---
    const isFavorite = Boolean(item.is_favorite);
    const isPinned = Boolean(item.is_pinned);
    const { showFavoriteBurst, showFavoriteIcon } = useFavoriteVisualState({
      isFavorite,
      durationMs: FAVORITE_BURST_DURATION_MS,
    });

    // --- 事件 ---
    const handleClick = useCallback(() => setSelectedIndex(index), [setSelectedIndex, index]);
    const handleDblClick = useCallback(
      (e: React.MouseEvent) => {
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

    const { dateLine, timeLine } = useMemo(() => formatDateParts(item.timestamp), [item.timestamp]);

    // --- HUD 控制器 ---
    const {
      isHudActive,
      suppressActiveFeedback,
      handleMouseDownCapture,
      handlePointerDownCapture,
      handleRootPointerMove,
      handlePointerUpCapture,
      handleRootPointerCancel,
      handleRootPointerLeave,
      handleRootContextMenu,
      handleRootAuxClick,
    } = useClipItemHudController({
      rootRef,
      isSelected,
      itemId: item.id,
      dateLine,
      timeLine,
      isFavorite,
      isPinned,
      canEdit: !isFiles && !isImage,
      isCopied,
      theme,
      shouldEnableClipItemHud: settings.clipItemHudEnabled && settings.compactMetaDisplayMode !== 'inside',
      shouldEnableRadialMenuHud: settings.clipItemHudRadialMenuEnabled,
      triggerMouseButton: settings.clipItemHudTriggerMouseButton,
      triggerMouseMode: settings.clipItemHudTriggerMouseMode,
      positionMode: settings.clipItemHudPositionMode,
    });

    const hudFxMode = settings.clipItemHudRadialMenuFancyFx ? 'fancy' : 'normal';
    const clipItemHudStyle = useMemo(() => ({
      '--clip-item-hud-run-duration': `${settings.clipItemHudBorderRunDurationSec}s`,
      '--clip-item-hud-ring-width': `${settings.clipItemHudBorderRingWidthPx}px`,
    } as React.CSSProperties), [settings.clipItemHudBorderRunDurationSec, settings.clipItemHudBorderRingWidthPx]);

    return (
      <div
        ref={rootRef}
        draggable
        onDragStart={onDragStart}
        onDragEnd={handleDragEnd}
        onDoubleClick={handleDblClick}
        onClick={handleClick}
        onAuxClick={handleRootAuxClick}
        onContextMenu={handleRootContextMenu}
        onMouseDownCapture={handleMouseDownCapture}
        onPointerDownCapture={handlePointerDownCapture}
        onPointerMove={handleRootPointerMove}
        onPointerUpCapture={handlePointerUpCapture}
        onPointerCancel={handleRootPointerCancel}
        onPointerLeave={handleRootPointerLeave}
        className="clip-item-root"
        data-selected={isSelected ? 'true' : 'false'}
        data-theme={theme}
        data-files={isFiles ? 'true' : 'false'}
        data-files-gallery={isFilesGallery ? 'true' : 'false'}
        data-hud-active={isHudActive ? 'true' : 'false'}
        data-hud-palette={accentType}
        data-hud-fx={hudFxMode}
        data-meta-display={settings.compactMetaDisplayMode}
        data-press-feedback={suppressActiveFeedback ? 'off' : 'on'}
        style={clipItemHudStyle}
      >
        {/* 语义化颜色指示线 */}
        <div className="clip-item-accent" data-type={accentType} />

        {/* 左侧图标（标签入口） */}
        <TagDropdown
          item={item}
          tags={tags}
          darkMode={settings.darkMode}
          onAddTag={handleAddTagToItem}
          onRemoveTag={handleRemoveTagFromItem}
          triggerClassName="clip-item-icon-wrap"
          triggerVariant="icon"
          triggerSelected={isSelected}
          showSelectedCount
          triggerTitle="标签管理（点击选择标签，Alt+点击快速切换最近标签）"
          triggerContent={<IconComponent className="clip-item-icon-16" />}
        />

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
            gallery={galleryConfig}
            fileList={fileListConfig}
            color={colorConfig}
            copyText={copyText}
          />

          {/* 标签列表 */}
          <ClipItemTagList
            itemTags={itemTags}
            isRich={item.content_type === 'rich'}
            imageFormat={imageFormat}
            isImage={isImage}
            theme={theme}
            darkMode={settings.darkMode}
          />
        </div>

        {/* 右侧：时间 + 操作 */}
        <div className="clip-item-side-meta" data-theme={theme}>
          <ClipItemTimeMeta
            isPinned={isPinned}
            isSelected={isSelected}
            showFavoriteIcon={showFavoriteIcon}
            showFavoriteBurst={showFavoriteBurst}
            dateLine={dateLine}
            timeLine={timeLine}
            onTimeClick={handleTimeClick}
            onTimeKeyDown={handleTimeKeyDown}
            favoriteBurstDurationSec={FAVORITE_BURST_DURATION_SEC}
          />

          {settings.clipItemFloatingActionsEnabled && (
            <ActionButtons
              item={item}
              isSelected={isSelected}
              isFiles={isFiles}
              isImage={isImage}
              darkMode={settings.darkMode}
              isCopied={isCopied}
              onCopy={copyToClipboard}
              onRemove={handleRemove}
              onEdit={setEditingClip}
            />
          )}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.item === next.item &&
    prev.index === next.index &&
    prev.isSelected === next.isSelected &&
    prev.isCopied === next.isCopied &&
    prev.searchQuery === next.searchQuery,
);



