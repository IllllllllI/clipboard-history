import React from 'react';
import type { ShortcutSettingsPanelProps } from './types';

export function ShortcutSettingsPanel({
  dark,
  settings,
  globalShortcutError,
  immersiveShortcutError,
  shortcutRegistering,
  updateSettings,
  ShortcutRecorder,
}: ShortcutSettingsPanelProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">快捷键设置</h3>
        <div className="space-y-2">
          <p className="font-medium text-sm">全局唤起快捷键</p>
          <ShortcutRecorder
            dark={dark}
            value={settings.globalShortcut}
            onChange={(value) => updateSettings({ globalShortcut: value })}
            error={globalShortcutError}
            isRegistering={shortcutRegistering}
            validateRegistration
          />
        </div>

        <div className="space-y-2">
          <p className="font-medium text-sm">沉浸模式快捷键</p>
          <ShortcutRecorder
            dark={dark}
            value={settings.immersiveShortcut}
            onChange={(value) => updateSettings({ immersiveShortcut: value })}
            error={immersiveShortcutError}
          />
        </div>
      </div>
    </div>
  );
}
