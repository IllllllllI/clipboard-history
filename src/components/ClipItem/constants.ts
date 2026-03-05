import type { LucideIcon } from 'lucide-react';
import {
  Clipboard,
  Plus,
  Link,
  Palette,
  Images,
  Globe,
  HardDrive,
  FileCode2,
  Files,
} from 'lucide-react';
import { ImageType } from '../../types';

/**
 * 内容类型 → 图标映射
 *
 * 使用配置映射替代嵌套三元表达式，遵循开闭原则。
 * 添加新类型只需在此处增加一行。
 */
const TYPE_ICON_MAP = {
  files: Files,
  url: Link,
  color: Palette,
  'multi-image': Images,
} satisfies Record<string, LucideIcon>;

const IMAGE_TYPE_ICON_MAP = {
  [ImageType.HttpUrl]: Globe,
  [ImageType.LocalFile]: HardDrive,
  [ImageType.Base64]: FileCode2,
} satisfies Partial<Record<ImageType, LucideIcon>>;

/**
 * 根据内容类型决定该条目的图标
 *
 * @param isSnippet - ClipItem.is_snippet（0 | 1）
 */
export function getItemIcon(isSnippet: number, type: string, imageType: ImageType): LucideIcon {
  if (isSnippet) return Plus;
  const typeIcon = TYPE_ICON_MAP[type as keyof typeof TYPE_ICON_MAP];
  if (typeIcon) return typeIcon;

  if (imageType === ImageType.None) return Clipboard;
  const imageTypeIcon = IMAGE_TYPE_ICON_MAP[imageType as keyof typeof IMAGE_TYPE_ICON_MAP];
  if (imageTypeIcon) return imageTypeIcon;

  return Clipboard;
}
