import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow, PhysicalPosition } from '@tauri-apps/api/window';
import { register, unregister, unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { open } from '@tauri-apps/plugin-dialog';
import { open as openPath } from '@tauri-apps/plugin-shell';
import type {
  ImageAdvancedConfig,
  ImageDownloadProgressEvent,
  ImagePerformanceProfile,
  ClipItemHudActionEvent,
  ClipItemHudSnapshot,
  RadialMenuSnapshot,
  RadialMenuActionEvent,
  WindowPlacementSettings,
} from '../types';
import {
  CLIPITEM_HUD_EVENTS,
  RADIAL_MENU_EVENTS,
  IMAGE_DOWNLOAD_EVENTS,
  HUD_HOST_EVENTS,
  WINDOW_LABELS,
} from '../constants/ipc';

// ============================================================================
// 环境检测
// ============================================================================

export const isTauri =
  typeof window !== 'undefined' &&
  !!(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

// ============================================================================
// 共享事件载荷类型（ClipItem HUD / 径向菜单通用）
// ============================================================================

/** 指针移动事件载荷 */
interface PointerMovePayload {
  screenX: number;
  screenY: number;
  button: number;
  buttons: number;
}

/** 指针抬起事件载荷 */
interface PointerUpPayload {
  screenX: number;
  screenY: number;
  button: number;
}

// ============================================================================
// IPC 基础设施 — 消除 if‑guard 样板代码
// ============================================================================

const NOOP_UNLISTEN: UnlistenFn = () => {};

/** 缓存当前窗口引用，避免每次重复构造 */
let _win: ReturnType<typeof getCurrentWindow> | null = null;
function win() {
  return (_win ??= getCurrentWindow());
}

/**
 * 带 Tauri 环境守卫的 invoke 包装。
 * 非 Tauri 环境直接返回 `null`（适用于返回值为 `T | null` 的调用）。
 */
function ipc<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) return Promise.resolve(null as T);
  return invoke<T>(cmd, args);
}

/** 无返回值的 IPC 调用 */
function ipcVoid(cmd: string, args?: Record<string, unknown>): Promise<void> {
  if (!isTauri) return Promise.resolve();
  return invoke<void>(cmd, args);
}

/** 静默容错的 IPC — 在网络 / 后端异常时返回 fallback 而非抛出 */
function ipcSafe<T>(cmd: string, args: Record<string, unknown>, fallback: T): Promise<T> {
  if (!isTauri) return Promise.resolve(fallback);
  return invoke<T>(cmd, args).catch(() => fallback);
}

// ============================================================================
// 事件通道工厂 — 消除 emit / listen 成对样板
// ============================================================================

type EventHandler<T> = (payload: T) => void;

/** 创建一个携带有效载荷的双向事件通道（emit → 目标窗口，listen → 当前窗口） */
function eventChannel<T>(emitTarget: string, event: string) {
  return {
    emit(payload: T): Promise<void> {
      if (!isTauri) return Promise.resolve();
      return emitTo(emitTarget, event, payload);
    },
    listen(handler: EventHandler<T>): Promise<UnlistenFn> {
      if (!isTauri) return Promise.resolve(NOOP_UNLISTEN);
      return listen<T>(event, (e) => handler(e.payload));
    },
  } as const;
}

/** 创建无载荷的信号通道（emit 和 listen 均不携带数据） */
function signalChannel(emitTarget: string, event: string) {
  return {
    emit(): Promise<void> {
      if (!isTauri) return Promise.resolve();
      return emitTo(emitTarget, event, null);
    },
    listen(handler: () => void): Promise<UnlistenFn> {
      if (!isTauri) return Promise.resolve(NOOP_UNLISTEN);
      return listen(event, () => handler());
    },
  } as const;
}

// ============================================================================
// 工具函数
// ============================================================================

/** 移除 file:// 前缀 */
function stripFileProtocol(path: string): string {
  return path.startsWith('file://') ? path.slice(7) : path;
}

/** 从文件复制到剪贴板的通用流程 */
function copyFileViaBackend(path: string, cmd: string): Promise<void> {
  return ipcVoid(cmd, { filePath: stripFileProtocol(path) });
}

// ============================================================================
// 事件通道实例
// ============================================================================

// ── ClipItem HUD ──
const clipItemSnapshot   = eventChannel<ClipItemHudSnapshot>(WINDOW_LABELS.clipItemHud, CLIPITEM_HUD_EVENTS.snapshot);
const clipItemAction     = eventChannel<ClipItemHudActionEvent>(WINDOW_LABELS.main, CLIPITEM_HUD_EVENTS.action);
const clipItemPtrMove    = eventChannel<PointerMovePayload>(WINDOW_LABELS.clipItemHud, CLIPITEM_HUD_EVENTS.globalPointerMove);
const clipItemPtrUp      = eventChannel<PointerUpPayload>(WINDOW_LABELS.clipItemHud, CLIPITEM_HUD_EVENTS.globalPointerUp);
const clipItemWindowBlur = signalChannel(WINDOW_LABELS.main, CLIPITEM_HUD_EVENTS.windowBlur);

// ── 径向菜单 ──
const radialSnapshot = eventChannel<RadialMenuSnapshot>(WINDOW_LABELS.radialMenu, RADIAL_MENU_EVENTS.snapshot);
const radialAction   = eventChannel<RadialMenuActionEvent>(WINDOW_LABELS.main, RADIAL_MENU_EVENTS.action);
const radialPtrMove  = eventChannel<PointerMovePayload>(WINDOW_LABELS.radialMenu, RADIAL_MENU_EVENTS.globalPointerMove);
const radialPtrUp    = eventChannel<PointerUpPayload>(WINDOW_LABELS.radialMenu, RADIAL_MENU_EVENTS.globalPointerUp);

// ── HUD 宿主 & 全局 ──
const hudHostReady = signalChannel(WINDOW_LABELS.main, HUD_HOST_EVENTS.ready);

const imageDownloadProgress = {
  listen(handler: EventHandler<ImageDownloadProgressEvent>): Promise<UnlistenFn> {
    if (!isTauri) return Promise.resolve(NOOP_UNLISTEN);
    return listen<ImageDownloadProgressEvent>(IMAGE_DOWNLOAD_EVENTS.progress, (e) => handler(e.payload));
  },
};

// ============================================================================
// TauriService — 统一 Tauri API 门面
// ============================================================================

export const TauriService = {

  // ──────────────────────────── 应用设置持久化 ────────────────────────────

  getAppSettings: () =>
    ipc<Record<string, unknown> | null>('get_app_settings'),

  setAppSettings: (settings: Record<string, unknown>) =>
    ipcVoid('set_app_settings', { settings }),

  // ──────────────────────────── 窗口操作 ────────────────────────────

  async hideWindow(): Promise<void> {
    if (!isTauri) return;
    await win().hide();
  },

  async showWindow(): Promise<void> {
    if (!isTauri) return;
    const w = win();
    await w.unminimize();
    await w.show();
    await w.setFocus();
  },

  async getPosition(): Promise<PhysicalPosition | null> {
    if (!isTauri) return null;
    return await win().outerPosition();
  },

  async setPosition(pos: PhysicalPosition | null | undefined): Promise<void> {
    if (!isTauri || !pos || pos.type == null) return;
    await win().setPosition(pos);
  },

  async moveOffScreen(): Promise<void> {
    if (!isTauri) return;
    await win().setPosition(new PhysicalPosition(-9999, -9999));
  },

  listenMainWindowMoved(handler: () => void): Promise<UnlistenFn> {
    if (!isTauri) return Promise.resolve(NOOP_UNLISTEN);
    return win().onMoved(() => handler());
  },

  /** 设置主窗口是否始终置顶 */
  setAlwaysOnTop: (enabled: boolean) =>
    ipcVoid('set_always_on_top', { enabled }),

  // ──────────────────────────── HUD 窗口管理 ────────────────────────────

  showDownloadHud:               () => ipcVoid('show_download_hud'),
  hideDownloadHud:               () => ipcVoid('hide_download_hud'),
  positionDownloadHudNearCursor: () => ipcVoid('position_download_hud_near_cursor'),

  showClipItemHud: () => ipcVoid('show_clipitem_hud'),
  hideClipItemHud: () => ipcVoid('hide_clipitem_hud'),

  /** 检查当前系统前景窗口是否属于本应用（Windows 使用 GetForegroundWindow） */
  isAppForegroundWindow(): Promise<boolean> {
    return isTauri ? invoke<boolean>('is_app_foreground_window') : Promise.resolve(true);
  },

  positionClipItemHudNearCursor(mode?: 'linear' | 'radial' | 'edge'): Promise<'horizontal' | 'vertical'> {
    return isTauri
      ? invoke<'horizontal' | 'vertical'>('position_clipitem_hud_near_cursor', { mode: mode || 'edge' })
      : Promise.resolve('horizontal');
  },

  /** 将线性 HUD 固定在主窗口指定边缘 */
  positionClipItemHudAtMainEdge(edge: 'top' | 'bottom' | 'left' | 'right'): Promise<'horizontal' | 'vertical'> {
    return isTauri
      ? invoke<'horizontal' | 'vertical'>('position_clipitem_hud_at_main_edge', { edge })
      : Promise.resolve(edge === 'left' || edge === 'right' ? 'vertical' : 'horizontal');
  },

  setClipItemHudMousePassthrough: (passthrough: boolean) =>
    ipcVoid('set_clipitem_hud_mouse_passthrough', { passthrough }),

  // ──────────────────────────── 径向菜单窗口 ────────────────────────────

  /** 一步打开径向菜单：定位+快照+穿透+显示+置顶，合并为 1 次 IPC */
  openRadialMenuAtCursor: (snapshot: RadialMenuSnapshot) =>
    ipcVoid('open_radial_menu_at_cursor', { snapshot }),

  showRadialMenu:             () => ipcVoid('show_radial_menu'),
  hideRadialMenu:             () => ipcVoid('hide_radial_menu'),
  positionRadialMenuAtCursor: () => ipcVoid('position_radial_menu_at_cursor'),

  setRadialMenuMousePassthrough: (passthrough: boolean) =>
    ipcVoid('set_radial_menu_mouse_passthrough', { passthrough }),

  // ──────────────────────────── ClipItem HUD 事件 ────────────────────────────

  emitClipItemHudSnapshot:            clipItemSnapshot.emit,
  listenClipItemHudSnapshot:          clipItemSnapshot.listen,
  emitClipItemHudAction:              clipItemAction.emit,
  listenClipItemHudAction:            clipItemAction.listen,
  emitClipItemHudGlobalPointerMove:   clipItemPtrMove.emit,
  listenClipItemHudGlobalPointerMove: clipItemPtrMove.listen,
  emitClipItemHudGlobalPointerUp:     clipItemPtrUp.emit,
  listenClipItemHudGlobalPointerUp:   clipItemPtrUp.listen,
  emitClipItemHudWindowBlur:          clipItemWindowBlur.emit,
  listenClipItemHudWindowBlur:        clipItemWindowBlur.listen,

  // ──────────────────────────── 径向菜单事件 ────────────────────────────

  emitRadialMenuSnapshot:            radialSnapshot.emit,
  listenRadialMenuSnapshot:          radialSnapshot.listen,
  emitRadialMenuAction:              radialAction.emit,
  listenRadialMenuAction:            radialAction.listen,
  emitRadialMenuGlobalPointerMove:   radialPtrMove.emit,
  listenRadialMenuGlobalPointerMove: radialPtrMove.listen,
  emitRadialMenuGlobalPointerUp:     radialPtrUp.emit,
  listenRadialMenuGlobalPointerUp:   radialPtrUp.listen,

  // ──────────────────────────── HUD 宿主事件 ────────────────────────────

  emitHudHostReady:  hudHostReady.emit,
  listenHudHostReady: hudHostReady.listen,

  // ──────────────────────────── 图片下载进度事件 ────────────────────────────

  listenImageDownloadProgress: imageDownloadProgress.listen,

  // ──────────────────────────── 剪贴板读写 ────────────────────────────

  /** 将文本写入剪贴板（Tauri 由后端处理含 IgnoreGuard；Web 回退到 navigator） */
  async writeClipboard(text: string): Promise<void> {
    if (isTauri) {
      await invoke<void>('write_text_to_clipboard', { text });
    } else {
      await navigator.clipboard.writeText(text);
    }
  },

  /** 将 Base64 图片写入剪贴板 */
  writeImageBase64: (base64DataUrl: string) =>
    ipcVoid('copy_base64_image_to_clipboard', { data: base64DataUrl }),

  // ──────────────────────────── 剪贴板图片/文件操作 ────────────────────────────

  saveClipboardImage: (saveDir?: string) =>
    ipcSafe<string | null>('save_clipboard_image', { customDir: saveDir || null }, null),

  /** 单次抓取剪贴板快照：文件列表 / 图片 / SVG / 文本（后端按优先级处理） */
  captureClipboardSnapshot: (saveDir?: string) =>
    ipcSafe<string | null>('capture_clipboard_snapshot', { customDir: saveDir || null }, null),

  copyImageFromFile: (path: string) =>
    copyFileViaBackend(path, 'copy_image_from_file'),

  copySvgFromFile: (path: string) =>
    copyFileViaBackend(path, 'copy_svg_from_file'),

  /** 下载网络图片并复制到剪贴板 */
  downloadAndCopyImage: (url: string, requestId: string) =>
    ipcVoid('download_and_copy_image', { url, requestId }),

  cancelImageDownload(requestId: string): Promise<boolean> {
    if (!isTauri || !requestId) return Promise.resolve(false);
    return invoke<boolean>('cancel_image_download', { requestId });
  },

  createImageDownloadRequestId(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  },

  /** @deprecated 使用 writeImageBase64 */
  copyBase64Image: (data: string) =>
    ipcVoid('copy_base64_image_to_clipboard', { data }),

  /** 将本地图片路径复制到剪贴板 */
  copyLocalImage: (path: string) =>
    ipcVoid('copy_image_to_clipboard', { path }),

  /** 设置图片处理性能档位 */
  setImagePerformanceProfile: (profile: ImagePerformanceProfile) =>
    ipcVoid('set_image_performance_profile', { profile }),

  /** 获取后端当前图片处理性能档位 */
  getImagePerformanceProfile: () =>
    ipc<ImagePerformanceProfile | null>('get_image_performance_profile'),

  /** 设置图片处理高级配置 */
  setImageAdvancedConfig: (config: ImageAdvancedConfig) =>
    ipcVoid('set_image_advanced_config', { config }),

  /** 获取后端当前图片处理高级配置 */
  getImageAdvancedConfig: () =>
    ipc<ImageAdvancedConfig | null>('get_image_advanced_config'),

  /** 将文件路径以 CF_HDROP 格式复制到剪贴板 */
  copyFileToClipboard: (path: string) =>
    ipcVoid('copy_file_to_clipboard', { path }),

  /** 将多个文件路径以 CF_HDROP 格式复制到剪贴板 */
  copyFilesToClipboard(paths: string[]): Promise<void> {
    return paths.length === 0 ? Promise.resolve() : ipcVoid('copy_files_to_clipboard', { paths });
  },

  // ──────────────────────────── 输入模拟 ────────────────────────────

  pasteText: (hideOnAction: boolean) =>
    ipcVoid('paste_text', { hideOnAction }),

  /** 模拟鼠标点击后粘贴 */
  clickAndPaste: () =>
    ipcVoid('click_and_paste'),

  // ──────────────────────────── 快捷键 ────────────────────────────

  async registerShortcut(shortcut: string, onTrigger: () => void): Promise<void> {
    if (!isTauri) return;
    await register(shortcut, (event) => {
      if (event.state === 'Pressed') onTrigger();
    });
  },

  /** 注销指定全局快捷键 */
  async unregisterShortcut(shortcut: string): Promise<void> {
    if (!isTauri || !shortcut) return;
    try {
      await unregister(shortcut);
    } catch (e) {
      console.error('[TauriService] unregisterShortcut:', e);
    }
  },

  /** 注销所有全局快捷键 */
  async unregisterAllShortcuts(): Promise<void> {
    if (!isTauri) return;
    try {
      await unregisterAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('not allowed') && !msg.includes('allow-unregister-all')) {
        console.error('[TauriService] unregisterAllShortcuts:', e);
      }
    }
  },

  // ──────────────────────────── 全局快捷键处理 ────────────────────────────

  async handleGlobalShortcut(placement?: WindowPlacementSettings): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('handle_global_shortcut', {
      window: win(),
      placement: placement
        ? { mode: placement.mode, customX: placement.customX, customY: placement.customY }
        : undefined,
    });
  },

  // ──────────────────────────── 文件操作 ────────────────────────────

  /** 使用系统默认程序打开路径/文件 */
  async openPath(path: string): Promise<void> {
    if (!isTauri) return;
    await openPath(path);
  },

  /** 使用后端命令打开文件 */
  openFile: (path: string) =>
    ipcVoid('open_file', { path }),

  /** 在文件管理器中打开文件所在位置 */
  openFileLocation: (path: string) =>
    ipcVoid('open_file_location', { path }),

  /** 获取文件扩展名对应的系统图标（base64 PNG） */
  getFileIcon: (pathOrExt: string) =>
    ipcSafe<string | null>('get_file_icon', { input: pathOrExt }, null),

  /** 选择目录 */
  async selectDirectory(): Promise<string | null> {
    if (!isTauri) return null;
    const selected = await open({ directory: true, multiple: false });
    return Array.isArray(selected) ? (selected[0] ?? null) : selected;
  },

  // ──────────────────────────── 存储 & 数据库信息 ────────────────────────────

  /** 获取图片目录信息（路径 + 占用大小 + 文件数） */
  getImagesDirInfo: (customDir?: string, recursive = false) =>
    ipc<{ path: string; total_size: number; file_count: number } | null>(
      'get_images_dir_info',
      { customDir: customDir || null, recursive },
    ),

  /** 获取数据库信息（路径 + 文件大小） */
  getDbInfo: () =>
    ipc<{ path: string; size: number } | null>('db_get_info'),

  /** 移动数据库到新目录（空字符串表示重置为默认路径） */
  moveDatabase: (newDir: string) =>
    ipc<{ path: string; size: number } | null>('db_move_database', { newDir }),
};

