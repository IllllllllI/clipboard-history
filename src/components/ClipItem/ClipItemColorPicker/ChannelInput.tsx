import { useRef } from 'react';
import './styles/color-picker.css';

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
    <div className="clip-item-color-picker-channel-wrap">
      <span className="clip-item-color-picker-channel-label">
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
        className="clip-item-color-picker-channel-input"
      />
    </div>
  );
}
