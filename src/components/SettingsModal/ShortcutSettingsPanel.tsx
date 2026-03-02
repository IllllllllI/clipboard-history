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
    <div className="sm-panel__stack">
      <section className="sm-panel__section" data-theme={dark ? 'dark' : 'light'}>
        <h3 className="sm-panel__section-title">快捷键设置</h3>
        <div className="sm-panel__block">
          <p className="sm-panel__label">全局唤起快捷键</p>
          <p className="sm-panel__muted">在任何应用中按下后唤起主窗口（若被其他软件占用会提示冲突）</p>
          <ShortcutRecorder
            dark={dark}
            value={settings.globalShortcut}
            onChange={(value) => updateSettings({ globalShortcut: value })}
            error={globalShortcutError}
            isRegistering={shortcutRegistering}
            validateRegistration
          />
        </div>

        <div className="sm-panel__block">
          <p className="sm-panel__label">沉浸模式快捷键</p>
          <p className="sm-panel__muted">用于切换沉浸模式，不会影响全局唤起快捷键</p>
          <ShortcutRecorder
            dark={dark}
            value={settings.immersiveShortcut}
            onChange={(value) => updateSettings({ immersiveShortcut: value })}
            error={immersiveShortcutError}
          />
        </div>
      </section>
    </div>
  );
}
