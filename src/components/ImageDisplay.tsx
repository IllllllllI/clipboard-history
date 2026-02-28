import React, { useCallback } from 'react';
import { ImageIcon, AlertTriangle, Loader2 } from 'lucide-react';
import { ClipItem, ImageType } from '../types';
import { detectImageType } from '../utils';
import { extractFormatLabel } from '../utils/imageUrl';
import { useImageResource } from '../hooks/useImageResource';
import './styles/image-display.css';

// ============================================================================
// 类型 & 常量
// ============================================================================

interface ImageDisplayProps {
  item: ClipItem;
  darkMode?: boolean;
  centered?: boolean;
  showLinkInfo?: boolean;
  disableLazyLoad?: boolean;
  onClick?: (content: string) => void;
}

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
  disableLazyLoad = false,
  onClick,
}: ImageDisplayProps) {
  const imageType = detectImageType(item.text);
  const {
    containerRef,
    isLoading,
    imageSrc,
    error,
    imageSize,
    onImageLoad,
    onImageError,
  } = useImageResource({
    sourceText: item.text,
    imageType,
    disableLazyLoad,
  });

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
                onLoad={onImageLoad}
                onError={onImageError}
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
