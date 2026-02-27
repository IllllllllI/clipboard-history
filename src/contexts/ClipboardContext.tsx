/**
 * 剪贴板 Context
 *
 * 管理剪贴板历史记录、监听、复制操作。
 * 从 AppContext 拆分，使操作相关的状态变更不影响 UI/设置组件。
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { ClipItem, AppSettings, Tag } from '../types';
import { ClipboardDB } from '../services/db';
import { isTauri } from '../services/tauri';
import { useClipboard } from '../hooks/useClipboard';
import { useStats } from '../hooks/useStats';
import { AppStats } from '../types';
import { downloadJSON } from '../utils/download';

// ============================================================================
// 类型
// ============================================================================

/** importData 的结果 — null 表示成功，string 表示失败原因 */
export type ImportError = string | null;

export interface ClipboardContextValue {
  history: ClipItem[];
  tags: Tag[];
  loadHistory: () => Promise<void>;
  loadTags: () => Promise<void>;
  copyToClipboard: (item: ClipItem) => Promise<void>;
  copyText: (text: string) => Promise<void>;
  copiedId: number | null;
  stats: AppStats;
  handleTogglePin: (item: ClipItem) => Promise<void>;
  handleToggleFavorite: (item: ClipItem) => Promise<void>;
  handleRemove: (id: number) => Promise<void>;
  handleClearAll: () => Promise<void>;
  handleSaveSnippet: (text: string) => Promise<void>;
  handleUpdateClip: (id: number, text: string) => Promise<void>;
  handleUpdatePickedColor: (id: number, color: string | null) => Promise<void>;

  // 标签操作
  handleCreateTag: (name: string, color: string | null) => Promise<void>;
  handleUpdateTag: (id: number, name: string, color: string | null) => Promise<void>;
  handleDeleteTag: (id: number) => Promise<void>;
  handleAddTagToItem: (itemId: number, tagId: number) => Promise<void>;
  handleRemoveTagFromItem: (itemId: number, tagId: number) => Promise<void>;

  exportData: () => void;
  importData: (e: React.ChangeEvent<HTMLInputElement>) => Promise<ImportError>;
  error: string | null;
}

// ============================================================================
// Context
// ============================================================================

const ClipboardContext = createContext<ClipboardContextValue | null>(null);

export function useClipboardContext(): ClipboardContextValue {
  const ctx = useContext(ClipboardContext);
  if (!ctx) throw new Error('useClipboardContext 必须在 ClipboardProvider 内使用');
  return ctx;
}

// ============================================================================
// 错误工具
// ============================================================================

const toMsg = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/** 包装 async handler，统一捕获错误并写入 setError */
function makeHandler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<void>,
  setError: React.Dispatch<React.SetStateAction<string | null>>,
  label: string,
): (...args: Args) => Promise<void> {
  return async (...args: Args) => {
    try {
      await fn(...args);
    } catch (err) {
      setError(`${label}: ${toMsg(err)}`);
    }
  };
}

// ============================================================================
// Provider
// ============================================================================

export function ClipboardProvider({
  settings,
  children,
}: {
  settings: AppSettings;
  children: React.ReactNode;
}) {
  const [history, setHistory] = useState<ClipItem[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { stats, updateStats } = useStats();

  const loadHistory = useCallback(async () => {
    const result = await ClipboardDB.getHistory(settings.maxItems);
    setHistory(result);
    updateStats();
  }, [settings.maxItems, updateStats]);

  const loadTags = useCallback(async () => {
    const result = await ClipboardDB.getTags();
    setTags(result);
  }, []);

  // 初始化：自动清理过期条目 + 加载历史 + 加载标签
  useEffect(() => {
    if (!isTauri) return;
    ClipboardDB.init(settings.autoClearDays)
      .then(() => {
        loadHistory();
        loadTags();
      })
      .catch(err => setError('数据库自动清理失败: ' + toMsg(err)));
  }, [settings.autoClearDays, loadHistory, loadTags]);

  // 剪贴板监听 & 复制（注入 setError 实现错误上报）
  const handleClipboardError = useCallback((msg: string) => setError(msg), []);
  const { copyToClipboard, copyText, copiedId } = useClipboard(settings, loadHistory, handleClipboardError);

  // --- 带错误处理的 handlers ---

  const handleTogglePin = useMemo(
    () => makeHandler(
      async (item: ClipItem) => { await ClipboardDB.togglePin(item.id, item.is_pinned); await loadHistory(); },
      setError, '切换置顶失败',
    ), [loadHistory],
  );

  const handleToggleFavorite = useMemo(
    () => makeHandler(
      async (item: ClipItem) => { await ClipboardDB.toggleFavorite(item.id, item.is_favorite); await loadHistory(); },
      setError, '切换收藏失败',
    ), [loadHistory],
  );

  const handleRemove = useMemo(
    () => makeHandler(
      async (id: number) => { await ClipboardDB.deleteClip(id); await loadHistory(); },
      setError, '删除失败',
    ), [loadHistory],
  );

  const handleClearAll = useMemo(
    () => makeHandler(
      async () => { await ClipboardDB.clearAll(); await loadHistory(); },
      setError, '清空失败',
    ), [loadHistory],
  );

  const handleSaveSnippet = useMemo(
    () => makeHandler(
      async (text: string) => { await ClipboardDB.addClip(text, 1); await loadHistory(); },
      setError, '保存代码片段失败',
    ), [loadHistory],
  );

  const handleUpdateClip = useMemo(
    () => makeHandler(
      async (id: number, text: string) => { await ClipboardDB.updateClip(id, text); await loadHistory(); },
      setError, '更新条目失败',
    ), [loadHistory],
  );

  const handleUpdatePickedColor = useMemo(
    () => makeHandler(
      async (id: number, color: string | null) => { await ClipboardDB.updatePickedColor(id, color); await loadHistory(); },
      setError, '更新调色板颜色失败',
    ), [loadHistory],
  );

  const handleCreateTag = useMemo(
    () => makeHandler(
      async (name: string, color: string | null) => { await ClipboardDB.createTag(name, color); await loadTags(); },
      setError, '创建标签失败',
    ), [loadTags],
  );

  const handleUpdateTag = useMemo(
    () => makeHandler(
      async (id: number, name: string, color: string | null) => {
        await ClipboardDB.updateTag(id, name, color);
        await loadTags();
        await loadHistory();
      },
      setError, '更新标签失败',
    ), [loadTags, loadHistory],
  );

  const handleDeleteTag = useMemo(
    () => makeHandler(
      async (id: number) => {
        await ClipboardDB.deleteTag(id);
        await loadTags();
        await loadHistory();
      },
      setError, '删除标签失败',
    ), [loadTags, loadHistory],
  );

  const handleAddTagToItem = useMemo(
    () => makeHandler(
      async (itemId: number, tagId: number) => { await ClipboardDB.addTagToItem(itemId, tagId); await loadHistory(); },
      setError, '添加标签失败',
    ), [loadHistory],
  );

  const handleRemoveTagFromItem = useMemo(
    () => makeHandler(
      async (itemId: number, tagId: number) => { await ClipboardDB.removeTagFromItem(itemId, tagId); await loadHistory(); },
      setError, '移除标签失败',
    ), [loadHistory],
  );

  // --- 导入导出 ---

  const exportData = useCallback(() => {
    downloadJSON(history, 'clipboard-master-export');
  }, [history]);

  const importData = useCallback(async (e: React.ChangeEvent<HTMLInputElement>): Promise<ImportError> => {
    const file = e.target.files?.[0];
    if (!file) return '未选择文件';

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const imported = JSON.parse(event.target?.result as string);
          if (!Array.isArray(imported)) {
            resolve('文件内容不是数组格式');
            return;
          }
          await ClipboardDB.importData(imported);
          await loadHistory();
          resolve(null);
        } catch (err) {
          resolve(`解析失败: ${toMsg(err)}`);
        }
      };
      reader.onerror = () => resolve('文件读取失败');
      reader.readAsText(file);
    });
  }, [loadHistory]);

  // --- Provider value（useMemo 避免每次渲染创建新对象引用）---

  const value = useMemo<ClipboardContextValue>(() => ({
    history, tags,
    loadHistory, loadTags,
    copyToClipboard, copyText, copiedId,
    stats,
    handleTogglePin, handleToggleFavorite, handleRemove, handleClearAll,
    handleSaveSnippet, handleUpdateClip,
    handleUpdatePickedColor,
    handleCreateTag, handleUpdateTag, handleDeleteTag,
    handleAddTagToItem, handleRemoveTagFromItem,
    exportData, importData,
    error,
  }), [
    history, tags,
    loadHistory, loadTags,
    copyToClipboard, copyText, copiedId,
    stats,
    handleTogglePin, handleToggleFavorite, handleRemove, handleClearAll,
    handleSaveSnippet, handleUpdateClip,
    handleUpdatePickedColor,
    handleCreateTag, handleUpdateTag, handleDeleteTag,
    handleAddTagToItem, handleRemoveTagFromItem,
    exportData, importData,
    error,
  ]);

  return (
    <ClipboardContext.Provider value={value}>
      {children}
    </ClipboardContext.Provider>
  );
}
