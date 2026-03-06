import React, { useRef, useCallback } from 'react';
import { LayoutGrid, Images, Rows3 } from 'lucide-react';
import type { GalleryDisplayMode } from '../../types';
import type { GalleryTheme } from './types';

const MODE_OPTIONS: { value: GalleryDisplayMode; icon: typeof LayoutGrid; title: string }[] = [
  { value: 'grid', icon: LayoutGrid, title: '宫格展示' },
  { value: 'carousel', icon: Images, title: '轮播展示' },
  { value: 'list', icon: Rows3, title: '列表展示' },
];

interface ModeSegmentProps {
  current: GalleryDisplayMode;
  onChange: (mode: GalleryDisplayMode) => void;
  theme: GalleryTheme;
}

/**
 * 三态分段控件：grid / carousel / list。
 * 支持完整的 WAI-ARIA radiogroup 语义以及键盘方向键导航。
 */
export const ModeSegment = React.memo(function ModeSegment({ current, onChange, theme }: ModeSegmentProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 键盘方向键支持 (ARIA radiogroup 标准行为)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    
    e.preventDefault();
    const currentIndex = MODE_OPTIONS.findIndex((opt) => opt.value === current);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % MODE_OPTIONS.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + MODE_OPTIONS.length) % MODE_OPTIONS.length;
    }

    const nextMode = MODE_OPTIONS[nextIndex].value;
    onChange(nextMode);

    // 焦点跟随移动
    requestAnimationFrame(() => {
      const nextBtn = containerRef.current?.querySelector(`[data-mode-val="${nextMode}"]`) as HTMLButtonElement | null;
      nextBtn?.focus();
    });
  }, [current, onChange]);

  return (
    <div 
      className="img-gallery__segment" 
      data-theme={theme} 
      role="radiogroup" 
      aria-label="相册显示模式"
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      {MODE_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = opt.value === current;
        return (
          <button
            key={opt.value}
            data-mode-val={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            /* 不在激活状态下的 radio 应从 Tab 序列中移除，由外层或方向键接管 */
            tabIndex={active ? 0 : -1}
            className="img-gallery__segment-btn"
            data-active={active ? 'true' : 'false'}
            data-theme={theme}
            onClick={(e) => {
              e.stopPropagation();
              onChange(opt.value);
            }}
            title={opt.title}
            aria-label={opt.title}
          >
            <Icon className="img-gallery__icon-12" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
});
