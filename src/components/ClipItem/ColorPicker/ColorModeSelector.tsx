import { ChevronDown } from 'lucide-react';
import type { ColorMode } from './useColorState';

interface ColorModeSelectorProps {
  mode: ColorMode;
  onCycle: () => void;
  onSelect: (mode: ColorMode) => void;
}

const MODES: ColorMode[] = ['HEX', 'RGB', 'HSL'];

/** 颜色模式切换按钮 + 下拉菜单 */
export function ColorModeSelector({ mode, onCycle, onSelect }: ColorModeSelectorProps) {
  return (
    <div className="relative group">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCycle();
        }}
        className="flex items-center justify-center w-14 h-8 rounded-xl border transition-all duration-150 text-[10px] font-bold tracking-wider bg-neutral-100/50 dark:bg-neutral-800/50 border-neutral-200/50 dark:border-neutral-600/60 text-neutral-600 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/80"
      >
        {mode}
        <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
      </button>

      {/* 悬停下拉菜单 */}
      <div className="absolute top-full left-0 mt-1 w-full rounded-xl border shadow-lg overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-10 bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-600/70">
        {MODES.map((m) => (
          <button
            key={m}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(m);
            }}
            className={`w-full text-left px-3 py-1.5 text-[10px] font-bold tracking-wider transition-colors ${
              mode === m
                ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700'
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
