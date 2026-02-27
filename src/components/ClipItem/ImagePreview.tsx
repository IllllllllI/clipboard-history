import React, { useMemo, useState, useEffect } from 'react';
import { resolveImageSrc, extractFormatLabel } from '../../utils/imageUrl';

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
      className="group/img relative h-16 w-auto max-w-[200px] shrink-0 rounded-xl overflow-hidden bg-black/5 dark:bg-white/5 flex items-center justify-center cursor-zoom-in border border-transparent hover:border-indigo-500 transition-all duration-150 active:scale-[0.99]"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <img src={src} alt="Clipboard Image" className="h-full w-auto object-contain" draggable={false} />
      <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-[1px] text-[9px] text-white p-0.5 px-1.5 opacity-0 group-hover/img:opacity-100 transition-opacity flex justify-between items-center">
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
