import { useMemo } from 'react';
import { ClipItem, ImageType } from '../../types';
import { detectType, detectImageType, decodeFileList } from '../../utils';
import { getItemIcon } from './constants';

export type AccentType = 'code' | 'url' | 'image' | 'files' | 'color' | 'default';

export interface ClipItemDerivedState {
  type: string;
  isFiles: boolean;
  imageType: ImageType;
  isImage: boolean;
  imageUrls: string[];
  filePaths: string[];
  isFilesGallery: boolean;
  accentType: AccentType;
  IconComponent: ReturnType<typeof getItemIcon>;
}

/**
 * 从 ClipItem + settings 计算各种衍生状态，
 * 避免在 ClipItemComponent 中内联大量 useMemo。
 */
export function useClipItemDerivedState(
  item: ClipItem,
  showImagePreview: boolean,
): ClipItemDerivedState {
  const type = useMemo(() => detectType(item.text), [item.text]);
  const isFiles = type === 'files';

  const imageType = useMemo(
    () => (isFiles ? ImageType.None : detectImageType(item.text)),
    [isFiles, item.text],
  );
  const isImage = imageType !== ImageType.None;

  const imageUrls = useMemo(
    () =>
      type === 'multi-image'
        ? item.text
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
        : [item.text],
    [type, item.text],
  );

  const filePaths = useMemo(
    () => (isFiles ? decodeFileList(item.text) : []),
    [isFiles, item.text],
  );

  const isFilesGallery = useMemo(
    () =>
      showImagePreview &&
      isFiles &&
      filePaths.length > 0 &&
      filePaths.every((path) => detectImageType(path) === ImageType.LocalFile),
    [showImagePreview, isFiles, filePaths],
  );

  const IconComponent = useMemo(
    () => getItemIcon(item, type, imageType),
    [item, type, imageType],
  );

  const accentType: AccentType = useMemo(() => {
    if (type === 'code') return 'code';
    if (type === 'url') return 'url';
    if (isImage || type === 'multi-image') return 'image';
    if (isFiles) return 'files';
    if (type === 'color') return 'color';
    return 'default';
  }, [type, isImage, isFiles]);

  return {
    type,
    isFiles,
    imageType,
    isImage,
    imageUrls,
    filePaths,
    isFilesGallery,
    accentType,
    IconComponent,
  };
}
