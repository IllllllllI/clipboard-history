import React from 'react';
import type { ToggleSwitchProps } from './types';

export const ToggleSwitch = React.memo(function ToggleSwitch({ on, onToggle, dark }: ToggleSwitchProps) {
  return (
    <button
      onClick={onToggle}
      className={`w-10 h-5 rounded-full transition-colors relative ${on ? 'bg-indigo-500' : dark ? 'bg-neutral-700' : 'bg-neutral-300'}`}
    >
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${on ? 'left-5.5' : 'left-0.5'}`} />
    </button>
  );
});
