import React from 'react';
import type { SettingRowProps } from './types';

export const SettingRow = React.memo(function SettingRow({ title, desc, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium text-sm">{title}</p>
        <p className="text-xs mt-0.5 text-neutral-500">{desc}</p>
      </div>
      {children}
    </div>
  );
});
