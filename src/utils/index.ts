/**
 * utils barrel — 纯 re-export，不含业务逻辑
 */

// 日期时间检测
export { isDateTimeText, parseDateTimeText, getDateTimeFormats, findDateTimesInText, hasDateTimeInText } from './dateTimeDetect';
export type { DateTimeInfo, DateTimeMatch } from './dateTimeDetect';

// 图片 / 内容类型检测
export { detectType, detectContentType, detectImageType } from './imageDetect';

// 文件路径工具
export { FILES_PREFIX, encodeFileList, decodeFileList, isFileList, normalizeFilePath, getFileName, getFileExtension, getFileCategory } from './filePath';
export type { FileCategory } from './filePath';

// 图片缓存
export { ImageLRUCache, getImageCache, fetchAndCacheImage } from './imageCache';

// 通用工具
export { escapeRegExp } from './stringUtils';
export { formatDate } from './formatDate';
export { normalizeShortcut, areShortcutsEquivalent, getGlobalShortcutConflict, getImmersiveShortcutConflict, getLikelySystemShortcutWarning } from './shortcut';
