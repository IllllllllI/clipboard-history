/**
 * 文件路径工具函数
 *
 * 统一管理文件路径的规范化、编解码、分类。
 *
 * 设计原则：
 * - 所有路径分类 / 解码逻辑集中在此模块，其他模块只做 import
 * - 热路径函数（getFileName / getFileExtension）使用 charCode 扫描，避免
 *   临时正则 & 中间字符串分配
 * - 导出 safeDecodeURIComponent / isLocalFilePath 供 imageUrl 等模块复用
 */

// ============================================================================
// 文件列表编码 / 解码
// ============================================================================

/** 文件列表存储格式标记：文件列表以此前缀开头，每行一个路径 */
export const FILES_PREFIX = '[FILES]\n';

/**
 * 匹配 + 剥离 `[FILES]` 标记及其后的首个换行。
 * 同时兼容 BOM（\uFEFF）和 Unicode 箭头 ↵ 两种换行表示。
 */
const FILES_STRIP_RE = /^\uFEFF?\s*\[FILES\](?:\s*\r?\n|\s*↵\s*)?/i;

/** 拆行：支持 \r\n / \n / ↵ */
const LINE_SPLIT_RE = /\r?\n|\s*↵\s*/;

/** 将文件路径数组编码为存储格式 */
export function encodeFileList(files: readonly string[]): string {
  return FILES_PREFIX + files.join('\n');
}

/**
 * 从存储格式解码文件路径数组。
 *
 * 比上一版减少一次多余的正则检测——直接尝试 strip，未命中则返回空数组。
 */
export function decodeFileList(text: string): string[] {
  const stripped = text.replace(FILES_STRIP_RE, '');
  // 如果 replace 没有命中（原样返回），说明不是文件列表
  if (stripped.length === text.length && !FILES_STRIP_RE.test(text)) return [];

  const result: string[] = [];
  const parts = stripped.split(LINE_SPLIT_RE);
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i].trim();
    if (line) result.push(line);
  }
  return result;
}

/** 检查文本是否为文件列表（仅判断，不解析） */
export function isFileList(text: string): boolean {
  // charCode 47 = '/', 91 = '[' — 快速排除绝大多数非文件列表文本
  const first = text.charCodeAt(0);
  if (first !== 0xFEFF /* BOM */ && first !== 91 /* [ */ && first !== 32 /* space */ && first !== 9 /* tab */) {
    return false;
  }
  return FILES_STRIP_RE.test(text);
}

// ============================================================================
// 通用编解码
// ============================================================================

/** percent-encode 检测正则（模块级缓存） */
const PCT_RE = /%[0-9a-fA-F]{2}/;

/**
 * 安全 URI 解码 — 不含 `%XX` 序列时直接返回原值，解码失败也返回原值。
 * 已导出，供 imageUrl 等模块复用，避免各处重复内联。
 */
export function safeDecodeURIComponent(value: string): string {
  if (!PCT_RE.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// ============================================================================
// 路径分类
// ============================================================================

const FILE_PROTO = 'file://';
const ASSET_HTTP = 'http://asset.localhost/';
const ASSET_HTTPS = 'https://asset.localhost/';

/**
 * 判断文本是否为本地文件路径（含 `file://` 协议、UNC 路径、POSIX 绝对路径、
 * Windows 盘符路径以及 percent-encoded 的变体）。
 *
 * 从 imageUrl.ts 迁移至此统一管理。
 */
export function isLocalFilePath(text: string): boolean {
  const decoded = safeDecodeURIComponent(text);
  return (
    decoded.startsWith(FILE_PROTO) ||
    decoded.startsWith('\\') ||
    decoded.startsWith('/') ||
    isWindowsDriveLetter(decoded.charCodeAt(0), decoded.charCodeAt(1))
  );
}

// ============================================================================
// 路径规范化
// ============================================================================

/** 检查 charCode 0/1 是否匹配 `X:` 格式的 Windows 盘符 */
function isWindowsDriveLetter(c0: number, c1: number): boolean {
  // A=65..Z=90, a=97..z=122, colon=58
  return c1 === 58 && ((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122));
}

/** 将 asset.localhost URL 转换为本地文件路径 */
function convertAssetUrlToPath(url: string): string {
  try {
    const u = new URL(url);
    return decodeURIComponent(u.pathname.substring(1));
  } catch {
    return url;
  }
}

/**
 * 规范化文件路径：
 * 1. 处理 asset.localhost URL
 * 2. percent-decode
 * 3. 移除 `file://` 前缀
 * 4. 修正 `/C:/` 式路径
 * 5. 统一 Windows 路径斜杠
 */
export function normalizeFilePath(text: string): string {
  let path = text.trim();

  // asset.localhost → 本地路径
  if (path.startsWith(ASSET_HTTP) || path.startsWith(ASSET_HTTPS)) {
    return convertAssetUrlToPath(path);
  }

  // percent-decode（可能出现 C%3A%5CUsers 之类）
  path = safeDecodeURIComponent(path);

  // file:// 前缀
  if (path.startsWith(FILE_PROTO)) {
    try { path = decodeURIComponent(path.slice(FILE_PROTO.length)); }
    catch { path = path.slice(FILE_PROTO.length); }
  }

  // /C:/... → C:/...
  if (path.charCodeAt(0) === 47 /* / */ && isWindowsDriveLetter(path.charCodeAt(1), path.charCodeAt(2))) {
    path = path.slice(1);
  }

  // Windows 盘符路径统一反斜杠
  if (isWindowsDriveLetter(path.charCodeAt(0), path.charCodeAt(1))) {
    path = path.replace(/\//g, '\\');
  }

  return path;
}

// ============================================================================
// 文件名 / 扩展名 / 分类
// ============================================================================

/**
 * charCode 常量
 * - 47 = `/`
 * - 92 = `\`
 * - 46 = `.`
 */
const SLASH = 47;
const BACKSLASH = 92;
const DOT = 46;

/**
 * 从文件路径中提取文件名（含扩展名）。
 *
 * 相比旧版 `replace(/\\/g, '/').split('/').pop()`：
 * - 零中间字符串分配（无 replace、无 split）
 * - 正确处理尾部斜杠：`foo/bar/` → `bar`
 */
export function getFileName(filePath: string): string {
  let end = filePath.length;
  // 跳过尾部斜杠
  while (end > 0) {
    const ch = filePath.charCodeAt(end - 1);
    if (ch !== SLASH && ch !== BACKSLASH) break;
    end--;
  }
  if (end === 0) return filePath;

  // 从 end 往前找第一个分隔符
  let i = end - 1;
  while (i >= 0) {
    const ch = filePath.charCodeAt(i);
    if (ch === SLASH || ch === BACKSLASH) break;
    i--;
  }
  return filePath.slice(i + 1, end);
}

/**
 * 从文件路径中提取扩展名（小写，不含点）。
 * @example getFileExtension('photo.JPG') => 'jpg'
 */
export function getFileExtension(filePath: string): string {
  const name = getFileName(filePath);
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/** 文件类型分类 */
export type FileCategory =
  | 'image' | 'video' | 'audio' | 'document' | 'spreadsheet'
  | 'presentation' | 'code' | 'archive' | 'executable'
  | 'font' | 'pdf' | 'text' | 'folder' | 'unknown';

/** 扩展名 → 分类映射（typed lookup） */
const EXT_CATEGORY: Readonly<Record<string, FileCategory | undefined>> = {
  // 图片
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', bmp: 'image',
  webp: 'image', svg: 'image', ico: 'image', tiff: 'image', tif: 'image',
  avif: 'image', heic: 'image', heif: 'image', apng: 'image', jxl: 'image',
  // 视频
  mp4: 'video', avi: 'video', mkv: 'video', mov: 'video', wmv: 'video',
  flv: 'video', webm: 'video', m4v: 'video',
  // 音频
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', aac: 'audio',
  wma: 'audio', m4a: 'audio',
  // 文档
  doc: 'document', docx: 'document', rtf: 'document', odt: 'document',
  // 表格
  xls: 'spreadsheet', xlsx: 'spreadsheet', csv: 'spreadsheet', ods: 'spreadsheet',
  // 演示文稿
  ppt: 'presentation', pptx: 'presentation', odp: 'presentation',
  // PDF
  pdf: 'pdf',
  // 代码
  js: 'code', ts: 'code', jsx: 'code', tsx: 'code', py: 'code',
  rs: 'code', go: 'code', java: 'code', cpp: 'code', c: 'code',
  h: 'code', css: 'code', html: 'code', htm: 'code', json: 'code',
  xml: 'code', yaml: 'code', yml: 'code', toml: 'code', md: 'code',
  sh: 'code', ps1: 'code', sql: 'code', rb: 'code', php: 'code',
  swift: 'code', kt: 'code', dart: 'code', vue: 'code', svelte: 'code',
  // 压缩包
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive',
  gz: 'archive', bz2: 'archive', xz: 'archive',
  // 可执行文件
  exe: 'executable', msi: 'executable', bat: 'executable', cmd: 'executable',
  com: 'executable', app: 'executable', dmg: 'executable', deb: 'executable', rpm: 'executable',
  // 字体
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font', eot: 'font',
  // 纯文本
  txt: 'text', log: 'text', ini: 'text', cfg: 'text', conf: 'text',
};

/** 获取文件类型分类，用于图标映射 */
export function getFileCategory(filePath: string): FileCategory {
  return EXT_CATEGORY[getFileExtension(filePath)] ?? 'unknown';
}
