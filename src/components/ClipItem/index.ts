/**
 * ClipItem 模块的 barrel 导出
 *
 * 对外统一暴露主组件与可复用子模块。
 * 外部模块请统一从 `./ClipItem` 导入，避免跨文件耦合具体文件路径。
 */

/* ---- 核心 ---- */
export { ClipItemComponent } from './ClipItemComponent';
export { getItemIcon } from './constants';

/* ---- display/ ---- */
export { HighlightText } from './display/HighlightText';
export { HighlightDateTimeText, DateTimeChip } from './display/DateTimeChip';
export { LinkOpenStatus } from './display/LinkOpenStatus';
export { ImagePreview } from './display/ImagePreview';

/* ---- actions/ ---- */
export { ActionButtons } from './actions/ActionButtons';
export { TagDropdown } from './actions/TagDropdown';

/* ---- favorite/ ---- */
export { ClipItemTimeMeta } from './favorite/ClipItemTimeMeta';
export { FavoriteBurstEffect } from './favorite/FavoriteBurstEffect';
export { useFavoriteVisualState } from './favorite/useFavoriteVisualState';

/* ---- color/ ---- */
export { ColorContentBlock } from './color/ColorContentBlock';
export { ColorPickerPopover } from './color/ColorPickerPopover';

/* ---- tags/ ---- */
export { ClipItemTagList } from './tags/ClipItemTagList';

/* ---- hooks ---- */
export { useClickOutside } from './useClickOutside';
export { useClipItemDerivedState } from './useClipItemDerivedState';
export { useClipItemCallbacks } from './useClipItemCallbacks';
export { useUrlOpenState } from './useUrlOpenState';

