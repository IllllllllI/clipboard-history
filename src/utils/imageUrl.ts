/**
 * 图片 URL 解析与规范化工具模块
 *
 * 统一管理图片路径的解析、分类、格式化，消除组件间的重复逻辑。
 */

import { convertFileSrc } from '@tauri-apps/api/core';

const DATA_IMAGE_PREFIX = 'data:image/';

/** 支持的图片扩展名 */
export const IMAGE_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.bmp',
  '.webp', '.svg', '.ico', '.tiff', '.tif',
] as const;

/**
 * 判断路径是否为本地文件路径
 */
export function isLocalFilePath(text: string): boolean {
  return (
    text.startsWith('file://') ||
    text.startsWith('\\\\') ||
    text.startsWith('/') ||
    /^[a-zA-Z]:\\/.test(text)
  );
}

/**
 * 将任意图片来源（data URL / 本地路径 / HTTP URL）转为可渲染的 src
 */
export function resolveImageSrc(url: string): string {
  if (url.startsWith(DATA_IMAGE_PREFIX)) {
    return url;
  }
  if (isLocalFilePath(url)) {
    const path = url.replace(/^file:\/\//, '');
    return convertFileSrc(path);
  }
  return url;
}

/** 已知图片扩展名白名单 */
const KNOWN_IMAGE_EXTS = new Set([
  'PNG', 'JPG', 'JPEG', 'GIF', 'BMP', 'WEBP', 'AVIF',
  'SVG', 'ICO', 'TIFF', 'TIF', 'HEIC', 'HEIF', 'APNG', 'JXL',
]);

/**
 * 从路径或 URL 中提取图片格式标签（用于 UI 展示）。
 * 仅在能识别出有效图片格式时返回标签，否则返回 null。
 */
export function extractFormatLabel(url: string): string | null {
  // Base64: 从 MIME 类型中提取
  if (url.startsWith(DATA_IMAGE_PREFIX)) {
    const match = url.match(/^data:image\/([\w+]+);/);
    if (match) {
      const fmt = match[1].toUpperCase().replace('SVG+XML', 'SVG');
      return fmt; // MIME 类型本身可信
    }
    return null;
  }

  // URL / 路径: 尝试从最后一个 . 后提取扩展名
  try {
    // 先用 URL 解析去掉 query/hash
    const pathname = url.includes('://') ? new URL(url).pathname : url;
    const lastSegment = pathname.split('/').pop() || '';
    const dotIdx = lastSegment.lastIndexOf('.');
    if (dotIdx >= 0) {
      const ext = lastSegment.slice(dotIdx + 1).toUpperCase();
      if (KNOWN_IMAGE_EXTS.has(ext)) return ext;
    }
  } catch {
    // URL 解析失败时直接用简单逻辑
    const normalized = url.split('#')[0].split('?')[0];
    const ext = normalized.split('.').pop()?.toUpperCase();
    if (ext && KNOWN_IMAGE_EXTS.has(ext)) return ext;
  }

  return null;
}

/**
 * 格式化字节数为可读字符串（如 "1.5 MB"）
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Bytes';
  const k = 1024;
  const dm = Math.max(0, decimals);
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
