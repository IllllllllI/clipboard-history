import React from 'react';
import type { ToggleSwitchProps } from './types';

export const ToggleSwitch = React.memo(function ToggleSwitch({ on, onToggle, dark }: ToggleSwitchProps) {
  return (
    <button
      onClick={onToggle}
      className="sm-toggle"
      data-on={on ? 'true' : 'false'}
      data-theme={dark ? 'dark' : 'light'}
    >
      <div className="sm-toggle-thumb" data-on={on ? 'true' : 'false'} />
    </button>
  );
});
