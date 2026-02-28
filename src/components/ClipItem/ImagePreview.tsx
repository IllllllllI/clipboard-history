import React, { useMemo, useState, useEffect } from 'react';
import { resolveImageSrc, extractFormatLabel } from '../../utils/imageUrl';
import './styles/image-preview.css';

interface ImagePreviewProps {
  url: string;
  onClick: () => void;
}

/** 图片缩略图预览 */
export const ImagePreview = React.memo(function ImagePreview({
  url,
  onClick,
}: ImagePreviewProps) {
  const [src, setSrc] = useState('');
  const [meta, setMeta] = useState<{ width: number; height: number; format: string }>({ width: 0, height: 0, format: '' });
  const formatLabel = useMemo(() => extractFormatLabel(url), [url]);

  useEffect(() => {
    const finalUrl = resolveImageSrc(url);
    let disposed = false;
    setSrc(finalUrl);
    setMeta({ width: 0, height: 0, format: formatLabel });

    const img = new Image();
    img.onload = () => {
      if (!disposed) {
        setMeta((prev) => ({ ...prev, width: img.naturalWidth, height: img.naturalHeight }));
      }
    };
    img.onerror = () => {
      if (!disposed) {
        setMeta((prev) => ({ ...prev, width: 0, height: 0 }));
      }
    };
    img.src = finalUrl;

    return () => {
      disposed = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [url, formatLabel]);

  if (!src) return null;

  return (
    <div
      className="clip-item-image-preview"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <img src={src} alt="Clipboard Image" className="clip-item-image-preview-img" draggable={false} />
      <div className="clip-item-image-preview-meta">
        <span>{meta.format}</span>
        {meta.width > 0 && (
          <span>
            {meta.width}x{meta.height}
          </span>
        )}
      </div>
    </div>
  );
});
