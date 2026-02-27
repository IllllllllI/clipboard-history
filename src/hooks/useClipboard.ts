import { useEffect, useRef, useState, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { ClipboardDB } from '../services/db';
import { TauriService, isTauri } from '../services/tauri';
import { ClipItem, AppSettings, ImageType } from '../types';
import { encodeFileList, isFileList, detectImageType, normalizeFilePath } from '../utils';

/** 后端发送的剪贴板变化事件负载 */
interface ClipboardEventPayload {
  source: 'external' | 'internal';
}

// ============================================================================
// 剪贴板内容读取管道（扁平化，消除深层嵌套）
// ============================================================================

/** 按优先级依次尝试读取剪贴板内容，首个成功即返回 */
async function readClipboardContent(imagesDir?: string): Promise<string | null> {
  // 1) 文件列表 (CF_HDROP on Windows)
  const files = await TauriService.readClipboardFiles();
  if (files && files.length > 0) return encodeFileList(files);

  // 2) 图片
  const imagePath = await TauriService.saveClipboardImage(imagesDir);
  if (imagePath) return imagePath;

  // 3) SVG
  const svgPath = await TauriService.saveClipboardSvg(imagesDir);
  if (svgPath) return svgPath;

  // 4) 纯文本
  try {
    return await TauriService.readClipboard();
  } catch {
    return null;
  }
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
  onUpdate: () => void,
  onError: (msg: string) => void,
) {
  const lastCopiedRef = useRef<string | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // ---- 剪贴板监听 ----

  useEffect(() => {
    if (!isTauri || !settings.autoCapture) return;

    const unlisten = listen<ClipboardEventPayload>('clipboard-changed', async (event) => {
      if (event.payload?.source !== 'external') return;

      try {
        const text = await readClipboardContent(settings.imagesDir);
        if (text && text !== lastCopiedRef.current) {
          await ClipboardDB.addClip(text);
          onUpdate();
        }

        // 清除前一个定时器，避免竞态
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(() => {
          if (lastCopiedRef.current === text) {
            lastCopiedRef.current = null;
          }
        }, 1000);
      } catch (err) {
        onError(`读取剪贴板失败: ${toMsg(err)}`);
      }
    });

    return () => {
      unlisten.then(f => f());
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [settings.autoCapture, settings.imagesDir, onUpdate]);

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
