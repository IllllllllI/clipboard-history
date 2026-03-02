import { TauriService } from './tauri';
import { ImageType } from '../types';
import { decodeFileList, detectContentType, detectImageType, isFileList, normalizeFilePath } from '../utils';

export type CopyStrategyKind =
  | 'file-list'
  | 'base64-image'
  | 'http-image'
  | 'svg-file'
  | 'local-image'
  | 'file-path'
  | 'text';

export function resolveCopyStrategy(text: string): CopyStrategyKind {
  if (isFileList(text)) return 'file-list';
  if (text.startsWith('data:image/')) return 'base64-image';
  if (detectImageType(text) === ImageType.HttpUrl) return 'http-image';
  if (/\.svg$/i.test(text) && (text.includes('/') || text.includes('\\'))) return 'svg-file';
  if (detectImageType(text) === ImageType.LocalFile) return 'local-image';
  if (detectContentType(text) === 'file') return 'file-path';
  return 'text';
}

export async function executeCopyStrategy(kind: CopyStrategyKind, text: string): Promise<void> {
  switch (kind) {
    case 'file-list': {
      const files = decodeFileList(text);
      if (files.length > 0) {
        await TauriService.copyFilesToClipboard(files);
      }
      return;
    }
    case 'base64-image':
      await TauriService.writeImageBase64(text);
      return;
    case 'http-image': {
      const requestId = TauriService.createImageDownloadRequestId();
      try {
        await TauriService.downloadAndCopyImage(text, requestId);
      } catch {
        await TauriService.writeClipboard(text);
      }
      return;
    }
    case 'svg-file':
      await TauriService.copySvgFromFile(text);
      return;
    case 'local-image': {
      const normalizedPath = normalizeFilePath(text);
      try {
        await TauriService.copyLocalImage(normalizedPath);
      } catch {
        await TauriService.copyImageFromFile(normalizedPath);
      }
      return;
    }
    case 'file-path':
      await TauriService.writeClipboard(text);
      return;
    case 'text':
      await TauriService.writeClipboard(text);
      return;
  }
}

export async function dispatchCopyByStrategy(text: string): Promise<void> {
  const strategy = resolveCopyStrategy(text);
  await executeCopyStrategy(strategy, text);
}
