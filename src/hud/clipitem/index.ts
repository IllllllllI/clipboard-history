/**
 * ClipItem HUD 模块
 *
 * 包含线性条状 HUD 窗口的入口组件、全局状态管理器、
 * 控制 Hook 及边框动画常量。
 */
export { default as ClipItemHudApp } from './ClipItemHudApp';
export { useClipItemHudController } from './useClipItemHudController';
export {
  claimOwnership,
  releaseOwnership,
  isOwner,
  getOwnerItemId,
  isVisible,
  setVisible,
  setDragging,
  isDragging,
  clearSwitchGraceTimer,
  scheduleSwitchGraceHide,
  registerSyncCallback,
  requestSync,
  notifyExternalHide,
  setClipItemHudDragging,
  setClipItemHudVisible,
} from './clipItemHudManager';
export {
  CLIP_ITEM_HUD_BORDER_RUN_DURATION,
  CLIP_ITEM_HUD_BORDER_RING_WIDTH,
} from './constants';
