import { Hash } from 'lucide-react';
import { ChannelInput } from './ChannelInput';
import type { ColorState } from './useColorState';

interface ColorInputPanelProps {
  state: ColorState;
}

/** 根据当前模式渲染对应的颜色值输入区域 */
export function ColorInputPanel({ state }: ColorInputPanelProps) {
  const { mode, displayColor, rgba, hslDraft, setHexFromInput, setRgbaChannel, setHslaChannel } = state;

  if (mode === 'HEX') {
    return (
      <div className="flex items-center rounded-lg px-2.5 py-1.5 border transition-colors bg-neutral-50 dark:bg-neutral-900/50 border-neutral-200/50 dark:border-neutral-700/50 focus-within:border-indigo-500/50 focus-within:bg-white dark:focus-within:bg-neutral-900">
        <Hash className="w-3.5 h-3.5 shrink-0 mr-1.5 text-neutral-400 dark:text-neutral-500" />
        <input
          type="text"
          value={displayColor.replace('#', '').toUpperCase()}
          onChange={(e) => setHexFromInput(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 w-full bg-transparent text-xs font-mono outline-none tracking-wider text-neutral-800 dark:text-neutral-200"
          spellCheck={false}
          placeholder="FFFFFFFF"
        />
      </div>
    );
  }

  if (mode === 'RGB') {
    return (
      <div className="flex gap-1">
        <ChannelInput label="R" value={rgba.r} max={255} onChange={(v) => setRgbaChannel('r', v)} />
        <ChannelInput label="G" value={rgba.g} max={255} onChange={(v) => setRgbaChannel('g', v)} />
        <ChannelInput label="B" value={rgba.b} max={255} onChange={(v) => setRgbaChannel('b', v)} />
        <ChannelInput label="A" value={Math.round(rgba.a * 100)} max={100} onChange={(v) => setRgbaChannel('a', v / 100)} />
      </div>
    );
  }

  // HSL
  return (
    <div className="flex gap-1">
      <ChannelInput label="H" value={hslDraft.h} max={359} onChange={(v) => setHslaChannel('h', v)} />
      <ChannelInput label="S" value={hslDraft.s} max={100} onChange={(v) => setHslaChannel('s', v)} />
      <ChannelInput label="L" value={hslDraft.l} max={100} onChange={(v) => setHslaChannel('l', v)} />
      <ChannelInput label="A" value={Math.round(hslDraft.a * 100)} max={100} onChange={(v) => setHslaChannel('a', v / 100)} />
    </div>
  );
}
