import { useState, useEffect, useRef, useCallback } from 'react';
import { ImageType } from '../types';
import { normalizeFilePath } from '../utils';
import { resolveImageSrc } from '../utils/imageUrl';
import { fetchAndCacheImage } from '../utils/imageCache';

const ERROR_MESSAGES: Record<ImageType, string> = {
  [ImageType.HttpUrl]: '无法加载网络图片，请检查网络连接或图片链接是否有效',
  [ImageType.LocalFile]: '无法加载本地图片，文件可能已被移动或删除',
  [ImageType.Base64]: '图片数据格式错误，无法显示',
  [ImageType.None]: '图片加载失败',
};

function getErrorMessage(type: ImageType): string {
  return ERROR_MESSAGES[type] ?? ERROR_MESSAGES[ImageType.None];
}

interface ImageCacheEntry {
  src: string;
  loaded: boolean;
  touchedAt: number;
}

const IMAGE_CACHE_MAX_ENTRIES = 300;
const IMAGE_CACHE_TTL_MS = 30 * 60 * 1000;
const imageMemoryCache = new Map<string, ImageCacheEntry>();

function pruneExpiredEntries(now: number): void {
  for (const [key, entry] of imageMemoryCache.entries()) {
    if (now - entry.touchedAt > IMAGE_CACHE_TTL_MS) {
      imageMemoryCache.delete(key);
    }
  }
}

function pruneLruEntries(): void {
  while (imageMemoryCache.size > IMAGE_CACHE_MAX_ENTRIES) {
    const oldestKey = imageMemoryCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    imageMemoryCache.delete(oldestKey);
  }
}

function getCacheEntry(cacheKey: string): ImageCacheEntry | undefined {
  const now = Date.now();
  pruneExpiredEntries(now);

  const entry = imageMemoryCache.get(cacheKey);
  if (!entry) return undefined;

  if (now - entry.touchedAt > IMAGE_CACHE_TTL_MS) {
    imageMemoryCache.delete(cacheKey);
    return undefined;
  }

  imageMemoryCache.delete(cacheKey);
  const touchedEntry = { ...entry, touchedAt: now };
  imageMemoryCache.set(cacheKey, touchedEntry);
  return touchedEntry;
}

function setCacheEntry(cacheKey: string, src: string, loaded: boolean): void {
  const now = Date.now();
  pruneExpiredEntries(now);

  if (imageMemoryCache.has(cacheKey)) {
    imageMemoryCache.delete(cacheKey);
  }

  imageMemoryCache.set(cacheKey, { src, loaded, touchedAt: now });
  pruneLruEntries();
}

function markCacheEntryLoaded(cacheKey: string): void {
  const current = getCacheEntry(cacheKey);
  if (!current) return;
  setCacheEntry(cacheKey, current.src, true);
}

function deleteCacheEntry(cacheKey: string): void {
  imageMemoryCache.delete(cacheKey);
}

interface UseImageResourceOptions {
  sourceText: string;
  imageType: ImageType;
  disableLazyLoad?: boolean;
}

interface UseImageResourceResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  imageSrc: string;
  error: string | null;
  imageSize: { width: number; height: number } | null;
  onImageLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  onImageError: () => void;
}

export function useImageResource({
  sourceText,
  imageType,
  disableLazyLoad = false,
}: UseImageResourceOptions): UseImageResourceResult {
  const cacheKey = sourceText;
  const shouldLazyLoad = imageType === ImageType.HttpUrl && !disableLazyLoad;
  const initialCacheEntry = getCacheEntry(cacheKey);

  const [isLoading, setIsLoading] = useState(() => !(initialCacheEntry?.loaded ?? false));
  const [imageSrc, setImageSrc] = useState<string>(() => initialCacheEntry?.src ?? '');
  const [error, setError] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [shouldLoad, setShouldLoad] = useState(() => !shouldLazyLoad);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cacheEntry = getCacheEntry(cacheKey);
    setImageSrc(cacheEntry?.src ?? '');
    setIsLoading(!(cacheEntry?.loaded ?? false));
    setError(null);
    setImageSize(null);
  }, [cacheKey]);

  useEffect(() => {
    if (!shouldLazyLoad) {
      setShouldLoad(true);
      return;
    }
    setShouldLoad(false);
  }, [sourceText, shouldLazyLoad]);

  useEffect(() => {
    if (imageType === ImageType.None || !shouldLazyLoad) return;
    const element = containerRef.current;
    if (!element) return;

    const root = element.closest('.overflow-y-auto') as Element | null;

    const isVisibleNow = () => {
      const rect = element.getBoundingClientRect();
      if (root) {
        const rootRect = root.getBoundingClientRect();
        return rect.bottom >= rootRect.top - 80 && rect.top <= rootRect.bottom + 80;
      }
      return rect.bottom >= -80 && rect.top <= window.innerHeight + 80;
    };

    if (isVisibleNow()) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShouldLoad(true);
            observer.disconnect();
          }
        });
      },
      { root, rootMargin: '80px' }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [imageType, shouldLazyLoad, sourceText]);

  useEffect(() => {
    if (imageType === ImageType.None || !shouldLoad) return;

    const loadImage = async () => {
      setError(null);

      const cacheEntry = getCacheEntry(cacheKey);
      if (cacheEntry?.src) {
        setImageSrc(cacheEntry.src);
        if (cacheEntry.loaded) {
          setIsLoading(false);
          return;
        }
      } else {
        setIsLoading(true);
      }

      try {
        switch (imageType) {
          case ImageType.Base64:
            setImageSrc(sourceText);
            setCacheEntry(cacheKey, sourceText, false);
            break;
          case ImageType.HttpUrl: {
            const resolvedSrc = await fetchAndCacheImage(sourceText, 10000);
            setImageSrc(resolvedSrc);
            setCacheEntry(cacheKey, resolvedSrc, false);
            break;
          }
          case ImageType.LocalFile: {
            const resolvedSrc = resolveImageSrc(normalizeFilePath(sourceText));
            setImageSrc(resolvedSrc);
            setCacheEntry(cacheKey, resolvedSrc, false);
            break;
          }
          default:
            setImageSrc('');
        }
      } catch {
        if (imageType === ImageType.HttpUrl) {
          setImageSrc(sourceText);
          setCacheEntry(cacheKey, sourceText, false);
          return;
        }

        setError(getErrorMessage(imageType));
        setIsLoading(false);
      }
    };

    void loadImage();
  }, [cacheKey, shouldLoad, sourceText, imageType]);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    markCacheEntryLoaded(cacheKey);
    setIsLoading(false);
  }, [cacheKey]);

  const onImageError = useCallback(() => {
    deleteCacheEntry(cacheKey);
    setError(getErrorMessage(imageType));
    setIsLoading(false);
  }, [cacheKey, imageType]);

  return {
    containerRef,
    isLoading,
    imageSrc,
    error,
    imageSize,
    onImageLoad,
    onImageError,
  };
}
