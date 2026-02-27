/**
 * 文件路径工具函数
 *
 * 统一管理文件路径的规范化、编解码、分类。
 */

// ============================================================================
// 文件列表编码 / 解码
// ============================================================================

/** 文件列表存储格式标记：文件列表以此前缀开头，每行一个路径 */
export const FILES_PREFIX = '[FILES]\n';

/** 将文件路径数组编码为存储格式 */
export function encodeFileList(files: string[]): string {
  return FILES_PREFIX + files.join('\n');
}

/** 从存储格式解码文件路径数组 */
export function decodeFileList(text: string): string[] {
  if (!text.startsWith(FILES_PREFIX)) return [];
  return text.slice(FILES_PREFIX.length).split('\n').filter(Boolean);
}

/** 检查文本是否为文件列表 */
export function isFileList(text: string): boolean {
  return text.startsWith(FILES_PREFIX);
}

// ============================================================================
// 路径规范化
// ============================================================================

/**
 * 检查 URL 是否为 Tauri asset.localhost URL
 */
function isAssetLocalhostUrl(url: string): boolean {
  return url.startsWith('http://asset.localhost/') || url.startsWith('https://asset.localhost/');
}

/**
 * 将 asset.localhost URL 转换为本地文件路径
 */
function convertAssetUrlToPath(url: string): string {
  try {
    const u = new URL(url);
    return decodeURIComponent(u.pathname.substring(1));
  } catch {
    return url;
  }
}

/**
 * 规范化文件路径：移除 file:// 前缀、处理 asset.localhost、转换斜杠
 */
export function normalizeFilePath(text: string): string {
  let path = text;

  // Handle asset.localhost URLs
  if (isAssetLocalhostUrl(path)) {
    return convertAssetUrlToPath(path);
  }

  // Remove file:// prefix
  if (path.startsWith('file://')) {
    path = path.substring(7);
  }

  // Convert forward slashes to backslashes on Windows paths
  if (/^[a-zA-Z]:/.test(path)) {
    path = path.replace(/\//g, '\\');
  }

  return path;
}

// ============================================================================
// 文件名 / 扩展名 / 分类
// ============================================================================

/** 从文件路径中提取文件名 */
export function getFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.split('/').pop() || filePath;
}

/** 从文件路径中提取扩展名（小写，不含点） */
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

/** 扩展名 → 分类映射 */
const EXT_CATEGORY: Record<string, FileCategory> = {
  // 图片
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', bmp: 'image',
  webp: 'image', svg: 'image', ico: 'image', tiff: 'image', tif: 'image',
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
  return EXT_CATEGORY[getFileExtension(filePath)] || 'unknown';
}
