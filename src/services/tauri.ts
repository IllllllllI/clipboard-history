import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, PhysicalPosition } from '@tauri-apps/api/window';
import { readText, readImage } from '@tauri-apps/plugin-clipboard-manager';
import { register, unregister, unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { Image } from '@tauri-apps/api/image';
import { open } from '@tauri-apps/plugin-dialog';
import { open as openPath } from '@tauri-apps/plugin-shell';
import type { ImageAdvancedConfig, ImagePerformanceProfile } from '../types';

export const isTauri = !!(window as any).__TAURI_INTERNALS__;

// ============================================================================
// 错误处理 — 服务层只打印日志，不做 toast 等 UI 操作
// ============================================================================

/** 格式化错误消息 */
const toMsg = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/**
 * 记录错误日志并重新抛出。
 * 调用方（Context / Hook）决定如何向用户呈现错误。
 */
function logAndThrow(context: string, error: unknown): never {
  console.error(`[TauriService] ${context}:`, error);
  throw error;
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

  async handleGlobalShortcut(): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('handle_global_shortcut', { window: getCurrentWindow() });
  },

  // ── 剪贴板读写 ──

  async readClipboard(): Promise<string | null> {
    if (!isTauri) return null;
    try {
      return await readText();
    } catch {
      // 读取失败是常见情况（如剪贴板中只有图片），静默返回 null
      return null;
    }
  },

  async readImage(): Promise<Image | null> {
    if (!isTauri) return null;
    try {
      return await readImage();
    } catch {
      return null;
    }
  },

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

  /** 从剪贴板读取文件列表 (CF_HDROP on Windows) */
  async readClipboardFiles(): Promise<string[] | null> {
    if (!isTauri) return null;
    try {
      return await invoke<string[]>('read_clipboard_files');
    } catch {
      // 无文件列表是常见情况，静默返回 null
      return null;
    }
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

  async saveClipboardSvg(saveDir?: string): Promise<string | null> {
    if (!isTauri) return null;
    try {
      return await invoke<string | null>('save_clipboard_svg', { customDir: saveDir || null });
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
  async downloadAndCopyImage(url: string): Promise<void> {
    if (!isTauri) return;
    await invoke<void>('download_and_copy_image', { url });
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
      console.error('[TauriService] Cleanup shortcut error:', e);
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
      return await invoke<string>('get_file_icon', { input: pathOrExt });
    } catch {
      return null;
    }
  },

  /** 选择目录 */
  async selectDirectory(): Promise<string | null> {
    if (!isTauri) return null;
    const selected = await open({ directory: true, multiple: false });
    return selected as string | null;
  },

  // ── 存储 & 数据库信息 ──

  /** 获取图片目录信息（路径 + 占用大小 + 文件数） */
  async getImagesDirInfo(customDir?: string): Promise<{ path: string; total_size: number; file_count: number } | null> {
    if (!isTauri) return null;
    return await invoke<{ path: string; total_size: number; file_count: number }>('get_images_dir_info', { customDir: customDir || null });
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
