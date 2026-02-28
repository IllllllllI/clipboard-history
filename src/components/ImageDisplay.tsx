import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ImageIcon, AlertTriangle, Loader2 } from 'lucide-react';
import { ClipItem, ImageType } from '../types';
import { detectImageType, normalizeFilePath } from '../utils';
import { resolveImageSrc, extractFormatLabel } from '../utils/imageUrl';
import { fetchAndCacheImage } from '../utils/imageCache';
import './styles/image-display.css';

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
    <div className="image-display__loading" data-theme={dark ? 'dark' : 'light'}>
      <div className="image-display__loading-inner">
        <ImageIcon className="image-display__loading-icon" />
        <Loader2 className="image-display__spinner animate-spin" />
        <div className="image-display__loading-text">加载中...</div>
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
    <div className="image-display__error" data-theme={dark ? 'dark' : 'light'}>
      <div className="image-display__error-inner">
        <AlertTriangle className="image-display__error-icon" />
        <div className="image-display__error-text-wrap">
          <div className="image-display__error-title">
            图片加载失败
          </div>
          <div className="image-display__error-message">
            {error}
          </div>
        </div>
        {imageType === ImageType.HttpUrl && (
          <div className="image-display__error-url">
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
  const imageSourceLabel = imageType === ImageType.HttpUrl ? '网络' : imageType === ImageType.LocalFile ? '本地' : 'Base64';

  return (
    <div
      className="image-display"
      ref={containerRef}
      data-theme={dark ? 'dark' : 'light'}
      data-centered={centered ? 'true' : 'false'}
    >
      <div className="image-display__content">
        {isLoading && !error && <LoadingSkeleton dark={dark} />}

        {error && (
          <ErrorDisplay dark={dark} error={error} imageType={imageType} url={item.text} />
        )}

        {!error && imageSrc && (
          <div className="image-display__media-wrap">
            <div className="image-display__image-box">
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
                className={`image-display__image ${
                  isLoading ? 'opacity-0 absolute' : 'opacity-100'
                } ${onClick ? 'image-display__image--clickable' : ''}`}
                onLoad={handleImageLoad}
                onError={handleImageError}
                onClick={handleClick}
                loading="lazy"
                decoding="async"
              />
              {!isLoading && imageSize && (() => {
                const fmt = extractFormatLabel(item.text);
                return (
                  <div className="image-display__meta-chip">
                    {fmt && <><span className="image-display__meta-format">{fmt}</span><span className="image-display__meta-sep">|</span></>}
                    <span>{imageSize.width}×{imageSize.height}</span>
                    <span className="image-display__meta-sep">|</span>
                    <span>{imageSourceLabel}</span>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {showLinkInfo && imageType === ImageType.HttpUrl && !error && (
          <div className="image-display__link-block">
            <div className="image-display__link-row">
              <span className="image-display__link-label">
                链接:
              </span>
              <a
                href={item.text}
                target="_blank"
                rel="noopener noreferrer"
                className={`image-display__source-link ${
                  dark
                    ? 'hover:text-blue-400'
                    : 'hover:text-blue-600'
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
