/**
 * 图片 URL 解析与规范化工具模块
 *
 * 统一管理图片路径的解析、分类、格式化，消除组件间的重复逻辑。
 *
 * 设计原则：
 * - `resolveImageSrc` 是本地文件路径 → Tauri asset 协议的唯一转换入口
 * - `extractFormatLabel` 使用 charCode 扫描，避免正则和临时字符串分配
 * - `KNOWN_FORMAT_LABELS` 与 imageDetect.ts 的 `IMAGE_EXT_SET` 保持同步
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import { normalizeFilePath, isLocalFilePath } from './filePath';

// ============================================================================
// 常量
// ============================================================================

const C_SLASH = 47;       // /
const C_DOT   = 46;       // .
const C_QUEST = 63;       // ?
const C_HASH  = 35;       // #

const DATA_IMAGE_PREFIX = 'data:image/';

/**
 * 已知图片格式标签（大写，用于 UI 展示）。
 *
 * 与 imageDetect.ts 的 `IMAGE_EXT_SET` 同步维护。
 */
const KNOWN_FORMAT_LABELS: ReadonlySet<string> = new Set([
  'PNG', 'JPG', 'JPEG', 'GIF', 'BMP', 'WEBP', 'AVIF',
  'SVG', 'ICO', 'TIFF', 'TIF', 'HEIC', 'HEIF', 'APNG', 'JXL',
]);

// ============================================================================
// 公共 API
// ============================================================================

/**
 * 将任意图片来源（data URL / 本地路径 / HTTP URL）转为可渲染的 src。
 *
 * 处理顺序：
 * 1. `data:image/` → 直接返回
 * 2. 本地路径（file://、盘符、POSIX）→ `normalizeFilePath` + `convertFileSrc`
 * 3. 其余（HTTP URL 等）→ 原样返回
 */
export function resolveImageSrc(url: string): string {
  if (url.startsWith(DATA_IMAGE_PREFIX)) return url;

  const normalized = normalizeFilePath(url);
  if (isLocalFilePath(normalized)) {
    return convertFileSrc(normalized);
  }
  return url;
}

/**
 * 从路径或 URL 中提取图片格式标签（用于 UI 展示）。
 * 仅在能识别出有效图片格式时返回标签，否则返回 null。
 *
 * 使用 charCode 扫描替代 split + regex，减少临时字符串分配。
 */
export function extractFormatLabel(url: string): string | null {
  // ── Base64: 从 MIME 提取 ──
  if (url.startsWith(DATA_IMAGE_PREFIX)) {
    return extractMimeFormat(url);
  }

  // ── URL / 路径: 从扩展名提取 ──
  let pathname: string;
  if (url.charCodeAt(0) === C_SLASH || !url.includes('://')) {
    // 本地路径或相对路径 — 无需 URL 解析
    pathname = url;
  } else {
    try { pathname = new URL(url).pathname; }
    catch { pathname = stripQueryHash(url); }
  }

  return formatFromPathname(pathname);
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

// ============================================================================
// 内部辅助
// ============================================================================

/**
 * 从 `data:image/xxx;` 中提取格式标签。
 *
 * charCode 扫描找 `;`，避免正则。
 */
function extractMimeFormat(dataUrl: string): string | null {
  const start = DATA_IMAGE_PREFIX.length; // 11
  let end = -1;
  for (let i = start; i < dataUrl.length; i++) {
    if (dataUrl.charCodeAt(i) === 59 /* ; */) { end = i; break; }
  }
  if (end === -1) return null;

  const raw = dataUrl.substring(start, end).toUpperCase();
  return raw === 'SVG+XML' ? 'SVG' : raw;
}

/**
 * 去掉 URL 中的 query 和 hash（charCode 扫描，零临时字符串）
 */
function stripQueryHash(url: string): string {
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    if (c === C_QUEST || c === C_HASH) return url.substring(0, i);
  }
  return url;
}

/**
 * 从 pathname 的最后一段提取图片格式标签。
 *
 * 反向扫描找最后一个 `/` 确定段起始，再找 `.` 提取扩展名。
 */
function formatFromPathname(pathname: string): string | null {
  // 找最后一个 `/` 后的段起始
  let segStart = 0;
  for (let i = pathname.length - 1; i >= 0; i--) {
    if (pathname.charCodeAt(i) === C_SLASH) { segStart = i + 1; break; }
  }

  // 确定有效区间末尾（跳过 query/hash — pathname 可能未经 URL 解析）
  let end = pathname.length;
  for (let i = segStart; i < end; i++) {
    const c = pathname.charCodeAt(i);
    if (c === C_QUEST || c === C_HASH) { end = i; break; }
  }

  // 反向找 `.`，提取扩展名与白名单比对
  for (let i = end - 1; i > segStart; i--) {
    if (pathname.charCodeAt(i) === C_DOT) {
      const ext = pathname.substring(i + 1, end).toUpperCase();
      return KNOWN_FORMAT_LABELS.has(ext) ? ext : null;
    }
  }
  return null;
}
