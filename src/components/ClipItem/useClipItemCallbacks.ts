import React, { useCallback, useRef } from 'react';
import { ClipItem, GalleryDisplayMode, GalleryScrollDirection } from '../../types';
import { encodeFileList } from '../../utils';

// ─── 依赖接口 ─────────────────────────────────────────────────────────────
interface UseClipItemCallbacksDeps {
  item: ClipItem;
  copyToClipboard: (
    item: ClipItem,
    options?: { suppressCopiedIdFeedback?: boolean },
  ) => Promise<void>;
  copyText: (text: string) => Promise<void>;
  updateSettings: (patch: Record<string, unknown>) => void;
  addClipEntry: (text: string) => Promise<void>;
  handleTogglePin: (item: ClipItem) => void;
  handleToggleFavorite: (item: ClipItem) => void;
}

// ─── 返回接口 ─────────────────────────────────────────────────────────────
export interface ClipItemCallbacks {
  /** Gallery: 切换展示模式 */
  handleGalleryDisplayModeChange: (mode: GalleryDisplayMode) => void;
  /** Gallery: 切换滚动方向 */
  handleGalleryScrollDirectionChange: (dir: GalleryScrollDirection) => void;
  /** Gallery: 列表项点击 / 图片复制（统一入口） */
  handleGalleryItemCopy: (url: string) => void;
  /** FileList: 点击文件项 → 复制为单文件条目 */
  handleFileListItemClick: (filePath: string) => void;
  /** Color: 复制颜色并存储为新条目 */
  handleCopyAsNewColor: (color: string) => Promise<void>;
  /** Time 区域点击（普通=收藏，Alt=置顶） */
  handleTimeClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Time 区域键盘（Enter/Space 触发） */
  handleTimeKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * 从 ClipItemComponent 提取所有转发 / 包装回调。
 *
 * 改进点（相比原实现）：
 * - **性能**：useRef(item) 使回调不因 item 对象重建而重建（11→7 useCallback）
 * - **去重**：原 handleGalleryListItemClick ≡ handleGalleryCopyImage 合并为 handleGalleryItemCopy
 * - **精简**：拖拽回调（原 2 个纯转发）提升至调用方直接引用 handleDragStart
 * - **结构**：消除中间回调 handleTimeQuickAction，内联至 handleTimeClick / handleTimeKeyDown
 */
export function useClipItemCallbacks({
  item,
  copyToClipboard,
  copyText,
  updateSettings,
  addClipEntry,
  handleTogglePin,
  handleToggleFavorite,
}: UseClipItemCallbacksDeps): ClipItemCallbacks {
  // 最新 item 引用 — 使下游回调不因 item 对象重建而重建
  const itemRef = useRef(item);
  itemRef.current = item;

  // ─── Gallery ───────────────────────────────────────────────────────────
  const handleGalleryDisplayModeChange = useCallback(
    (mode: GalleryDisplayMode) => updateSettings({ galleryDisplayMode: mode }),
    [updateSettings],
  );

  const handleGalleryScrollDirectionChange = useCallback(
    (dir: GalleryScrollDirection) => updateSettings({ galleryScrollDirection: dir }),
    [updateSettings],
  );

  /** 以指定 URL 覆盖当前 item 的 text 并复制（列表项点击 + 图片复制共用） */
  const handleGalleryItemCopy = useCallback(
    (url: string) => {
      void copyToClipboard(
        { ...itemRef.current, text: url },
        { suppressCopiedIdFeedback: true },
      );
    },
    [copyToClipboard],
  );

  // ─── FileList ──────────────────────────────────────────────────────────
  const handleFileListItemClick = useCallback(
    (filePath: string) => {
      void copyToClipboard(
        { ...itemRef.current, text: encodeFileList([filePath]) },
        { suppressCopiedIdFeedback: true },
      );
    },
    [copyToClipboard],
  );

  // ─── Color ─────────────────────────────────────────────────────────────
  const handleCopyAsNewColor = useCallback(
    async (color: string) => {
      await copyText(color);
      await addClipEntry(color);
    },
    [copyText, addClipEntry],
  );

  // ─── Time / Favorite ──────────────────────────────────────────────────
  const handleTimeClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const current = itemRef.current;
      e.altKey ? handleTogglePin(current) : handleToggleFavorite(current);
    },
    [handleToggleFavorite, handleTogglePin],
  );

  const handleTimeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      const current = itemRef.current;
      e.altKey ? handleTogglePin(current) : handleToggleFavorite(current);
    },
    [handleToggleFavorite, handleTogglePin],
  );

  return {
    handleGalleryDisplayModeChange,
    handleGalleryScrollDirectionChange,
    handleGalleryItemCopy,
    handleFileListItemClick,
    handleCopyAsNewColor,
    handleTimeClick,
    handleTimeKeyDown,
  };
}
