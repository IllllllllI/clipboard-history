import React from 'react';
import type { SettingRowProps } from './types';

export const SettingRow = React.memo(function SettingRow({ title, desc, children }: SettingRowProps) {
  return (
    <div className="sm-setting-row">
      <div className="sm-setting-row__content">
        <p className="sm-setting-row__title">{title}</p>
        <p className="sm-setting-row__desc">{desc}</p>
      </div>
      <div className="sm-setting-row__control">{children}</div>
    </div>
  );
});
