import { useMemo } from 'react';
import { ClipItem, ImageType } from '../../types';
import { detectType, detectImageType, decodeFileList, getImageFormat } from '../../utils';
import { getItemIcon } from './constants';

export type AccentType = 'code' | 'url' | 'image' | 'files' | 'color' | 'default';

export interface ClipItemDerivedState {
  type: string;
  isFiles: boolean;
  imageType: ImageType;
  isImage: boolean;
  imageUrls: string[];
  filePaths: string[];
  imageFormat: string | null;
  isFilesGallery: boolean;
  accentType: AccentType;
  IconComponent: ReturnType<typeof getItemIcon>;
}

// ─── 纯函数：accent 查表 ────────────────────────────────────────────────────
const TYPE_TO_ACCENT: Partial<Record<string, AccentType>> = {
  code: 'code',
  url: 'url',
  'multi-image': 'image',
  files: 'files',
  color: 'color',
};

function resolveAccentType(type: string, isImage: boolean): AccentType {
  const mapped = TYPE_TO_ACCENT[type];
  if (mapped) return mapped;
  return isImage ? 'image' : 'default';
}

// ─── 常量：空数组引用，避免每次创建新引用 ──────────────────────────────────
const EMPTY_STRINGS: readonly string[] = [];

/**
 * 从 ClipItem + settings **一次性**计算全部衍生状态。
 *
 * 改进点（相比原实现）：
 * - **性能**：原 9 个独立 `useMemo` 合并为 1 个，消除 8 份依赖数组创建 + 浅比较开销
 * - **内存**：非 multi-image 时复用 `EMPTY_STRINGS`；非 files 时同理
 * - **依赖精度**：仅依赖 `item.text`、`item.is_snippet`、`showImagePreview`（3 个原始值），
 *   避免旧实现中对整个 `item` 对象引用的冗余依赖
 * - **结构**：派生链在单一函数内线性展开，逻辑完整可读
 * - **语义**：accentType 使用查表法，新增类型只需加一行
 */
export function useClipItemDerivedState(
  item: ClipItem,
  showImagePreview: boolean,
): ClipItemDerivedState {
  // 仅解构出真正影响派生结果的原始值，保证依赖精度
  const { text, is_snippet } = item;

  return useMemo(() => {
    // 1. 基础类型
    const type = detectType(text);
    const isFiles = type === 'files';

    // 2. 图片类型
    const imageType = isFiles ? ImageType.None : detectImageType(text);
    const isImage = imageType !== ImageType.None;

    // 3. 图片 URL 列表（仅 multi-image 时需要拆行，其余场景传单元素即可）
    let imageUrls: string[];
    if (type === 'multi-image') {
      imageUrls = text.split('\n').map((l) => l.trim()).filter(Boolean);
    } else if (isImage) {
      imageUrls = [text];
    } else {
      imageUrls = EMPTY_STRINGS as string[];
    }

    // 4. 文件路径
    const filePaths = isFiles ? decodeFileList(text) : (EMPTY_STRINGS as string[]);

    // 5. 文件相册：所有文件均为本地图片
    const isFilesGallery =
      showImagePreview &&
      isFiles &&
      filePaths.length > 0 &&
      filePaths.every((p) => detectImageType(p) === ImageType.LocalFile);

    // 6. 图标
    const IconComponent = getItemIcon(is_snippet, type, imageType);

    // 7. 图片格式提取（根据第一张图）
    let imageFormat: string | null = null;
    if (isImage && !isFiles && imageUrls.length > 0) {
      imageFormat = getImageFormat(imageUrls[0]);
    } else if (isFilesGallery && filePaths.length > 0) {
      // 文件类型但作为图库展示，也可以提格式
      imageFormat = getImageFormat(filePaths[0]);
    }

    // 8. 主题色类型
    const accentType = resolveAccentType(type, isImage);

    return {
      type,
      isFiles,
      imageType,
      isImage,
      imageUrls,
      filePaths,
      imageFormat,
      isFilesGallery,
      accentType,
      IconComponent,
    };
  }, [text, is_snippet, showImagePreview]);
}
