import React, { useCallback } from 'react';
import { ClipItem, GalleryDisplayMode, GalleryScrollDirection } from '../../types';
import { encodeFileList } from '../../utils';
import { ClipboardDB } from '../../services/db';

interface UseClipItemCallbacksDeps {
  item: ClipItem;
  copyToClipboard: (
    item: ClipItem,
    options?: { suppressCopiedIdFeedback?: boolean },
  ) => Promise<void>;
  copyText: (text: string) => Promise<void>;
  handleDragStart: (e: React.DragEvent, text: string) => void;
  updateSettings: (patch: Record<string, unknown>) => void;
  loadHistory: () => Promise<void>;
  handleTogglePin: (item: ClipItem) => void;
  handleToggleFavorite: (item: ClipItem) => void;
}

export interface ClipItemCallbacks {
  handleGalleryDisplayModeChange: (mode: GalleryDisplayMode) => void;
  handleGalleryScrollDirectionChange: (dir: GalleryScrollDirection) => void;
  handleGalleryListItemClick: (url: string) => void;
  handleGalleryListItemDragStart: (e: React.DragEvent<HTMLDivElement>, url: string) => void;
  handleGalleryCopyImage: (url: string) => void;
  handleFileListItemClick: (filePath: string) => void;
  handleFileListItemDragStart: (e: React.DragEvent<HTMLDivElement>, filePath: string) => void;
  handleCopyAsNewColor: (color: string) => Promise<void>;
  handleTimeClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  handleTimeKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * 从 ClipItemComponent 中提取所有转发/包装回调，
 * 保持主组件只关注布局与编排。
 */
export function useClipItemCallbacks({
  item,
  copyToClipboard,
  copyText,
  handleDragStart,
  updateSettings,
  loadHistory,
  handleTogglePin,
  handleToggleFavorite,
}: UseClipItemCallbacksDeps): ClipItemCallbacks {
  // --- Gallery 相关 ---
  const handleGalleryDisplayModeChange = useCallback(
    (mode: GalleryDisplayMode) => {
      updateSettings({ galleryDisplayMode: mode });
    },
    [updateSettings],
  );

  const handleGalleryScrollDirectionChange = useCallback(
    (dir: GalleryScrollDirection) => {
      updateSettings({ galleryScrollDirection: dir });
    },
    [updateSettings],
  );

  const handleGalleryListItemClick = useCallback(
    (url: string) => {
      void copyToClipboard(
        { ...item, text: url },
        { suppressCopiedIdFeedback: true },
      );
    },
    [copyToClipboard, item],
  );

  const handleGalleryListItemDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, url: string) => {
      void handleDragStart(e, url);
    },
    [handleDragStart],
  );

  const handleGalleryCopyImage = useCallback(
    (url: string) => {
      void copyToClipboard(
        { ...item, text: url },
        { suppressCopiedIdFeedback: true },
      );
    },
    [copyToClipboard, item],
  );

  // --- FileList 相关 ---
  const handleFileListItemClick = useCallback(
    (filePath: string) => {
      void copyToClipboard(
        { ...item, text: encodeFileList([filePath]) },
        { suppressCopiedIdFeedback: true },
      );
    },
    [copyToClipboard, item],
  );

  const handleFileListItemDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, filePath: string) => {
      void handleDragStart(e, filePath);
    },
    [handleDragStart],
  );

  // --- Color 相关 ---
  const handleCopyAsNewColor = useCallback(
    async (color: string) => {
      await copyText(color);
      await ClipboardDB.addClip(color);
      await loadHistory();
    },
    [copyText, loadHistory],
  );

  // --- Time/Favorite 快捷操作 ---
  const handleTimeQuickAction = useCallback(
    (usePinAction: boolean) => {
      if (usePinAction) {
        handleTogglePin(item);
        return;
      }
      handleToggleFavorite(item);
    },
    [handleToggleFavorite, handleTogglePin, item],
  );

  const handleTimeClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      handleTimeQuickAction(e.altKey);
    },
    [handleTimeQuickAction],
  );

  const handleTimeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      handleTimeQuickAction(e.altKey);
    },
    [handleTimeQuickAction],
  );

  return {
    handleGalleryDisplayModeChange,
    handleGalleryScrollDirectionChange,
    handleGalleryListItemClick,
    handleGalleryListItemDragStart,
    handleGalleryCopyImage,
    handleFileListItemClick,
    handleFileListItemDragStart,
    handleCopyAsNewColor,
    handleTimeClick,
    handleTimeKeyDown,
  };
}
