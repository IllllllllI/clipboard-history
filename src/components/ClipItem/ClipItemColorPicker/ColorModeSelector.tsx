import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ColorMode } from './useColorState';
import './styles/color-picker.css';

interface ColorModeSelectorProps {
  mode: ColorMode;
  onSelect: (mode: ColorMode) => void;
}

const MODES: ColorMode[] = ['HEX', 'RGB', 'HSL'];

const MODE_HELP_TEXT: Record<ColorMode, string> = {
  HEX: 'HEX：#RRGGBB 或 #RRGGBBAA',
  RGB: 'RGB：R/G/B + A(0-100%)',
  HSL: 'HSL：H/S/L + A(0-100%)',
};

/** 颜色模式切换按钮 + 下拉菜单 */
export function ColorModeSelector({ mode, onSelect }: ColorModeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      ref={rootRef}
      className={`clip-item-color-picker-mode ${isOpen ? 'clip-item-color-picker-mode-open' : ''}`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((open) => !open);
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`颜色模式：${mode}。${MODE_HELP_TEXT[mode]}`}
        title={MODE_HELP_TEXT[mode]}
        className="clip-item-color-picker-mode-btn"
      >
        {mode}
        <ChevronDown className="clip-item-color-picker-mode-btn-icon" />
      </button>

      {/* 点击展开菜单 */}
      <div className="clip-item-color-picker-mode-menu" role="menu">
        {MODES.map((m) => (
          <button
            key={m}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(m);
              setIsOpen(false);
            }}
            role="menuitemradio"
            aria-checked={mode === m}
            title={MODE_HELP_TEXT[m]}
            className={`clip-item-color-picker-mode-item ${
              mode === m
                ? 'clip-item-color-picker-mode-item-active'
                : ''
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
