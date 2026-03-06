import { useEffect, useRef, useState, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { ClipboardDB } from '../services/db';
import { TauriService, isTauri } from '../services/tauri';
import { dispatchCopyByStrategy } from '../services/copyRouter';
import type { ClipItem, AppSettings } from '../types';
import { COPY_FEEDBACK_DURATION_MS } from '../constants';

/** 后端发送的剪贴板变化事件负载 */
interface ClipboardEventPayload {
  source: 'external' | 'internal';
}

// ============================================================================
// 常量
// ============================================================================

/** 自身复制操作后抑制捕获的窗口期 */
const DEDUP_RESET_MS = 1_000;

/** 错误信息提取 */
const toMsg = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

// ============================================================================
// Hook
// ============================================================================

export function useClipboard(
  settings: AppSettings,
  onCaptured: (item: ClipItem) => void | Promise<void>,
  onError: (msg: string) => void,
) {
  // ── Ref 持有最新值：回调 / 配置变更时不会重新注册 Tauri 事件监听器 ──
  const onCapturedRef = useRef(onCaptured);
  onCapturedRef.current = onCaptured;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const imagesDirRef = useRef(settings.imagesDir);
  imagesDirRef.current = settings.imagesDir;
  const debounceIntervalRef = useRef(settings.clipboardEventMinIntervalMs);
  debounceIntervalRef.current = settings.clipboardEventMinIntervalMs;

  /** 最近一次自身发起的复制内容——用于去重，避免自身操作触发重复捕获 */
  const selfCopyRef = useRef<string | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedIdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessingRef = useRef(false);
  const hasPendingRef = useRef(false);

  const [copiedId, setCopiedId] = useState<number | null>(null);

  // ── 核心：读取剪贴板快照并入库 ──

  const processSnapshot = useCallback(async () => {
    if (isProcessingRef.current) {
      hasPendingRef.current = true;
      return;
    }
    isProcessingRef.current = true;

    try {
      do {
        hasPendingRef.current = false;

        const snapshot = await TauriService.captureClipboardSnapshot(imagesDirRef.current);
        if (snapshot && snapshot.text && snapshot.text !== selfCopyRef.current) {
          const inserted = await ClipboardDB.addClipSnapshot(snapshot);
          if (inserted) await onCapturedRef.current(inserted);
        }

        // 去重窗口持续到最后一次快照后 DEDUP_RESET_MS
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        const snapshotText = snapshot?.text ?? null;
        resetTimerRef.current = setTimeout(() => {
          if (selfCopyRef.current === snapshotText) selfCopyRef.current = null;
        }, DEDUP_RESET_MS);
      } while (hasPendingRef.current);
    } catch (err) {
      onErrorRef.current(`读取剪贴板失败: ${toMsg(err)}`);
    } finally {
      isProcessingRef.current = false;
    }
  }, []); // 零依赖 — 全部通过 ref 读取最新值

  // ── 事件监听 ──

  useEffect(() => {
    if (!isTauri || !settings.autoCapture) return;

    let disposed = false;
    let unlistenFn: (() => void) | null = null;

    const unlistenPromise = listen<ClipboardEventPayload>('clipboard-changed', (event) => {
      if (event.payload?.source !== 'external') return;

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        void processSnapshot();
      }, debounceIntervalRef.current);
    });

    void unlistenPromise.then((fn) => {
      if (disposed) { fn(); return; }
      unlistenFn = fn;
    });

    return () => {
      disposed = true;
      unlistenFn?.();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [settings.autoCapture, processSnapshot]);

  // copiedId 反馈定时器清理
  useEffect(() => () => {
    if (copiedIdTimerRef.current) clearTimeout(copiedIdTimerRef.current);
  }, []);

  // ── 复制操作 ──

  const copyToClipboard = useCallback(async (
    item: ClipItem,
    options?: { suppressCopiedIdFeedback?: boolean },
  ) => {
    try {
      const textToCopy = item.picked_color || item.text;
      selfCopyRef.current = textToCopy;
      await dispatchCopyByStrategy(textToCopy);

      if (!options?.suppressCopiedIdFeedback) {
        setCopiedId(item.id);
        if (copiedIdTimerRef.current) clearTimeout(copiedIdTimerRef.current);
        copiedIdTimerRef.current = setTimeout(() => {
          setCopiedId(null);
          copiedIdTimerRef.current = null;
        }, COPY_FEEDBACK_DURATION_MS);
      }
    } catch (err) {
      onErrorRef.current(`复制失败: ${toMsg(err)}`);
    }
  }, []);

  const copyText = useCallback(async (text: string) => {
    try {
      selfCopyRef.current = text;
      await TauriService.writeClipboard(text);
    } catch (err) {
      onErrorRef.current(`复制文本失败: ${toMsg(err)}`);
    }
  }, []);

  return { copyToClipboard, copyText, copiedId } as const;
}
