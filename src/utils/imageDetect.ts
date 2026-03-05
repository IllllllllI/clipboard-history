/**
 * 图片与内容类型检测
 *
 * 从文本内容检测其类型（图片/URL/颜色/文件 等），
 * 以及图片的具体来源（Base64 / HTTP / 本地文件）。
 *
 * 性能要点：
 * - `IMAGE_EXT_SET`（Set）替代数组 `.includes()`，O(1) 查找
 * - HTTP URL 只执行一次 `new URL()` 解析，结果传递给所有子判断
 * - `extractExt` 使用 charCode 扫描，零中间字符串
 * - `detectType` 缓存键截断至 512 字符，避免大文本内存膨胀
 * - 路径判断复用 filePath.ts 的 `isLocalFilePath`，消除重复实现
 */

import { ImageType } from '../types';
import { isFileList, isLocalFilePath, normalizeFilePath } from './filePath';

// ============================================================================
// 常量
// ============================================================================

const DATA_IMAGE_PREFIX = 'data:image/';
const ASSET_HTTP  = 'http://asset.localhost/';
const ASSET_HTTPS = 'https://asset.localhost/';

const URL_TEXT_REGEX = /^https?:\/\/[^\s$.?#].[^\s]*$/i;
const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const IMAGE_PARAM_HINT_REGEX = /(format=|type=image)/i;

/**
 * 所有支持的图片扩展名（含 `.`，小写）。
 *
 * 这是图片检测的唯一权威来源，`CDN_EXT_FRAGMENT_RE` 与 CDN 检测
 * 中的扩展名列表应与此保持同步。
 */
const IMAGE_EXT_SET: ReadonlySet<string> = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg',
  '.ico', '.tiff', '.tif', '.avif', '.apng', '.heic', '.heif', '.jxl',
]);

/**
 * CDN 路径中的图片扩展名片段匹配。
 *
 * 用于无标准扩展名但路径中含 `/png_xxx`、`/image.jpg_wh300` 等 token 的 URL，
 * 例如 `photo.png_thumbnail`（extractExt 无法提取到 `.png`）。
 */
const CDN_EXT_FRAGMENT_RE =
  /\.(jpe?g|png|gif|webp|svg|bmp|ico|tiff?|avif|apng|heic|heif|jxl)(?=[_@.!/?#-]|$)/i;

// ============================================================================
// detectType 缓存 — 避免 filterHistory 对每条记录重复检测
// ============================================================================

const DETECT_TYPE_CACHE_MAX = 1200;
/** 缓存 key 最大长度 — 超长文本截断 + 长度后缀，避免存两份完整文本 */
const CACHE_KEY_MAX_LEN = 512;

const detectTypeCache = new Map<string, string>();

/** 清除 detectType 缓存（历史记录大幅变更时可手动调用） */
export function clearDetectTypeCache(): void {
  detectTypeCache.clear();
}

/** 生成缓存键 — 超长文本取前 N 字符 + 长度后缀作为快速指纹 */
function makeCacheKey(text: string): string {
  return text.length <= CACHE_KEY_MAX_LEN
    ? text
    : text.substring(0, CACHE_KEY_MAX_LEN) + '\0' + text.length;
}

// ============================================================================
// 私有辅助
// ============================================================================

/**
 * 从路径 / URL 中提取小写扩展名（含 `.`）。
 *
 * 使用 charCode 扫描代替旧版三次 `.split()`，零中间字符串分配。
 *
 * @example extractExt('photo.JPG?v=1') => '.jpg'
 */
function extractExt(path: string): string {
  // 找有效区间末尾（`?` `#` `!` 之前）
  let end = path.length;
  for (let i = 0; i < end; i++) {
    const c = path.charCodeAt(i);
    if (c === 63 /* ? */ || c === 35 /* # */ || c === 33 /* ! */) {
      end = i;
      break;
    }
  }
  // 从末尾向前找最后一个 `.`
  for (let i = end - 1; i >= 0; i--) {
    const c = path.charCodeAt(i);
    if (c === 46 /* . */) return path.substring(i, end).toLowerCase();
    if (c === 47 /* / */ || c === 92 /* \ */) break; // 目录分隔符 → 无扩展名
  }
  return '';
}

/** 判断扩展名是否为支持的图片格式（O(1)） */
function isImageExt(ext: string): boolean {
  return IMAGE_EXT_SET.has(ext);
}

/**
 * 判断文本是否"像"本地文件路径。
 *
 * 复用 `isLocalFilePath`（支持 file://、UNC、盘符、POSIX），
 * 并额外排除 `//` 和 `/*` 开头（注释语法）以防止代码误判。
 */
function isPathLike(text: string): boolean {
  const v = text.trimStart();
  if (v.length >= 2) {
    const c0 = v.charCodeAt(0);
    const c1 = v.charCodeAt(1);
    // 排除 `//` 注释 和 `/*` 块注释
    if (c0 === 47 /* / */ && (c1 === 47 || c1 === 42 /* * */)) return false;
  }
  return isLocalFilePath(v);
}

/** 代码特征正则 — 模块级常量，避免每次调用重建 */
const CODE_PATTERNS: ReadonlyArray<RegExp> = [
  /\{[^}]*\}/,                    // 花括号
  /\([^)]*\)/,                    // 圆括号（函数调用）
  /;[\s]*$/m,                     // 行尾分号
  /^[\s]*(fn|function|const|let|var|class|struct|impl|mod|use|import|export|def|async|pub|private|public|static)\s/m,
  /=>/,                           // 箭头函数
  /::/,                           // Rust / C++ 作用域
  /\[\s*\]/,                      // 空数组
  /<[^>]+>/,                      // 泛型 / 模板
  /\bformat!\(/,                  // Rust 宏
  /\bprintln!\(/,
  /\|\s*\w+\s*\|/,                // Rust 闭包
  /\w+\s*=\s*\w+/,                // 赋值语句
  /\/\/.+$/m,                     // 单行注释
  /\/\*[\s\S]*?\*\//,             // 多行注释
  /#\[[\w(]+\]/,                  // Rust 属性
  /\bif\s+/,
  /\bfor\s+/,
  /\bwhile\s+/,
  /\breturn\s+/,
];

/**
 * 判断文本是否包含代码特征（关键字、括号、注释等），
 * 用于防止代码片段被误判为文件路径。
 */
function hasCodePatterns(text: string): boolean {
  if (text.startsWith('file://')) return false;
  return CODE_PATTERNS.some(p => p.test(text));
}

// ── CDN 识别 ──

/**
 * 检测是否为已知图片 CDN / 代理服务的 URL。
 *
 * 接受已解析的 URL 对象，避免重复 `new URL()` 解析。
 *
 * 匹配模式：
 * - 抖音电商素材 CDN（ecombdimg.com）
 * - Bing 图片 CDN（bing.net/th/id/ + pid=Img*）
 * - Google 图片代理（lh3/4/5.googleusercontent.com、gstatic.com/images）
 * - Imgur 短链
 * - 查询参数中包含编码的图片 URL（如 `riu=http...xxx.jpg`）
 */
function isKnownImageCdn(u: URL): boolean {
  const host = u.hostname;
  const params = u.searchParams;

  // 抖音电商素材 CDN：无后缀路径，格式名体现在路径 token（如 /png_m_xxx）
  if (
    host.endsWith('ecombdimg.com') &&
    /\/obj\//i.test(u.pathname) &&
    /\/(jpe?g|png|gif|webp|svg|bmp|ico|tiff?|avif|apng|heic|heif|jxl)(?=[_\-/]|$)/i.test(u.pathname)
  ) {
    return true;
  }

  // Bing 图片 CDN
  if (host.endsWith('.bing.net') && u.pathname.includes('/th/id/')) {
    const pid = params.get('pid') || '';
    if (/^Img/i.test(pid)) return true;
  }

  // Google 图片代理
  if (
    host === 'lh3.googleusercontent.com' ||
    host === 'lh4.googleusercontent.com' ||
    host === 'lh5.googleusercontent.com' ||
    (host.endsWith('.gstatic.com') && u.pathname.startsWith('/images'))
  ) {
    return true;
  }

  // Imgur 短链（无扩展名）
  if (host === 'i.imgur.com' || host === 'imgur.com') return true;

  // 查询参数中包含编码的图片 URL
  for (const value of params.values()) {
    const decoded = decodeURIComponent(value);
    if (/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff?|avif|heic|heif|jxl)/i.test(decoded)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// 公共 API
// ============================================================================

/**
 * 检测剪贴板文本的展示类型
 *
 * @returns 'files' | 'image' | 'image-url' | 'multi-image' | 'url' | 'color' | 'text'
 */
export function detectType(text: string): string {
  const key = makeCacheKey(text);
  const cached = detectTypeCache.get(key);
  if (cached !== undefined) return cached;

  let result: string;
  if (isFileList(text)) {
    result = 'files';
  } else if (text.startsWith(DATA_IMAGE_PREFIX)) {
    result = 'image';
  } else {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 0 && lines.every(line => detectImageType(line) !== ImageType.None)) {
      result = lines.length === 1 ? 'image-url' : 'multi-image';
    } else if (URL_TEXT_REGEX.test(text)) {
      result = 'url';
    } else if (HEX_COLOR_REGEX.test(text)) {
      result = 'color';
    } else {
      result = 'text';
    }
  }

  // 写入缓存，超限时淘汰最早的 25%
  if (detectTypeCache.size >= DETECT_TYPE_CACHE_MAX) {
    const evictCount = DETECT_TYPE_CACHE_MAX >> 2;
    let i = 0;
    for (const k of detectTypeCache.keys()) {
      if (i++ >= evictCount) break;
      detectTypeCache.delete(k);
    }
  }
  detectTypeCache.set(key, result);
  return result;
}

/**
 * 检测文本内容的 file / text 类别
 */
export function detectContentType(text: string): 'file' | 'text' {
  return isPathLike(text) ? 'file' : 'text';
}

/**
 * 检测图片类型（Base64 / HTTP URL / 本地文件 / 无）
 */
export function detectImageType(text: string): ImageType {
  if (!text) return ImageType.None;

  // Base64
  if (text.startsWith(DATA_IMAGE_PREFIX) && text.includes(';base64,')) {
    return ImageType.Base64;
  }

  // Tauri asset.localhost URL（需在 HTTP 判断之前）
  if (text.startsWith(ASSET_HTTP) || text.startsWith(ASSET_HTTPS)) {
    const localPath = normalizeFilePath(text);
    return isImageExt(extractExt(localPath)) ? ImageType.LocalFile : ImageType.None;
  }

  // HTTP / HTTPS — 解析一次 URL，供所有子判断复用
  if (text.charCodeAt(0) === 104 /* h */ &&
      (text.startsWith('http://') || text.startsWith('https://'))) {
    let u: URL;
    try { u = new URL(text); } catch { return ImageType.None; }
    const urlPath = u.pathname + u.search;
    if (isImageExt(extractExt(urlPath))) return ImageType.HttpUrl;
    if (CDN_EXT_FRAGMENT_RE.test(urlPath)) return ImageType.HttpUrl;
    if (IMAGE_PARAM_HINT_REGEX.test(urlPath)) return ImageType.HttpUrl;
    if (isKnownImageCdn(u)) return ImageType.HttpUrl;
    return ImageType.None;
  }

  // 本地文件路径（优先于代码特征检测，避免 `xxx (1).jpg` 被误判）
  if (isPathLike(text)) {
    return isImageExt(extractExt(text)) ? ImageType.LocalFile : ImageType.None;
  }

  // 排除代码片段
  if (hasCodePatterns(text)) return ImageType.None;

  return ImageType.None;
}
