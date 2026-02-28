import { ChevronDown } from 'lucide-react';
import type { ColorMode } from './useColorState';
import './styles/color-picker.css';

interface ColorModeSelectorProps {
  mode: ColorMode;
  onCycle: () => void;
  onSelect: (mode: ColorMode) => void;
}

const MODES: ColorMode[] = ['HEX', 'RGB', 'HSL'];

/** 颜色模式切换按钮 + 下拉菜单 */
export function ColorModeSelector({ mode, onCycle, onSelect }: ColorModeSelectorProps) {
  return (
    <div className="clip-item-color-picker-mode group">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCycle();
        }}
        className="clip-item-color-picker-mode-btn"
      >
        {mode}
        <ChevronDown className="clip-item-color-picker-mode-btn-icon" />
      </button>

      {/* 悬停下拉菜单 */}
      <div className="clip-item-color-picker-mode-menu">
        {MODES.map((m) => (
          <button
            key={m}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(m);
            }}
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
