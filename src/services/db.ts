import { invoke } from '@tauri-apps/api/core';
import { ClipItem, AppStats, Tag } from '../types';

const DB_COMMANDS = {
  autoClear: 'db_auto_clear',
  getStats: 'db_get_stats',
  getHistory: 'db_get_history',
  addClip: 'db_add_clip',
  addClipAndGet: 'db_add_clip_and_get',
  togglePin: 'db_toggle_pin',
  toggleFavorite: 'db_toggle_favorite',
  deleteClip: 'db_delete_clip',
  updateClip: 'db_update_clip',
  updatePickedColor: 'db_update_picked_color',
  clearAll: 'db_clear_all',
  importData: 'db_import_data',
  getTags: 'db_get_tags',
  createTag: 'db_create_tag',
  updateTag: 'db_update_tag',
  deleteTag: 'db_delete_tag',
  addTagToItem: 'db_add_tag_to_item',
  removeTagFromItem: 'db_remove_tag_from_item',
} as const;

const hasNonWhitespaceText = (value: string): boolean => value.trim().length > 0;

// ============================================================================
// IPC 调用封装 — 统一错误处理，消除样板代码
// ============================================================================

/**
 * 统一 invoke 包装器。
 * - 成功：返回结果
 * - 失败：打印日志 + 重新抛出（由调用方决定如何呈现错误）
 *
 * 设计原则：数据层只负责日志记录和抛出，不做 toast 等 UI 操作。
 */
async function ipc<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.error(`[ClipboardDB] ${cmd} failed:`, err);
    throw err;
  }
}

/** 无返回值的 IPC 调用 */
async function ipcVoid(cmd: string, args?: Record<string, unknown>): Promise<void> {
  await ipc<void>(cmd, args);
}

// ============================================================================
// ClipboardDB API — 通过 Tauri IPC 调用 Rust 后端
// ============================================================================

export const ClipboardDB = {
  /**
   * 初始化数据库（自动清理过期条目）
   * 数据库 Schema 由 Rust 后端在 setup 阶段创建，
   * 此方法仅触发按天数的自动清理。
   */
  init: (autoClearDays: number) =>
    ipcVoid(DB_COMMANDS.autoClear, { autoClearDays }),

  getStats: () =>
    ipc<AppStats>(DB_COMMANDS.getStats),

  getHistory: (limit: number) =>
    ipc<ClipItem[]>(DB_COMMANDS.getHistory, { limit }),

  addClip: (text: string, isSnippet = 0) => {
    if (!hasNonWhitespaceText(text)) return Promise.resolve();
    return ipcVoid(DB_COMMANDS.addClip, { text, isSnippet });
  },

  addClipAndGet: (text: string, isSnippet = 0) => {
    if (!hasNonWhitespaceText(text)) return Promise.resolve<ClipItem | null>(null);
    return ipc<ClipItem | null>(DB_COMMANDS.addClipAndGet, { text, isSnippet });
  },

  togglePin: (id: number, currentPinned: number) =>
    ipcVoid(DB_COMMANDS.togglePin, { id, currentPinned }),

  toggleFavorite: (id: number, currentFavorite: number) =>
    ipcVoid(DB_COMMANDS.toggleFavorite, { id, currentFavorite }),

  deleteClip: (id: number) =>
    ipcVoid(DB_COMMANDS.deleteClip, { id }),

  updateClip: (id: number, newText: string) =>
    ipcVoid(DB_COMMANDS.updateClip, { id, newText }),

  updatePickedColor: (id: number, color: string | null) =>
    ipcVoid(DB_COMMANDS.updatePickedColor, { id, color }),

  clearAll: () =>
    ipcVoid(DB_COMMANDS.clearAll),

  importData: (items: unknown[]) =>
    ipcVoid(DB_COMMANDS.importData, { items }),

  // ── 标签管理 ──

  getTags: () =>
    ipc<Tag[]>(DB_COMMANDS.getTags),

  createTag: (name: string, color: string | null) =>
    ipc<Tag>(DB_COMMANDS.createTag, { name, color }),

  updateTag: (id: number, name: string, color: string | null) =>
    ipcVoid(DB_COMMANDS.updateTag, { id, name, color }),

  deleteTag: (id: number) =>
    ipcVoid(DB_COMMANDS.deleteTag, { id }),

  addTagToItem: (itemId: number, tagId: number) =>
    ipcVoid(DB_COMMANDS.addTagToItem, { itemId, tagId }),

  removeTagFromItem: (itemId: number, tagId: number) =>
    ipcVoid(DB_COMMANDS.removeTagFromItem, { itemId, tagId }),
};