import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ZoomIn, ZoomOut, Copy, Download, RotateCcw, type LucideIcon } from 'lucide-react';
import { TauriService } from '../services/tauri';
import { detectImageType } from '../utils';
import { formatBytes, extractFormatLabel } from '../utils/imageUrl';
import { useImageResource } from '../hooks/useImageResource';
import './styles/large-image-preview.css';

// ============================================================================
// 类型 & 常量
// ============================================================================

interface LargeImagePreviewProps {
  url: string | null;
  onClose: () => void;
}

/** 顶部操作按钮配置 */
interface TopAction {
  icon: LucideIcon;
  title: string;
  action: 'copy' | 'download' | 'close';
  onClick: () => void;
}

// ============================================================================
// 主组件
// ============================================================================

export const LargeImagePreview = React.memo(function LargeImagePreview({
  url,
  onClose,
}: LargeImagePreviewProps) {
  const imageType = detectImageType(url ?? '');
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const [fileSize, setFileSize] = useState<string | null>(null);
  const [format, setFormat] = useState<string>('');

  const {
    containerRef,
    imageSrc,
    imageSize,
    onImageLoad,
  } = useImageResource({
    sourceText: url ?? '',
    imageType,
    disableLazyLoad: true,
  });

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
      return;
    }

    resetView();
    setFormat(extractFormatLabel(url));

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
    { icon: Copy,     title: '复制 (Ctrl+C)', action: 'copy', onClick: handleCopy },
    { icon: Download, title: '保存到...', action: 'download', onClick: handleDownload },
    { icon: X, title: '关闭 (Esc)', action: 'close', onClick: onClose },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="large-image-preview"
        data-dragging={isDragging ? 'true' : 'false'}
        onClick={onClose}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* 顶部栏 */}
        <div className="large-image-preview__topbar">
          <div className="large-image-preview__format-wrap">
            <span className="large-image-preview__format-pill">{format || 'IMAGE'}</span>
            <span className="large-image-preview__hint">滚轮缩放 · 双击切换 · Esc 关闭</span>
          </div>

          <div className="large-image-preview__top-actions">
            {topActions.map(({ icon: Icon, title, action, onClick }) => (
              <button
                type="button"
                key={title}
                onClick={onClick}
                className="large-image-preview__top-btn"
                data-action={action}
                title={title}
                aria-label={title}
              >
                <Icon className="large-image-preview__top-btn-icon" />
              </button>
            ))}
          </div>
        </div>

        {/* 主画布区域 */}
        <div
          ref={containerRef}
          className="large-image-preview__canvas"
          data-dragging={isDragging ? 'true' : 'false'}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
        >
          {/* 棋盘格背景 */}
          <div className="large-image-preview__checkerboard" />

          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale, opacity: 1, x: position.x, y: position.y }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={isDragging ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 30 }}
            className="large-image-preview__image-wrap"
            onClick={stopPropagation}
          >
            {imageSrc && (
              <img
                src={imageSrc}
                alt="Full Preview"
                onLoad={onImageLoad}
                onDoubleClick={handleDoubleClick}
                draggable={false}
                className="large-image-preview__image"
              />
            )}
          </motion.div>
        </div>

        {/* 底部悬浮控制栏 */}
        <div
          className="large-image-preview__bottombar"
          onClick={stopPropagation}
        >
          {/* 信息区 */}
          <div className="large-image-preview__meta">
            {imageSize ? `${imageSize.width}×${imageSize.height}` : '...'}
            {fileSize && <span>{fileSize}</span>}
          </div>

          {/* 缩放控制区 */}
          <div className="large-image-preview__zoom-controls">
            <button
              type="button"
              onClick={() => handleZoom(-0.1)}
              className="large-image-preview__icon-btn"
              title="缩小 (-)"
              aria-label="缩小"
            >
              <ZoomOut className="large-image-preview__icon" />
            </button>

            <span
              className="large-image-preview__zoom-text"
              onClick={resetView}
              title="重置视图 (0)"
            >
              {Math.round(scale * 100)}%
            </span>

            <button
              type="button"
              onClick={() => handleZoom(0.1)}
              className="large-image-preview__icon-btn"
              title="放大 (+)"
              aria-label="放大"
            >
              <ZoomIn className="large-image-preview__icon" />
            </button>
          </div>

          <div className="large-image-preview__divider" />

          {/* 重置 */}
          <button
            type="button"
            onClick={resetView}
            className="large-image-preview__icon-btn large-image-preview__icon-btn--reset"
            title="重置位置与缩放"
            aria-label="重置视图"
          >
            <RotateCcw className="large-image-preview__icon" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});
