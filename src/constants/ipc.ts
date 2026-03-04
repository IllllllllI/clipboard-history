export const CLIPITEM_HUD_EVENTS = {
  snapshot: 'clipitem-hud-snapshot',
  action: 'clipitem-hud-action',
  globalPointerMove: 'clipitem-hud-global-pointer-move',
  globalPointerUp: 'clipitem-hud-global-pointer-up',
  /** HUD 窗口自身失去焦点时发送到主窗口 */
  windowBlur: 'clipitem-hud-window-blur',
  /** HUD 窗口前端就绪（React 已挂载，事件监听器已注册） */
  ready: 'clipitem-hud-ready',
} as const;

export const RADIAL_MENU_EVENTS = {
  snapshot: 'radial-menu-snapshot',
  action: 'radial-menu-action',
  globalPointerMove: 'radial-menu-global-pointer-move',
  globalPointerUp: 'radial-menu-global-pointer-up',
  /** 径向菜单窗口前端就绪 */
  ready: 'radial-menu-ready',
} as const;

export const IMAGE_DOWNLOAD_EVENTS = {
  progress: 'image-download-progress',
} as const;

export const HUD_HOST_EVENTS = {
  /** HUD 宿主窗口前端就绪（React 已挂载，所有事件监听器已注册） */
  ready: 'hud-host-ready',
} as const;

export const WINDOW_LABELS = {
  main: 'main',
  /** 统一 HUD 宿主窗口（合并 clipitem-hud + radial-menu + download-hud） */
  hudHost: 'hud-host',
  // ── 以下别名保留向后兼容，实际都指向 hud-host ──
  clipItemHud: 'hud-host',
  downloadHud: 'hud-host',
  radialMenu: 'hud-host',
} as const;
