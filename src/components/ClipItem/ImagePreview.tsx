import React, { useState, useEffect } from 'react';
import { resolveImageSrc, extractFormatLabel } from '../../utils/imageUrl';

/** 图片缩略图预览 */
export const ImagePreview = React.memo(function ImagePreview({
  url,
  onClick,
}: {
  url: string;
  onClick: () => void;
}) {
  const [src, setSrc] = useState('');
  const [meta, setMeta] = useState<{ width: number; height: number; format: string }>({
    width: 0,
    height: 0,
    format: extractFormatLabel(url),
  });

  useEffect(() => {
    const finalUrl = resolveImageSrc(url);
    setSrc(finalUrl);

    const img = new Image();
    img.onload = () =>
      setMeta((prev) => ({ ...prev, width: img.naturalWidth, height: img.naturalHeight }));
    img.src = finalUrl;
  }, [url]);

  if (!src) return null;

  return (
    <div
      className="group/img relative h-16 w-auto max-w-[200px] shrink-0 rounded overflow-hidden bg-black/5 dark:bg-white/5 flex items-center justify-center cursor-zoom-in border border-transparent hover:border-indigo-500 transition-all"
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
