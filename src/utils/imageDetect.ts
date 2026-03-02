/**
 * 图片与内容类型检测
 *
 * 从文本内容检测其类型（图片/URL/颜色/文件 等），
 * 以及图片的具体来源（Base64 / HTTP / 本地文件）。
 */

import { ImageType } from '../types';
import { IMAGE_EXTENSIONS } from './imageUrl';
import { isFileList } from './filePath';

const HTTP_PREFIX = 'http://';
const HTTPS_PREFIX = 'https://';
const DATA_IMAGE_PREFIX = 'data:image/';
const FILE_PROTOCOL = 'file://';
const URL_TEXT_REGEX = /^https?:\/\/[^\s$.?#].[^\s]*$/i;
const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const IMAGE_PARAM_HINT_REGEX = /(format=|type=image)/i;

// ============================================================================
// 私有辅助
// ============================================================================

/**
 * 从路径或 URL 中提取小写扩展名（含 `.`）
 * @example extractExtension('photo.JPG?v=1') => '.jpg'
 */
function extractExtension(path: string): string {
  const clean = path.split('?')[0].split('#')[0].split('!')[0];
  const dot = clean.lastIndexOf('.');
  return dot === -1 ? '' : clean.substring(dot).toLowerCase();
}

/** 判断 URL 路径中是否包含图片扩展片段（支持 CDN 样式后缀） */
function hasImageExtensionFragment(path: string): boolean {
  return /\.(jpe?g|png|gif|webp|svg|bmp|ico|tiff?|avif|apng|heic|heif)(?=([_@.!/?#-]|$))/i.test(path);
}

/** 从完整 URL 中提取 pathname + search */
function extractUrlPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

/** 检查 URL 是否为 Tauri asset.localhost */
function isAssetLocalhostUrl(url: string): boolean {
  return url.startsWith('http://asset.localhost/') || url.startsWith('https://asset.localhost/');
}

/** 将 asset.localhost URL 转为本地路径 */
function convertAssetUrlToPath(url: string): string {
  try {
    const u = new URL(url);
    return decodeURIComponent(u.pathname.substring(1));
  } catch {
    return url;
  }
}

/**
 * 判断文本是否包含代码特征（关键字、括号、注释等），
 * 用于防止代码片段被误判为文件路径。
 */
function hasCodePatterns(text: string): boolean {
  if (text.startsWith(FILE_PROTOCOL)) return false;

  const patterns: RegExp[] = [
    /\{[^}]*\}/,                    // 花括号包裹内容
    /\([^)]*\)/,                    // 圆括号包裹内容（函数调用）
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
  return patterns.some(p => p.test(text));
}

/** 判断文本是否为本地文件路径（Unix / Windows / file URI） */
function isFilePath(text: string): boolean {
  const value = text.trim();

  if (value.startsWith(FILE_PROTOCOL)) return true;
  if (/^[a-zA-Z]:\\/.test(value)) return true;
  if (value.startsWith('/')) {
    if (value.startsWith('//') || value.startsWith('/*')) return false;
    return true;
  }

  return false;
}

/** 判断扩展名是否为支持的图片格式 */
function isImageExtension(ext: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * 检测是否为已知图片 CDN / 代理服务的 URL
 *
 * 这些 URL 路径中通常没有图片扩展名，但通过特定路径或参数可判断为图片。
 * 匹配模式包括：
 * - Bing 图片：`bing.net/th/id/` + `pid=ImgRaw` 等参数
 * - Google 图片代理
 * - 查询参数中包含编码的图片 URL（如 `riu=http...xxx.jpg`）
 */
function isKnownImageCdnUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const params = u.searchParams;

    // 抖音电商素材 CDN：常见为无后缀路径，格式名体现在路径 token（如 /png_m_xxx）
    if (
      host.endsWith('ecombdimg.com')
      && /\/obj\//i.test(u.pathname)
      && /\/(jpe?g|png|gif|webp|svg|bmp|ico|tiff?|avif|apng|heic|heif)(?=([_-]|\/|$))/i.test(u.pathname)
    ) {
      return true;
    }

    // Bing 图片 CDN：bing.net/th/id/ + pid=ImgRaw|ImgDet|ImgFull
    if (host.endsWith('.bing.net') && u.pathname.includes('/th/id/')) {
      const pid = params.get('pid') || '';
      if (/^Img/i.test(pid)) return true;
    }

    // Google 图片代理
    if ((host === 'lh3.googleusercontent.com' || host === 'lh4.googleusercontent.com' || host === 'lh5.googleusercontent.com') ||
        (host.endsWith('.gstatic.com') && u.pathname.startsWith('/images'))) {
      return true;
    }

    // Imgur 短链（无扩展名）
    if (host === 'i.imgur.com' || host === 'imgur.com') return true;

    // 查询参数中包含编码的图片 URL
    for (const value of params.values()) {
      const decoded = decodeURIComponent(value);
      if (/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff|tif)/i.test(decoded)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
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
  if (isFileList(text)) return 'files';
  if (text.startsWith(DATA_IMAGE_PREFIX)) return 'image';

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    const allImages = lines.every(line => detectImageType(line) !== ImageType.None);
    if (allImages) {
      return lines.length === 1 ? 'image-url' : 'multi-image';
    }
  }

  if (URL_TEXT_REGEX.test(text)) return 'url';
  if (HEX_COLOR_REGEX.test(text)) return 'color';
  return 'text';
}

/**
 * 检测文本内容的 file / text 类别
 */
export function detectContentType(text: string): 'file' | 'text' {
  return isFilePath(text) ? 'file' : 'text';
}

/**
 * 检测图片类型（Base64 / HTTP URL / 本地文件 / 无）
 */
export function detectImageType(text: string): ImageType {
  if (!text || text.length === 0) return ImageType.None;

  // Base64
  if (text.startsWith(DATA_IMAGE_PREFIX) && text.includes(';base64,')) {
    return ImageType.Base64;
  }

  // Tauri asset.localhost URL（需在 HTTP 判断之前）
  if (isAssetLocalhostUrl(text)) {
    const decoded = convertAssetUrlToPath(text);
    return isImageExtension(extractExtension(decoded)) ? ImageType.LocalFile : ImageType.None;
  }

  // HTTP / HTTPS
  if (text.startsWith(HTTP_PREFIX) || text.startsWith(HTTPS_PREFIX)) {
    const urlPath = extractUrlPath(text);
    if (isImageExtension(extractExtension(urlPath))) return ImageType.HttpUrl;
    if (hasImageExtensionFragment(urlPath)) return ImageType.HttpUrl;
    if (IMAGE_PARAM_HINT_REGEX.test(urlPath)) return ImageType.HttpUrl;
    if (isKnownImageCdnUrl(text)) return ImageType.HttpUrl;
    return ImageType.None;
  }

  // 本地文件路径（优先于代码特征检测，避免 `xxx (1).jpg` 被误判）
  if (isFilePath(text)) {
    return isImageExtension(extractExtension(text)) ? ImageType.LocalFile : ImageType.None;
  }

  // 排除代码片段
  if (hasCodePatterns(text)) return ImageType.None;

  return ImageType.None;
}
