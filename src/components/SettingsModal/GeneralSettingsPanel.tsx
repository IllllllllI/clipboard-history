import React from 'react';
import type { GeneralSettingsPanelProps } from './types';

export function GeneralSettingsPanel({
  dark,
  stats,
  settings,
  toggleSettings,
  autoClearOptions,
  updateSettings,
  ToggleSwitch,
  SettingRow,
}: GeneralSettingsPanelProps) {
  return (
    <div className="sm-panel__stack">
      <div className="sm-panel__stats-grid">
        {[
          { label: '总计', value: stats.total, color: '' },
          { label: '今日', value: stats.today, color: '--indigo' },
          { label: '置顶', value: stats.pinned, color: '--emerald' },
          { label: '收藏', value: stats.favorites, color: '--amber' },
        ].map((item) => (
          <div key={item.label} className="sm-panel__stat-card" data-theme={dark ? 'dark' : 'light'}>
            <p className="sm-panel__stat-label">{item.label}</p>
            <p className="sm-panel__stat-value" data-tone={item.color ? item.color.replace('--', '') : 'default'}>{item.value}</p>
          </div>
        ))}
      </div>

      <section className="sm-panel__section" data-theme={dark ? 'dark' : 'light'}>
        <h3 className="sm-panel__section-title">基本设置</h3>
        {toggleSettings.map(({ key, title, desc }) => (
          <SettingRow key={String(key)} title={title} desc={desc}>
            <ToggleSwitch dark={dark} on={!!settings[key]} onToggle={() => updateSettings({ [key]: !settings[key] })} />
          </SettingRow>
        ))}
      </section>

      <section className="sm-panel__section" data-theme={dark ? 'dark' : 'light'}>
        <h3 className="sm-panel__section-title">历史记录</h3>
        <div className="sm-panel__fields-grid">
          <div className="sm-panel__block--tight">
            <p className="sm-panel__label">历史记录上限</p>
            <input
              type="range"
              min="10"
              max="500"
              step="10"
              value={settings.maxItems}
              onChange={(e) => updateSettings({ maxItems: Number.parseInt(e.target.value, 10) })}
              className="sm-panel__range"
              data-theme={dark ? 'dark' : 'light'}
            />
            <div className="sm-panel__range-values" data-theme={dark ? 'dark' : 'light'}>
              <span>10</span>
              <span className="sm-panel__range-current">{settings.maxItems}</span>
              <span>500</span>
            </div>
          </div>

          <div className="sm-panel__block--tight">
            <p className="sm-panel__label">自动清理（天）</p>
            <select
              value={settings.autoClearDays}
              onChange={(e) => updateSettings({ autoClearDays: Number.parseInt(e.target.value, 10) })}
              className="sm-field__select"
              data-theme={dark ? 'dark' : 'light'}
            >
              {autoClearOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>
    </div>
  );
}
