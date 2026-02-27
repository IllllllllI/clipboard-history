import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ImageIcon, AlertTriangle, Loader2 } from 'lucide-react';
import { ClipItem, ImageType } from '../types';
import { detectImageType, normalizeFilePath } from '../utils';
import { resolveImageSrc, extractFormatLabel } from '../utils/imageUrl';
import { fetchAndCacheImage } from '../utils/imageCache';

// ============================================================================
// 类型 & 常量
// ============================================================================

interface ImageDisplayProps {
  item: ClipItem;
  darkMode?: boolean;
  centered?: boolean;
  showLinkInfo?: boolean;
  onClick?: (content: string) => void;
}

/** 根据图片类型返回用户友好的错误信息 */
const ERROR_MESSAGES: Record<ImageType, string> = {
  [ImageType.HttpUrl]:    '无法加载网络图片，请检查网络连接或图片链接是否有效',
  [ImageType.LocalFile]:  '无法加载本地图片，文件可能已被移动或删除',
  [ImageType.Base64]:     '图片数据格式错误，无法显示',
  [ImageType.None]:       '图片加载失败',
};

const getErrorMessage = (type: ImageType): string =>
  ERROR_MESSAGES[type] ?? ERROR_MESSAGES[ImageType.None];

// ============================================================================
// 子组件
// ============================================================================

/** 图片加载中骨架 */
const LoadingSkeleton = React.memo(function LoadingSkeleton({ dark }: { dark: boolean }) {
  return (
    <div className={`flex items-center justify-center h-64 rounded-lg border-2 border-dashed ${dark ? 'bg-neutral-800 border-neutral-700' : 'bg-neutral-50 border-neutral-200'}`}>
      <div className="flex flex-col items-center gap-3">
        <ImageIcon className={`w-16 h-16 ${dark ? 'text-neutral-600' : 'text-neutral-300'}`} />
        <Loader2 className={`w-8 h-8 animate-spin ${dark ? 'text-neutral-500' : 'text-neutral-400'}`} />
        <div className={`text-sm ${dark ? 'text-neutral-400' : 'text-neutral-500'}`}>加载中...</div>
      </div>
    </div>
  );
});

/** 图片加载失败 */
const ErrorDisplay = React.memo(function ErrorDisplay({
  dark,
  error,
  imageType,
  url,
}: {
  dark: boolean;
  error: string;
  imageType: ImageType;
  url: string;
}) {
  return (
    <div className={`flex items-center justify-center h-64 rounded-lg border-2 border-dashed ${dark ? 'bg-neutral-800 border-neutral-600' : 'bg-neutral-50 border-neutral-300'}`}>
      <div className="flex flex-col items-center gap-3 px-6 py-4 max-w-md">
        <AlertTriangle className={`w-14 h-14 ${dark ? 'text-red-400' : 'text-red-500'}`} />
        <div className="text-center">
          <div className={`text-sm font-semibold mb-1 ${dark ? 'text-red-400' : 'text-red-600'}`}>
            图片加载失败
          </div>
          <div className={`text-xs leading-relaxed ${dark ? 'text-neutral-400' : 'text-neutral-600'}`}>
            {error}
          </div>
        </div>
        {imageType === ImageType.HttpUrl && (
          <div className={`text-xs break-all text-center max-w-full ${dark ? 'text-neutral-500' : 'text-neutral-500'}`}>
            {url}
          </div>
        )}
      </div>
    </div>
  );
});

// ============================================================================
// 主组件
// ============================================================================

export const ImageDisplay = React.memo(function ImageDisplay({
  item,
  darkMode: dark = false,
  centered = true,
  showLinkInfo = true,
  onClick,
}: ImageDisplayProps) {
  const imageType = detectImageType(item.text);

  // ── 所有 hooks 必须在条件返回之前声明 ──
  const [isLoading, setIsLoading] = useState(true);
  const [imageSrc, setImageSrc] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver 懒加载
  useEffect(() => {
    if (imageType === ImageType.None) return;
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShouldLoad(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '50px' }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [imageType]);

  // 加载图片源（HTTP 图片使用缓存）
  useEffect(() => {
    if (imageType === ImageType.None || !shouldLoad) return;

    const loadImage = async () => {
      setIsLoading(true);
      setError(null);

      try {
        switch (imageType) {
          case ImageType.Base64:
            setImageSrc(item.text);
            break;
          case ImageType.HttpUrl:
            setImageSrc(await fetchAndCacheImage(item.text, 10000));
            break;
          case ImageType.LocalFile:
            setImageSrc(resolveImageSrc(normalizeFilePath(item.text)));
            break;
          default:
            setImageSrc('');
        }
      } catch (err) {
        // 某些站点会阻止 fetch(CORS/防盗链)，但 <img src="url"> 仍可直接显示。
        // 对 HTTP 图片做降级：回退到原始 URL 渲染，而不是立即判定失败。
        if (imageType === ImageType.HttpUrl) {
          setImageSrc(item.text);
          return;
        }

        setError(getErrorMessage(imageType));
        setIsLoading(false);
      }
    };

    loadImage();
  }, [shouldLoad, item.text, imageType]);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    setIsLoading(false);
  }, []);

  const handleImageError = useCallback(() => {
    setError(getErrorMessage(imageType));
    setIsLoading(false);
  }, [imageType]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (onClick) {
      e.stopPropagation();
      onClick(item.text);
    }
  }, [onClick, item.text]);

  // ── 非图片：提前返回（所有 hooks 已声明） ──
  if (imageType === ImageType.None) return null;

  const containerClass = centered ? 'flex items-center justify-center w-full' : 'w-full';

  return (
    <div className={containerClass} ref={containerRef}>
      <div className={`flex flex-col ${centered ? 'items-center' : ''}`}>
        {isLoading && !error && <LoadingSkeleton dark={dark} />}

        {error && (
          <ErrorDisplay dark={dark} error={error} imageType={imageType} url={item.text} />
        )}

        {!error && imageSrc && (
          <div className="relative group/imgdisplay">
            <img
              src={imageSrc}
              alt="Clipboard image"
              style={{
                maxWidth: '100%',
                height: 'auto',
                willChange: isLoading ? 'opacity' : 'auto',
                transform: 'translateZ(0)',
                imageRendering: 'auto',
              }}
              className={`max-h-64 object-contain rounded transition-opacity duration-200 ${
                isLoading ? 'opacity-0 absolute' : 'opacity-100'
              } ${onClick ? 'cursor-zoom-in hover:brightness-95 transition-all' : ''}`}
              onLoad={handleImageLoad}
              onError={handleImageError}
              onClick={handleClick}
              loading="lazy"
              decoding="async"
            />
            {!isLoading && imageSize && (() => {
              const fmt = extractFormatLabel(item.text);
              return (
                <div className="absolute bottom-1 right-1 z-10 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-[9px] text-white/90 px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover/imgdisplay:opacity-100 transition-opacity pointer-events-none">
                  {fmt && <><span className="font-semibold">{fmt}</span><span className="opacity-60">|</span></>}
                  <span>{imageSize.width}×{imageSize.height}</span>
                  <span className="opacity-60">|</span>
                  <span>{imageType === ImageType.HttpUrl ? '\u7f51\u7edc' : imageType === ImageType.LocalFile ? '\u672c\u5730' : 'Base64'}</span>
                </div>
              );
            })()}
          </div>
        )}

        {showLinkInfo && imageType === ImageType.HttpUrl && !error && (
          <div className={`mt-3 pt-3 border-t ${dark ? 'border-neutral-700' : 'border-neutral-200'}`}>
            <div className="flex items-start gap-2">
              <span className="text-xs text-neutral-500 flex-shrink-0 mt-0.5">
                链接:
              </span>
              <a
                href={item.text}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-xs break-all transition-colors duration-150 leading-relaxed ${
                  dark
                    ? 'text-neutral-400 hover:text-blue-400'
                    : 'text-neutral-600 hover:text-blue-600'
                }`}
                title={item.text}
              >
                {item.text}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
