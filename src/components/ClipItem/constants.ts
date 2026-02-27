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
import { ClipItem, ImageType } from '../../types';

/**
 * 内容类型 → 图标映射
 *
 * 使用配置映射替代嵌套三元表达式，遵循开闭原则。
 * 添加新类型只需在此处增加一行。
 */
const TYPE_ICON_MAP: Record<string, LucideIcon> = {
  files: Files,
  url: Link,
  color: Palette,
  'multi-image': Images,
};

const IMAGE_TYPE_ICON_MAP: Record<string, LucideIcon> = {
  [ImageType.HttpUrl]: Globe,
  [ImageType.LocalFile]: HardDrive,
  [ImageType.Base64]: FileCode2,
};

/** 根据内容类型决定该条目的图标 */
export function getItemIcon(item: ClipItem, type: string, imageType: ImageType): LucideIcon {
  if (item.is_snippet) return Plus;
  if (TYPE_ICON_MAP[type]) return TYPE_ICON_MAP[type];
  if (imageType !== ImageType.None && IMAGE_TYPE_ICON_MAP[imageType]) {
    return IMAGE_TYPE_ICON_MAP[imageType];
  }
  return Clipboard;
}
