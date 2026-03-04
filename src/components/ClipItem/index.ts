/**
 * ClipItem 模块的 barrel 导出
 *
 * 对外统一暴露主组件与可复用子模块。
 * 外部模块请统一从 `./ClipItem` 导入，避免跨文件耦合具体文件路径。
 */
export { ClipItemComponent } from './ClipItemComponent';
export { ClipItemTimeMeta } from './ClipItemTimeMeta';
export { ColorContentBlock } from './ColorContentBlock';
export { FavoriteBurstEffect } from './FavoriteBurstEffect';
export { LinkOpenStatus } from './LinkOpenStatus';
export { useFavoriteVisualState } from './useFavoriteVisualState';
export { useClipItemHudController } from '../../hud/clipitem/useClipItemHudController';
