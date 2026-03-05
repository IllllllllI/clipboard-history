import React from 'react';
import { LayoutGrid, Images, Rows3 } from 'lucide-react';
import type { GalleryDisplayMode } from '../../types';
import type { GalleryTheme } from './types';

const MODE_OPTIONS: { value: GalleryDisplayMode; icon: typeof LayoutGrid; title: string }[] = [
  { value: 'grid', icon: LayoutGrid, title: '宫格' },
  { value: 'carousel', icon: Images, title: '轮播' },
  { value: 'list', icon: Rows3, title: '列表' },
];

interface ModeSegmentProps {
  current: GalleryDisplayMode;
  onChange: (mode: GalleryDisplayMode) => void;
  theme: GalleryTheme;
}

/**
 * 三态分段控件：grid / carousel / list。
 * 添加了 role="radiogroup" + aria-checked 等无障碍语义。
 */
export const ModeSegment = React.memo(function ModeSegment({ current, onChange, theme }: ModeSegmentProps) {
  return (
    <div className="img-gallery__segment" data-theme={theme} role="radiogroup" aria-label="显示模式">
      {MODE_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = opt.value === current;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            className="img-gallery__segment-btn"
            data-active={active ? 'true' : 'false'}
            data-theme={theme}
            onClick={(e) => {
              e.stopPropagation();
              onChange(opt.value);
            }}
            title={opt.title}
          >
            <Icon className="img-gallery__icon-12" />
          </button>
        );
      })}
    </div>
  );
});
