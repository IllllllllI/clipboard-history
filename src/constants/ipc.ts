export const CLIPITEM_HUD_EVENTS = {
  snapshot: 'clipitem-hud-snapshot',
  action: 'clipitem-hud-action',
  globalPointerMove: 'clipitem-hud-global-pointer-move',
  globalPointerUp: 'clipitem-hud-global-pointer-up',
} as const;

export const RADIAL_MENU_EVENTS = {
  snapshot: 'radial-menu-snapshot',
  action: 'radial-menu-action',
  globalPointerMove: 'radial-menu-global-pointer-move',
  globalPointerUp: 'radial-menu-global-pointer-up',
} as const;

export const IMAGE_DOWNLOAD_EVENTS = {
  progress: 'image-download-progress',
} as const;

export const WINDOW_LABELS = {
  main: 'main',
  clipItemHud: 'clipitem-hud',
  downloadHud: 'download-hud',
  radialMenu: 'radial-menu',
} as const;
