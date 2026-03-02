import { useEffect, useRef, useState, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { ClipboardDB } from '../services/db';
import { TauriService, isTauri } from '../services/tauri';
import { dispatchCopyByStrategy } from '../services/copyRouter';
import { ClipItem, AppSettings } from '../types';
import { COPY_FEEDBACK_DURATION_MS } from '../constants';

/** 后端发送的剪贴板变化事件负载 */
interface ClipboardEventPayload {
  source: 'external' | 'internal';
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
  const copiedIdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    let disposed = false;
    let unlistenFn: (() => void) | null = null;

    const unlistenPromise = listen<ClipboardEventPayload>('clipboard-changed', async (event) => {
      if (event.payload?.source !== 'external') return;

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        void processClipboardSnapshot();
      }, 120);
    });

    void unlistenPromise.then((fn) => {
      if (disposed) {
        fn();
        return;
      }
      unlistenFn = fn;
    });

    return () => {
      disposed = true;
      if (unlistenFn) {
        unlistenFn();
      }
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [settings.autoCapture, processClipboardSnapshot]);

  useEffect(() => {
    return () => {
      if (copiedIdTimerRef.current) {
        clearTimeout(copiedIdTimerRef.current);
      }
    };
  }, []);

  // ---- 复制操作（useCallback 稳定引用）----

  const copyToClipboard = useCallback(async (
    item: ClipItem,
    options?: { suppressCopiedIdFeedback?: boolean },
  ) => {
    try {
      // 如果条目有调色板选中的颜色，优先复制该颜色
      const textToCopy = item.picked_color || item.text;
      lastCopiedRef.current = textToCopy;
      await dispatchCopyByStrategy(textToCopy);

      if (!options?.suppressCopiedIdFeedback) {
        setCopiedId(item.id);
        if (copiedIdTimerRef.current) {
          clearTimeout(copiedIdTimerRef.current);
        }
        copiedIdTimerRef.current = setTimeout(() => {
          setCopiedId(null);
          copiedIdTimerRef.current = null;
        }, COPY_FEEDBACK_DURATION_MS);
      }
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
