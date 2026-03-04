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
import { CLIPITEM_HUD_EVENTS, RADIAL_MENU_EVENTS, IMAGE_DOWNLOAD_EVENTS, WINDOW_LABELS } from '../constants/ipc';

export const isTauri = typeof window !== 'undefined' && !!(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

interface ClipItemHudPointerMoveEvent {
  screenX: number;
  screenY: number;
  button: number;
  buttons: number;
}

interface ClipItemHudPointerUpEvent {
  screenX: number;
  screenY: number;
  button: number;
}

interface RadialMenuPointerMoveEvent {
  screenX: number;
  screenY: number;
  button: number;
  buttons: number;
}

interface RadialMenuPointerUpEvent {
  screenX: number;
  screenY: number;
  button: number;
}

// ============================================================================
// 工具函数
// ============================================================================

/** 移除 file:// 前缀 */
function stripFileProtocol(path: string): string {
  return path.startsWith('file://') ? path.replace(/^file:\/\//, '') : path;
}

/**
 * 从文件复制到剪贴板的通用流程：统一调用后端命令
 */
async function copyFileViaBackend(
  path: string,
  backendCommand: string,
): Promise<void> {
  const normalized = stripFileProtocol(path);
  await invoke(backendCommand, { filePath: normalized });
}

// ============================================================================
// TauriService — 统一 Tauri API 门面
// ============================================================================

export const TauriService = {

  // ── 应用设置持久化 ──

  async getAppSettings(): Promise<Record<string, unknown> | null> {
    if (!isTauri) return null;
    return await invoke<Record<string, unknown> | null>('get_app_settings');
  },

  async setAppSettings(settings: Record<string, unknown>): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('set_app_settings', { settings });
  },

  // ── 窗口操作 ──

  async hideWindow(): Promise<void> {
    if (!isTauri) return;
    await getCurrentWindow().hide();
  },

  async showWindow(): Promise<void> {
    if (!isTauri) return;
    const window = getCurrentWindow();
    await window.unminimize();
    await window.show();
    await window.setFocus();
  },

  async getPosition(): Promise<PhysicalPosition | null> {
    if (!isTauri) return null;
    return await getCurrentWindow().outerPosition();
  },

  async setPosition(pos: PhysicalPosition | null | undefined): Promise<void> {
    if (!isTauri || !pos || pos.type == null) return;
    await getCurrentWindow().setPosition(pos);
  },

  async moveOffScreen(): Promise<void> {
    if (!isTauri) return;
    await getCurrentWindow().setPosition(new PhysicalPosition(-9999, -9999));
  },

  async showDownloadHud(): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('show_download_hud');
  },

  async hideDownloadHud(): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('hide_download_hud');
  },

  async positionDownloadHudNearCursor(): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('position_download_hud_near_cursor');
  },

  async showClipItemHud(): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('show_clipitem_hud');
  },

  async hideClipItemHud(): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('hide_clipitem_hud');
  },

  /** 检查当前系统前景窗口是否属于本应用（Windows 使用 GetForegroundWindow） */
  async isAppForegroundWindow(): Promise<boolean> {
    if (!isTauri) return true;
    return await invoke<boolean>('is_app_foreground_window');
  },

  async positionClipItemHudNearCursor(mode?: 'linear' | 'radial' | 'edge'): Promise<'horizontal' | 'vertical'> {
    if (!isTauri) return 'horizontal';
    return await invoke<'horizontal' | 'vertical'>('position_clipitem_hud_near_cursor', { mode: mode || 'edge' });
  },

  async setClipItemHudMousePassthrough(passthrough: boolean): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('set_clipitem_hud_mouse_passthrough', { passthrough });
  },

  async emitClipItemHudGlobalPointerMove(payload: ClipItemHudPointerMoveEvent): Promise<void> {
    if (!isTauri) return;
    await emitTo(WINDOW_LABELS.clipItemHud, CLIPITEM_HUD_EVENTS.globalPointerMove, payload);
  },

  async listenClipItemHudGlobalPointerMove(
    handler: (payload: ClipItemHudPointerMoveEvent) => void,
  ): Promise<UnlistenFn> {
    if (!isTauri) return () => {};
    return await listen<ClipItemHudPointerMoveEvent>(CLIPITEM_HUD_EVENTS.globalPointerMove, (event) => {
      handler(event.payload);
    });
  },

  async emitClipItemHudGlobalPointerUp(payload: ClipItemHudPointerUpEvent): Promise<void> {
    if (!isTauri) return;
    await emitTo(WINDOW_LABELS.clipItemHud, CLIPITEM_HUD_EVENTS.globalPointerUp, payload);
  },

  async listenClipItemHudGlobalPointerUp(
    handler: (payload: ClipItemHudPointerUpEvent) => void,
  ): Promise<UnlistenFn> {
    if (!isTauri) return () => {};
    return await listen<ClipItemHudPointerUpEvent>(CLIPITEM_HUD_EVENTS.globalPointerUp, (event) => {
      handler(event.payload);
    });
  },

  async emitClipItemHudSnapshot(snapshot: ClipItemHudSnapshot): Promise<void> {
    if (!isTauri) return;
    await emitTo(WINDOW_LABELS.clipItemHud, CLIPITEM_HUD_EVENTS.snapshot, snapshot);
  },

  async listenClipItemHudSnapshot(
    handler: (payload: ClipItemHudSnapshot) => void,
  ): Promise<UnlistenFn> {
    if (!isTauri) return () => {};
    return await listen<ClipItemHudSnapshot>(CLIPITEM_HUD_EVENTS.snapshot, (event) => {
      handler(event.payload);
    });
  },

  async emitClipItemHudAction(action: ClipItemHudActionEvent): Promise<void> {
    if (!isTauri) return;
    await emitTo(WINDOW_LABELS.main, CLIPITEM_HUD_EVENTS.action, action);
  },

  async listenClipItemHudAction(
    handler: (payload: ClipItemHudActionEvent) => void,
  ): Promise<UnlistenFn> {
    if (!isTauri) return () => {};
    return await listen<ClipItemHudActionEvent>(CLIPITEM_HUD_EVENTS.action, (event) => {
      handler(event.payload);
    });
  },

  // ── 径向菜单独立窗口 ──

  async showRadialMenu(): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('show_radial_menu');
  },

  async hideRadialMenu(): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('hide_radial_menu');
  },

  async positionRadialMenuAtCursor(): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('position_radial_menu_at_cursor');
  },

  async setRadialMenuMousePassthrough(passthrough: boolean): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('set_radial_menu_mouse_passthrough', { passthrough });
  },

  async emitRadialMenuGlobalPointerMove(payload: RadialMenuPointerMoveEvent): Promise<void> {
    if (!isTauri) return;
    await emitTo(WINDOW_LABELS.radialMenu, RADIAL_MENU_EVENTS.globalPointerMove, payload);
  },

  async listenRadialMenuGlobalPointerMove(
    handler: (payload: RadialMenuPointerMoveEvent) => void,
  ): Promise<UnlistenFn> {
    if (!isTauri) return () => {};
    return await listen<RadialMenuPointerMoveEvent>(RADIAL_MENU_EVENTS.globalPointerMove, (event) => {
      handler(event.payload);
    });
  },

  async emitRadialMenuGlobalPointerUp(payload: RadialMenuPointerUpEvent): Promise<void> {
    if (!isTauri) return;
    await emitTo(WINDOW_LABELS.radialMenu, RADIAL_MENU_EVENTS.globalPointerUp, payload);
  },

  async listenRadialMenuGlobalPointerUp(
    handler: (payload: RadialMenuPointerUpEvent) => void,
  ): Promise<UnlistenFn> {
    if (!isTauri) return () => {};
    return await listen<RadialMenuPointerUpEvent>(RADIAL_MENU_EVENTS.globalPointerUp, (event) => {
      handler(event.payload);
    });
  },

  async emitRadialMenuSnapshot(snapshot: RadialMenuSnapshot): Promise<void> {
    if (!isTauri) return;
    await emitTo(WINDOW_LABELS.radialMenu, RADIAL_MENU_EVENTS.snapshot, snapshot);
  },

  async listenRadialMenuSnapshot(
    handler: (payload: RadialMenuSnapshot) => void,
  ): Promise<UnlistenFn> {
    if (!isTauri) return () => {};
    return await listen<RadialMenuSnapshot>(RADIAL_MENU_EVENTS.snapshot, (event) => {
      handler(event.payload);
    });
  },

  async emitRadialMenuAction(action: RadialMenuActionEvent): Promise<void> {
    if (!isTauri) return;
    await emitTo(WINDOW_LABELS.main, RADIAL_MENU_EVENTS.action, action);
  },

  async listenRadialMenuAction(
    handler: (payload: RadialMenuActionEvent) => void,
  ): Promise<UnlistenFn> {
    if (!isTauri) return () => {};
    return await listen<RadialMenuActionEvent>(RADIAL_MENU_EVENTS.action, (event) => {
      handler(event.payload);
    });
  },

  async handleGlobalShortcut(placement?: WindowPlacementSettings): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('handle_global_shortcut', {
      window: getCurrentWindow(),
      placement: placement
        ? {
            mode: placement.mode,
            customX: placement.customX,
            customY: placement.customY,
          }
        : undefined,
    });
  },

  async listenMainWindowMoved(handler: () => void): Promise<UnlistenFn> {
    if (!isTauri) return () => {};
    return await getCurrentWindow().onMoved(() => {
      handler();
    });
  },

  // ── 剪贴板读写 ──

  /** 将文本写入剪贴板（统一由后端处理，自带 IgnoreGuard） */
  async writeClipboard(text: string): Promise<void> {
    if (isTauri) {
      await invoke<void>('write_text_to_clipboard', { text });
    } else {
      await navigator.clipboard.writeText(text);
    }
  },

  /** 将 Base64 图片写入剪贴板（统一由后端处理） */
  async writeImageBase64(base64DataUrl: string): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('copy_base64_image_to_clipboard', { data: base64DataUrl });
  },

  // ── 剪贴板图片/文件操作 ──

  async saveClipboardImage(saveDir?: string): Promise<string | null> {
    if (!isTauri) return null;
    try {
      return await invoke<string | null>('save_clipboard_image', { customDir: saveDir || null });
    } catch {
      return null;
    }
  },

  /** 单次抓取剪贴板快照：文件列表 / 图片 / SVG / 文本（后端按优先级处理） */
  async captureClipboardSnapshot(saveDir?: string): Promise<string | null> {
    if (!isTauri) return null;
    try {
      return await invoke<string | null>('capture_clipboard_snapshot', { customDir: saveDir || null });
    } catch {
      return null;
    }
  },

  async copyImageFromFile(path: string): Promise<void> {
    if (!isTauri) return;
    await copyFileViaBackend(path, 'copy_image_from_file');
  },

  async copySvgFromFile(path: string): Promise<void> {
    if (!isTauri) return;
    await copyFileViaBackend(path, 'copy_svg_from_file');
  },

  /** 下载网络图片并复制到剪贴板 */
  async downloadAndCopyImage(url: string, requestId: string): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('download_and_copy_image', { url, requestId });
  },

  async cancelImageDownload(requestId: string): Promise<boolean> {
    if (!isTauri || !requestId) return false;
    return await invoke<boolean>('cancel_image_download', { requestId });
  },

  createImageDownloadRequestId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  },

  async listenImageDownloadProgress(
    handler: (payload: ImageDownloadProgressEvent) => void,
  ): Promise<UnlistenFn> {
    if (!isTauri) return () => {};
    return await listen<ImageDownloadProgressEvent>(IMAGE_DOWNLOAD_EVENTS.progress, (event) => {
      handler(event.payload);
    });
  },

  /** 将 Base64 图片复制到剪贴板 */
  async copyBase64Image(data: string): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('copy_base64_image_to_clipboard', { data });
  },

  /** 将本地图片复制到剪贴板 */
  async copyLocalImage(path: string): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('copy_image_to_clipboard', { path });
  },

  /** 设置图片处理性能档位 */
  async setImagePerformanceProfile(profile: ImagePerformanceProfile): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('set_image_performance_profile', { profile });
  },

  /** 获取后端当前图片处理性能档位 */
  async getImagePerformanceProfile(): Promise<ImagePerformanceProfile | null> {
    if (!isTauri) return null;
    return await invoke<ImagePerformanceProfile>('get_image_performance_profile');
  },

  /** 设置图片处理高级配置 */
  async setImageAdvancedConfig(config: ImageAdvancedConfig): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('set_image_advanced_config', { config });
  },

  /** 获取后端当前图片处理高级配置 */
  async getImageAdvancedConfig(): Promise<ImageAdvancedConfig | null> {
    if (!isTauri) return null;
    return await invoke<ImageAdvancedConfig>('get_image_advanced_config');
  },

  /** 将文件路径以 CF_HDROP 格式复制到剪贴板 */
  async copyFileToClipboard(path: string): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('copy_file_to_clipboard', { path });
  },

  /** 将多个文件路径以 CF_HDROP 格式复制到剪贴板 */
  async copyFilesToClipboard(paths: string[]): Promise<void> {
    if (!isTauri || paths.length === 0) return;
    await invoke<void>('copy_files_to_clipboard', { paths });
  },

  // ── 输入模拟 ──

  async pasteText(hideOnAction: boolean): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('paste_text', { hideOnAction });
  },

  /** 模拟鼠标点击后粘贴 */
  async clickAndPaste(): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('click_and_paste');
  },

  // ── 快捷键 ──

  async registerShortcut(shortcut: string, onTrigger: () => void): Promise<void> {
    if (!isTauri) return;
    await register(shortcut, async (event) => {
      if (event.state === 'Pressed') {
        onTrigger();
      }
    });
  },

  /** 注销指定全局快捷键 */
  async unregisterShortcut(shortcut: string): Promise<void> {
    if (!isTauri || !shortcut) return;
    try {
      await unregister(shortcut);
    } catch (e) {
      console.error('[TauriService] Unregister shortcut error:', e);
    }
  },

  /** 注销所有全局快捷键 */
  async unregisterAllShortcuts(): Promise<void> {
    if (!isTauri) return;
    try {
      await unregisterAll();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const isPermissionDenied =
        message.includes('not allowed') ||
        message.includes('allow-unregister-all');

      if (!isPermissionDenied) {
        console.error('[TauriService] Cleanup shortcut error:', e);
      }
    }
  },

  // ── 文件操作 ──

  /** 使用系统默认程序打开路径/文件 */
  async openPath(path: string): Promise<void> {
    if (!isTauri) return;
    await openPath(path);
  },

  /** 使用后端命令打开文件 */
  async openFile(path: string): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('open_file', { path });
  },

  /** 在文件管理器中打开文件所在位置 */
  async openFileLocation(path: string): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('open_file_location', { path });
  },

  /** 获取文件扩展名对应的系统图标（base64 PNG） */
  async getFileIcon(pathOrExt: string): Promise<string | null> {
    if (!isTauri) return null;
    try {
      return await invoke<string | null>('get_file_icon', { input: pathOrExt });
    } catch {
      return null;
    }
  },

  /** 选择目录 */
  async selectDirectory(): Promise<string | null> {
    if (!isTauri) return null;
    const selected = await open({ directory: true, multiple: false });
    if (Array.isArray(selected)) {
      return selected[0] ?? null;
    }
    return selected;
  },

  // ── 存储 & 数据库信息 ──

  /** 获取图片目录信息（路径 + 占用大小 + 文件数） */
  async getImagesDirInfo(customDir?: string, recursive = false): Promise<{ path: string; total_size: number; file_count: number } | null> {
    if (!isTauri) return null;
    return await invoke<{ path: string; total_size: number; file_count: number }>('get_images_dir_info', {
      customDir: customDir || null,
      recursive,
    });
  },

  /** 获取数据库信息（路径 + 文件大小） */
  async getDbInfo(): Promise<{ path: string; size: number } | null> {
    if (!isTauri) return null;
    return await invoke<{ path: string; size: number }>('db_get_info');
  },

  /** 移动数据库到新目录（空字符串表示重置为默认路径） */
  async moveDatabase(newDir: string): Promise<{ path: string; size: number } | null> {
    if (!isTauri) return null;
    return await invoke<{ path: string; size: number }>('db_move_database', { newDir });
  },
};

