import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ZoomIn, ZoomOut, Copy, Download, RotateCcw, type LucideIcon } from 'lucide-react';
import { TauriService } from '../services/tauri';
import { resolveImageSrc, formatBytes, extractFormatLabel } from '../utils/imageUrl';

// ============================================================================
// 类型 & 常量
// ============================================================================

interface LargeImagePreviewProps {
  url: string | null;
  onClose: () => void;
}

/** 棋盘格背景样式（透明图片视觉辅助） */
const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundImage: [
    'linear-gradient(45deg, #808080 25%, transparent 25%)',
    'linear-gradient(-45deg, #808080 25%, transparent 25%)',
    'linear-gradient(45deg, transparent 75%, #808080 75%)',
    'linear-gradient(-45deg, transparent 75%, #808080 75%)',
  ].join(', '),
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
};

/** 顶部操作按钮基础样式 */
const TOP_BTN = 'p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-sm';

/** 顶部操作按钮配置 */
interface TopAction {
  icon: LucideIcon;
  title: string;
  hoverColor: string;
  extra?: string;
  onClick: () => void;
}

// ============================================================================
// 主组件
// ============================================================================

export const LargeImagePreview = React.memo(function LargeImagePreview({
  url,
  onClose,
}: LargeImagePreviewProps) {
  const [src, setSrc] = useState<string>('');
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [format, setFormat] = useState<string>('');

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── 缩放 & 重置 ──

  const handleZoom = useCallback((delta: number) => {
    setScale(s => {
      const newScale = Math.min(Math.max(0.1, s + delta), 5);
      return parseFloat(newScale.toFixed(2));
    });
  }, []);

  const resetView = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // ── 初始化加载 ──

  useEffect(() => {
    if (!url) {
      setSrc('');
      return;
    }

    const finalUrl = resolveImageSrc(url);
    setSrc(finalUrl);
    resetView();
    setFormat(extractFormatLabel(url));

    const img = new Image();
    img.onload = () => {
      setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = finalUrl;

    if (url.startsWith('data:image/')) {
      const base64Length = url.length - (url.indexOf(',') + 1);
      const sizeInBytes = Math.ceil(base64Length * 3 / 4);
      setFileSize(formatBytes(sizeInBytes));
    } else {
      setFileSize(null);
    }
  }, [url, resetView]);

  // ── 键盘快捷键 ──

  useEffect(() => {
    if (!url) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape': onClose(); break;
        case '+': case '=': handleZoom(0.1); break;
        case '-': case '_': handleZoom(-0.1); break;
        case '0': resetView(); break;
        case 'ArrowUp':    setPosition(p => ({ ...p, y: p.y + 20 })); break;
        case 'ArrowDown':  setPosition(p => ({ ...p, y: p.y - 20 })); break;
        case 'ArrowLeft':  setPosition(p => ({ ...p, x: p.x + 20 })); break;
        case 'ArrowRight': setPosition(p => ({ ...p, x: p.x - 20 })); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [url, onClose, handleZoom, resetView]);

  // ── 滚轮缩放 ──

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    handleZoom(e.deltaY > 0 ? -0.1 : 0.1);
  }, [handleZoom]);

  // ── 鼠标拖拽平移 ──

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsDragging(true);
    setPosition(pos => {
      dragStartRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
      return pos;
    });
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    setIsDragging(dragging => {
      if (!dragging) return false;
      e.preventDefault();
      const { x: sx, y: sy } = dragStartRef.current;
      setPosition({ x: e.clientX - sx, y: e.clientY - sy });
      return true;
    });
  }, []);

  const onMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // ── 复制 / 下载 / 双击 ──

  const handleCopy = useCallback(async () => {
    if (!url) return;
    if (url.startsWith('data:image/')) {
      await TauriService.writeImageBase64(url);
    } else {
      await TauriService.copyImageFromFile(url);
    }
  }, [url]);

  const handleDownload = useCallback(async () => {
    if (!url) return;
    await TauriService.saveClipboardImage();
  }, [url]);

  const handleDoubleClick = useCallback(() => {
    setScale(s => (s === 1 ? 2 : 1));
    setPosition({ x: 0, y: 0 });
  }, []);

  const stopPropagation = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  // ── 非预览状态 ──
  if (!url) return null;

  // 顶部操作按钮
  const topActions: TopAction[] = [
    { icon: Copy,     title: '复制 (Ctrl+C)', hoverColor: 'hover:text-indigo-400',  onClick: handleCopy },
    { icon: Download, title: '保存到...',      hoverColor: 'hover:text-emerald-400', onClick: handleDownload },
    { icon: X,        title: '关闭 (Esc)',     hoverColor: 'hover:text-red-400 hover:bg-red-500/20', extra: 'ml-2', onClick: onClose },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex flex-col bg-black/95 select-none"
        onClick={onClose}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* 顶部栏 */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-50 pointer-events-none">
          <div className="flex flex-col gap-1 text-white/50 text-xs pointer-events-auto">
            <span className="font-mono bg-white/10 px-2 py-1 rounded">{format}</span>
          </div>

          <div className="flex gap-2 pointer-events-auto">
            {topActions.map(({ icon: Icon, title, hoverColor, extra, onClick }) => (
              <button
                key={title}
                onClick={onClick}
                className={`${TOP_BTN} ${hoverColor} ${extra ?? ''}`}
                title={title}
              >
                <Icon className="w-5 h-5" />
              </button>
            ))}
          </div>
        </div>

        {/* 主画布区域 */}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden relative flex items-center justify-center cursor-move"
          onWheel={onWheel}
          onMouseDown={onMouseDown}
        >
          {/* 棋盘格背景 */}
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={CHECKERBOARD_STYLE}
          />

          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale, opacity: 1, x: position.x, y: position.y }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={isDragging ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 30 }}
            className="relative"
            onClick={stopPropagation}
          >
            {src && (
              <img
                ref={imgRef}
                src={src}
                alt="Full Preview"
                onDoubleClick={handleDoubleClick}
                draggable={false}
                className="max-w-[85vw] max-h-[85vh] object-contain shadow-2xl rounded-sm"
              />
            )}
          </motion.div>
        </div>

        {/* 底部悬浮控制栏 */}
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 px-5 py-2.5 rounded-full bg-neutral-900/80 border border-white/10 text-white text-sm backdrop-blur-md shadow-2xl z-50 transition-all hover:bg-neutral-900"
          onClick={stopPropagation}
        >
          {/* 信息区 */}
          <div className="flex items-center gap-3 text-xs text-neutral-400 border-r border-white/10 pr-4 mr-1">
            {dimensions ? `${dimensions.width}×${dimensions.height}` : '...'}
            {fileSize && <span>{fileSize}</span>}
          </div>

          {/* 缩放控制区 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleZoom(-0.1)}
              className="p-1.5 hover:bg-white/10 rounded-full transition-colors active:scale-90"
              title="缩小 (-)"
            >
              <ZoomOut className="w-4 h-4 cursor-pointer" />
            </button>

            <span
              className="w-12 text-center font-mono cursor-pointer hover:text-indigo-400 transition-colors"
              onClick={resetView}
              title="重置视图 (0)"
            >
              {Math.round(scale * 100)}%
            </span>

            <button
              onClick={() => handleZoom(0.1)}
              className="p-1.5 hover:bg-white/10 rounded-full transition-colors active:scale-90"
              title="放大 (+)"
            >
              <ZoomIn className="w-4 h-4 cursor-pointer" />
            </button>
          </div>

          <div className="w-px h-3 bg-white/10 mx-1" />

          {/* 重置 */}
          <button
            onClick={resetView}
            className="p-1.5 hover:bg-white/10 rounded-full text-neutral-400 hover:text-white transition-colors"
            title="重置位置与缩放"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});
