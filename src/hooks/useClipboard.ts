import { useEffect, useRef, useState, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { ClipboardDB } from '../services/db';
import { TauriService, isTauri } from '../services/tauri';
import { ClipItem, AppSettings, ImageType } from '../types';
import { isFileList, detectImageType, normalizeFilePath } from '../utils';

/** 后端发送的剪贴板变化事件负载 */
interface ClipboardEventPayload {
  source: 'external' | 'internal';
}

// ============================================================================
// 复制策略表（消除 if/else 链，复用项目工具函数）
// ============================================================================

/** 剪贴板写入策略：按内容类型分派到不同 TauriService 方法 */
const COPY_STRATEGIES: {
  match: (text: string) => boolean;
  action: (text: string) => Promise<void>;
}[] = [
  {
    // 文件列表
    match: isFileList,
    action: async (text) => {
      const files = text.slice('[FILES]\n'.length).split('\n').filter(Boolean);
      if (files.length > 0) await TauriService.copyFileToClipboard(files[0]);
    },
  },
  {
    // Base64 图片
    match: (text) => text.startsWith('data:image/'),
    action: (text) => TauriService.writeImageBase64(text),
  },
  {
    // SVG 文件路径
    match: (text) => /\.svg$/i.test(text) && (text.includes('/') || text.includes('\\')),
    action: (text) => TauriService.copySvgFromFile(text),
  },
  {
    // 本地图片文件路径（使用项目工具函数）
    match: (text) => detectImageType(text) === ImageType.LocalFile,
    action: (text) => TauriService.copyImageFromFile(normalizeFilePath(text)),
  },
  {
    // 纯文本（兜底）
    match: () => true,
    action: (text) => TauriService.writeClipboard(text),
  },
];

/** 根据内容类型执行对应的复制策略 */
async function dispatchCopy(text: string): Promise<void> {
  const strategy = COPY_STRATEGIES.find(s => s.match(text));
  // 兜底策略 match 永远为 true，不会返回 undefined
  await strategy!.action(text);
}

// ============================================================================
// Hook
// ============================================================================

/** 错误信息提取 */
const toMsg = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

export function useClipboard(
  settings: AppSettings,
  onCaptured: (item: ClipItem) => void | Promise<void>,
  onError: (msg: string) => void,
) {
  const lastCopiedRef = useRef<string | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessingRef = useRef(false);
  const hasPendingRef = useRef(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const processClipboardSnapshot = useCallback(async () => {
    if (isProcessingRef.current) {
      hasPendingRef.current = true;
      return;
    }

    isProcessingRef.current = true;

    try {
      do {
        hasPendingRef.current = false;

        const text = await TauriService.captureClipboardSnapshot(settings.imagesDir);
        if (text && text !== lastCopiedRef.current) {
          const inserted = await ClipboardDB.addClipAndGet(text);
          if (inserted) {
            await onCaptured(inserted);
          }
        }

        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(() => {
          if (lastCopiedRef.current === text) {
            lastCopiedRef.current = null;
          }
        }, 1000);
      } while (hasPendingRef.current);
    } catch (err) {
      onError(`读取剪贴板失败: ${toMsg(err)}`);
    } finally {
      isProcessingRef.current = false;
    }
  }, [settings.imagesDir, onCaptured, onError]);

  // ---- 剪贴板监听 ----

  useEffect(() => {
    if (!isTauri || !settings.autoCapture) return;

    const unlisten = listen<ClipboardEventPayload>('clipboard-changed', async (event) => {
      if (event.payload?.source !== 'external') return;

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        void processClipboardSnapshot();
      }, 120);
    });

    return () => {
      unlisten.then(f => f());
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [settings.autoCapture, processClipboardSnapshot]);

  // ---- 复制操作（useCallback 稳定引用）----

  const copyToClipboard = useCallback(async (item: ClipItem) => {
    try {
      // 如果条目有调色板选中的颜色，优先复制该颜色
      const textToCopy = item.picked_color || item.text;
      lastCopiedRef.current = textToCopy;
      await dispatchCopy(textToCopy);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      onError(`复制失败: ${toMsg(err)}`);
    }
  }, [onError]);

  const copyText = useCallback(async (text: string) => {
    try {
      lastCopiedRef.current = text;
      await TauriService.writeClipboard(text);
    } catch (err) {
      onError(`复制文本失败: ${toMsg(err)}`);
    }
  }, [onError]);

  return { copyToClipboard, copyText, copiedId };
}
