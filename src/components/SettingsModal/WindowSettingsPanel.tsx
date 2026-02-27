import React from 'react';
import type { WindowSettingsPanelProps } from './types';
import type { WindowPlacementMode } from '../../types';

export function WindowSettingsPanel({
  dark,
  settings,
  toggleSettingsAfterShortcut,
  windowPlacementOptions,
  selectedPlacementLabel,
  isCustomPlacement,
  isCustomAnchorPlacement,
  updateSettings,
  ToggleSwitch,
  SettingRow,
}: WindowSettingsPanelProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">窗口行为</h3>
        {toggleSettingsAfterShortcut.filter((item) => item.key !== 'showImagePreview').map(({ key, title, desc }) => (
          <SettingRow key={String(key)} title={title} desc={desc}>
            <ToggleSwitch dark={dark} on={!!settings[key]} onToggle={() => updateSettings({ [key]: !settings[key] })} />
          </SettingRow>
        ))}
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">窗口位置</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {windowPlacementOptions.map((opt) => {
              const active = opt.value === settings.windowPlacement.mode;

              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    const mode = opt.value as WindowPlacementMode;
                    updateSettings({
                      windowPlacement: {
                        ...settings.windowPlacement,
                        mode,
                      },
                    });
                  }}
                  className={`w-full text-left rounded-xl border p-3 transition-colors ${active
                    ? (dark
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-indigo-500 bg-indigo-50')
                    : (dark
                      ? 'border-neutral-700 bg-neutral-800/40 hover:border-neutral-600'
                      : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300')
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-sm font-medium ${active ? 'text-indigo-500' : ''}`}>{opt.label}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">{opt.desc}</p>
                    </div>
                    <span
                      className={`mt-0.5 h-4 w-4 rounded-full border flex-shrink-0 ${active
                        ? 'border-indigo-500 bg-indigo-500'
                        : (dark ? 'border-neutral-600 bg-transparent' : 'border-neutral-300 bg-transparent')
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-xs text-neutral-500">
            当前模式：{selectedPlacementLabel ?? '未知'}
          </p>

          {(isCustomPlacement || isCustomAnchorPlacement) && (
            <div className={`rounded-xl border p-3 space-y-2 ${dark ? 'border-neutral-700 bg-neutral-800/40' : 'border-neutral-200 bg-neutral-50'}`}>
              <p className="text-xs text-neutral-500">
                {isCustomAnchorPlacement ? '窗口内锚点偏移（像素）' : '自定义坐标（屏幕绝对坐标）'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500 w-10">X</span>
                  <input
                    type="number"
                    step={1}
                    min={isCustomAnchorPlacement ? 0 : undefined}
                    value={settings.windowPlacement.customX}
                    onChange={(e) => {
                      const nextX = Number.parseInt(e.target.value || '0', 10);
                      updateSettings({
                        windowPlacement: {
                          ...settings.windowPlacement,
                          customX: Number.isFinite(nextX) ? nextX : 0,
                        },
                      });
                    }}
                    className={`w-full p-2 rounded-lg border text-sm outline-none ${dark ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-200'}`}
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500 w-10">Y</span>
                  <input
                    type="number"
                    step={1}
                    min={isCustomAnchorPlacement ? 0 : undefined}
                    value={settings.windowPlacement.customY}
                    onChange={(e) => {
                      const nextY = Number.parseInt(e.target.value || '0', 10);
                      updateSettings({
                        windowPlacement: {
                          ...settings.windowPlacement,
                          customY: Number.isFinite(nextY) ? nextY : 0,
                        },
                      });
                    }}
                    className={`w-full p-2 rounded-lg border text-sm outline-none ${dark ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-200'}`}
                  />
                </label>
              </div>
              <p className="text-[11px] text-neutral-500">
                {isCustomAnchorPlacement
                  ? '窗口内偏移量：该像素点将对齐鼠标位置。如 (0,0) 等同于左上角对齐，(400,300) 表示窗口内 400×300 处对准鼠标'
                  : '示例：`120,120` 表示窗口左上角位于屏幕坐标 (120,120)'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
