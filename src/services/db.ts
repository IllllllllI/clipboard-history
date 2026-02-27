import { invoke } from '@tauri-apps/api/core';
import { ClipItem, AppStats, Tag } from '../types';

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
    ipcVoid('db_auto_clear', { autoClearDays }),

  getStats: () =>
    ipc<AppStats>('db_get_stats'),

  getHistory: (limit: number) =>
    ipc<ClipItem[]>('db_get_history', { limit }),

  addClip: (text: string, isSnippet = 0) => {
    if (!text.trim()) return Promise.resolve();
    return ipcVoid('db_add_clip', { text, isSnippet });
  },

  addClipAndGet: (text: string, isSnippet = 0) => {
    if (!text.trim()) return Promise.resolve<ClipItem | null>(null);
    return ipc<ClipItem | null>('db_add_clip_and_get', { text, isSnippet });
  },

  togglePin: (id: number, currentPinned: number) =>
    ipcVoid('db_toggle_pin', { id, currentPinned }),

  toggleFavorite: (id: number, currentFavorite: number) =>
    ipcVoid('db_toggle_favorite', { id, currentFavorite }),

  deleteClip: (id: number) =>
    ipcVoid('db_delete_clip', { id }),

  updateClip: (id: number, newText: string) =>
    ipcVoid('db_update_clip', { id, newText }),

  updatePickedColor: (id: number, color: string | null) =>
    ipcVoid('db_update_picked_color', { id, color }),

  clearAll: () =>
    ipcVoid('db_clear_all'),

  importData: (items: unknown[]) =>
    ipcVoid('db_import_data', { items }),

  // ── 标签管理 ──

  getTags: () =>
    ipc<Tag[]>('db_get_tags'),

  createTag: (name: string, color: string | null) =>
    ipc<Tag>('db_create_tag', { name, color }),

  updateTag: (id: number, name: string, color: string | null) =>
    ipcVoid('db_update_tag', { id, name, color }),

  deleteTag: (id: number) =>
    ipcVoid('db_delete_tag', { id }),

  addTagToItem: (itemId: number, tagId: number) =>
    ipcVoid('db_add_tag_to_item', { itemId, tagId }),

  removeTagFromItem: (itemId: number, tagId: number) =>
    ipcVoid('db_remove_tag_from_item', { itemId, tagId }),
};