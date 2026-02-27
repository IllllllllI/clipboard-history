import { useRef } from 'react';

interface ChannelInputProps {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}

/** 单通道数值输入（R/G/B/H/S/L/A 等） */
export function ChannelInput({ label, value, max, onChange }: ChannelInputProps) {
  const wheelDeltaRef = useRef(0);

  const clamp = (v: number) => Math.max(0, Math.min(max, v));

  return (
    <div className="flex flex-col items-center justify-center gap-0.5 py-1 rounded-lg border transition-colors flex-1 min-w-0 bg-neutral-50 dark:bg-neutral-900/50 border-neutral-200/50 dark:border-neutral-700/50 focus-within:border-indigo-500/50 focus-within:bg-white dark:focus-within:bg-neutral-900">
      <span className="text-[9px] font-bold select-none shrink-0 text-neutral-400 dark:text-neutral-500">
        {label}
      </span>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => {
          const v = parseInt(e.target.value);
          if (!isNaN(v)) onChange(clamp(v));
        }}
        onWheel={(e) => {
          e.preventDefault();
          e.stopPropagation();

          wheelDeltaRef.current += -e.deltaY;
          const threshold = 20;
          const totalSteps = Math.trunc(Math.abs(wheelDeltaRef.current) / threshold);
          if (totalSteps <= 0) return;

          const direction = wheelDeltaRef.current > 0 ? 1 : -1;
          onChange(clamp(value + direction * totalSteps));
          wheelDeltaRef.current -= direction * totalSteps * threshold;
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-transparent text-center text-[11px] font-mono outline-none min-w-0 text-neutral-700 dark:text-neutral-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  );
}
