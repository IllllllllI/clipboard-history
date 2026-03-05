import { useState, useEffect, useRef, useCallback } from 'react';
import { ImageType } from '../types';
import { normalizeFilePath } from '../utils';
import { resolveImageSrc } from '../utils/imageUrl';
import { fetchAndCacheImage } from '../utils/imageCache';

// ============================================================================
// 错误提示
// ============================================================================

const ERROR_MESSAGES: Record<ImageType, string> = {
  [ImageType.HttpUrl]: '无法加载网络图片，请检查网络连接或图片链接是否有效',
  [ImageType.LocalFile]: '无法加载本地图片，文件可能已被移动或删除',
  [ImageType.Base64]: '图片数据格式错误，无法显示',
  [ImageType.None]: '图片加载失败',
};

function getErrorMessage(type: ImageType): string {
  return ERROR_MESSAGES[type] ?? ERROR_MESSAGES[ImageType.None];
}

// ============================================================================
// 轻量级图片 src 内存 LRU 缓存
//
// - get 原地修改 touchedAt，不创建新对象、不 delete→re-insert
// - 仅在 set 时节流修剪过期/超限条目（惰性清理，减少遍历）
// ============================================================================

interface ImageCacheEntry {
  src: string;
  loaded: boolean;
  touchedAt: number;
}

const CACHE_MAX = 50;
const CACHE_TTL_MS = 20 * 60 * 1_000;
const PRUNE_THROTTLE_MS = 5_000;

const memCache = new Map<string, ImageCacheEntry>();
let lastPruneTs = 0;

/**
 * 节流修剪：过期 + 超限，仅在 set 路径调用。
 * 单次遍历完成两种淘汰：先标记过期条目删除，再按插入序淘汰多余条目。
 */
function pruneIfNeeded(now: number): void {
  if (now - lastPruneTs < PRUNE_THROTTLE_MS) return;
  lastPruneTs = now;

  // 单次遍历：先删过期，之后若仍超限则按插入序淘汰
  let excess = memCache.size - CACHE_MAX;
  for (const [k, v] of memCache) {
    if (now - v.touchedAt > CACHE_TTL_MS) {
      memCache.delete(k);
      excess--;
    } else if (excess > 0) {
      memCache.delete(k);
      excess--;
    }
  }
}

function cacheGet(key: string): ImageCacheEntry | undefined {
  const entry = memCache.get(key);
  if (!entry) return undefined;

  const now = Date.now();
  if (now - entry.touchedAt > CACHE_TTL_MS) {
    memCache.delete(key);
    return undefined;
  }

  // 原地刷新时间戳——无分配
  entry.touchedAt = now;
  return entry;
}

function cacheSet(key: string, src: string, loaded: boolean): void {
  const now = Date.now();
  const existing = memCache.get(key);
  if (existing) {
    existing.src = src;
    existing.loaded = loaded;
    existing.touchedAt = now;
  } else {
    memCache.set(key, { src, loaded, touchedAt: now });
  }
  pruneIfNeeded(now);
}

function cacheMarkLoaded(key: string): void {
  const entry = memCache.get(key);
  if (entry) {
    entry.loaded = true;
    entry.touchedAt = Date.now();
  }
}

function cacheDelete(key: string): void {
  memCache.delete(key);
}

// ============================================================================
// Hook
// ============================================================================

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
  const lazyLoad = imageType === ImageType.HttpUrl && !disableLazyLoad;
  const initialEntry = cacheGet(cacheKey);

  const [isLoading, setIsLoading] = useState(() => !(initialEntry?.loaded ?? false));
  const [imageSrc, setImageSrc] = useState<string>(() => initialEntry?.src ?? '');
  const [error, setError] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // ── 核心加载 effect（合并 reset + 懒加载门控 + 异步解析） ──

  useEffect(() => {
    if (imageType === ImageType.None) return;

    // 重置状态（原先独立 effect —— 合并后减少一次 re-render）
    const cached = cacheGet(cacheKey);
    setError(null);
    setImageSize(null);
    setImageSrc(cached?.src ?? '');
    setIsLoading(!(cached?.loaded ?? false));

    let cancelled = false;

    // ── 解析并设置 src ──
    const resolve = async () => {
      // 命中缓存且已确认可渲染 → 无需重新解析
      if (cached?.loaded) return;

      try {
        switch (imageType) {
          case ImageType.Base64:
            // Base64 可能数 MB，不存 memCache
            if (!cancelled) setImageSrc(sourceText);
            break;
          case ImageType.HttpUrl: {
            const resolved = await fetchAndCacheImage(sourceText, 10_000);
            if (cancelled) return;
            setImageSrc(resolved);
            cacheSet(cacheKey, resolved, false);
            break;
          }
          case ImageType.LocalFile: {
            const resolved = resolveImageSrc(normalizeFilePath(sourceText));
            if (!cancelled) {
              setImageSrc(resolved);
              cacheSet(cacheKey, resolved, false);
            }
            break;
          }
          default:
            if (!cancelled) setImageSrc('');
        }
      } catch {
        if (cancelled) return;
        // HTTP 图片 fetch 失败 → 降级用原始 URL 让 <img> 尝试
        if (imageType === ImageType.HttpUrl) {
          setImageSrc(sourceText);
          cacheSet(cacheKey, sourceText, false);
          return;
        }
        setError(getErrorMessage(imageType));
        setIsLoading(false);
      }
    };

    // ── 懒加载门控 ──
    if (!lazyLoad) {
      void resolve();
      return () => { cancelled = true; };
    }

    // 需要懒加载：通过 IntersectionObserver 等可见再触发
    const el = containerRef.current;
    if (!el) {
      void resolve(); // 无容器引用 → 降级直接加载
      return () => { cancelled = true; };
    }

    const root = el.closest('.overflow-y-auto') as Element | null;

    let observer: IntersectionObserver | undefined;
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            observer?.disconnect();
            void resolve();
            return;
          }
        }
      },
      { root, rootMargin: '80px' },
    );

    observer.observe(el);
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [cacheKey, sourceText, imageType, lazyLoad]);

  // ── 回调 ──

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      cacheMarkLoaded(cacheKey);
      setIsLoading(false);
    },
    [cacheKey],
  );

  const onImageError = useCallback(() => {
    cacheDelete(cacheKey);
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
  } as const;
}
