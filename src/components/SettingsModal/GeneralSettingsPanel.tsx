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
    <div className="space-y-8">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '总计', value: stats.total, color: '' },
          { label: '今日', value: stats.today, color: 'text-indigo-500' },
          { label: '置顶', value: stats.pinned, color: 'text-emerald-500' },
          { label: '收藏', value: stats.favorites, color: 'text-amber-500' },
        ].map((item) => (
          <div key={item.label} className={`p-3 rounded-xl text-center ${dark ? 'bg-neutral-800/50' : 'bg-neutral-50'}`}>
            <p className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-1">{item.label}</p>
            <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">基本设置</h3>
        {toggleSettings.map(({ key, title, desc }) => (
          <SettingRow key={String(key)} title={title} desc={desc}>
            <ToggleSwitch dark={dark} on={!!settings[key]} onToggle={() => updateSettings({ [key]: !settings[key] })} />
          </SettingRow>
        ))}
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">历史记录</h3>
        <div className="space-y-2">
          <p className="font-medium text-sm">历史记录上限</p>
          <input
            type="range"
            min="10"
            max="500"
            step="10"
            value={settings.maxItems}
            onChange={(e) => updateSettings({ maxItems: Number.parseInt(e.target.value, 10) })}
            className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-indigo-500 ${dark ? 'bg-neutral-700' : 'bg-neutral-200'}`}
          />
          <div className={`flex justify-between text-[10px] font-mono ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
            <span>10</span>
            <span className="font-bold text-indigo-500">{settings.maxItems}</span>
            <span>500</span>
          </div>
        </div>

        <div className="space-y-2">
          <p className="font-medium text-sm">自动清理（天）</p>
          <select
            value={settings.autoClearDays}
            onChange={(e) => updateSettings({ autoClearDays: Number.parseInt(e.target.value, 10) })}
            className={`w-full p-2 rounded-lg border text-sm outline-none ${dark ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-neutral-50 border-neutral-200'}`}
          >
            {autoClearOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
