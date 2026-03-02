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
  const commonBehaviorItems = toggleSettingsAfterShortcut.filter(
    (item) => item.key === 'hideOnAction' || item.key === 'hideOnDrag' || item.key === 'hideAfterDrag'
  );

  const advancedBehaviorItems = toggleSettingsAfterShortcut.filter(
    (item) => item.key === 'showDragDownloadHud' || item.key === 'prefetchImageOnDragStart'
  );

  return (
    <div className="sm-panel__stack">
      <section className="sm-panel__section" data-theme={dark ? 'dark' : 'light'}>
        <h3 className="sm-panel__section-title">窗口行为</h3>
        <p className="sm-panel__muted">常用行为</p>
        {commonBehaviorItems.map(({ key, title, desc }) => (
          <SettingRow key={String(key)} title={title} desc={desc}>
            <ToggleSwitch dark={dark} on={!!settings[key]} onToggle={() => updateSettings({ [key]: !settings[key] })} />
          </SettingRow>
        ))}

        <p className="sm-panel__muted">拖拽高级行为（按需开启）</p>
        {advancedBehaviorItems.map(({ key, title, desc }) => (
          <SettingRow key={String(key)} title={title} desc={desc}>
            <ToggleSwitch dark={dark} on={!!settings[key]} onToggle={() => updateSettings({ [key]: !settings[key] })} />
          </SettingRow>
        ))}
      </section>

      <section className="sm-panel__section" data-theme={dark ? 'dark' : 'light'}>
        <h3 className="sm-panel__section-title">窗口位置</h3>
        <div className="sm-panel__stack">
          <p className="sm-panel__muted">该设置决定“通过快捷键唤起窗口”时的弹出位置策略</p>
          <div className="sm-panel__option-grid">
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
                  className="sm-panel__option-card"
                  data-active={active ? 'true' : 'false'}
                  data-theme={dark ? 'dark' : 'light'}
                >
                  <div className="sm-panel__option-head">
                    <div>
                      <p className="sm-panel__option-title" data-active={active ? 'true' : 'false'}>{opt.label}</p>
                      <p className="sm-panel__option-desc">{opt.desc}</p>
                    </div>
                    <span
                      className="sm-panel__option-indicator"
                      data-active={active ? 'true' : 'false'}
                      data-theme={dark ? 'dark' : 'light'}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <p className="sm-panel__note">
            当前模式：{selectedPlacementLabel ?? '未知'}
          </p>

          {(isCustomPlacement || isCustomAnchorPlacement) && (
            <div className="sm-panel__custom-box" data-theme={dark ? 'dark' : 'light'}>
              <p className="sm-panel__muted">
                {isCustomAnchorPlacement ? '窗口内锚点偏移（像素）' : '自定义坐标（屏幕绝对坐标）'}
              </p>
              <div className="sm-panel__custom-grid">
                <label className="sm-panel__custom-label">
                  <span className="sm-panel__custom-axis">X</span>
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
                    className="sm-field__number"
                    data-theme={dark ? 'dark' : 'light'}
                  />
                </label>
                <label className="sm-panel__custom-label">
                  <span className="sm-panel__custom-axis">Y</span>
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
                    className="sm-field__number"
                    data-theme={dark ? 'dark' : 'light'}
                  />
                </label>
              </div>
              <p className="sm-panel__note--tiny">
                {isCustomAnchorPlacement
                  ? '窗口内偏移量：该像素点将对齐鼠标位置。如 (0,0) 等同于左上角对齐，(400,300) 表示窗口内 400×300 处对准鼠标'
                  : '示例：120,120 表示窗口左上角固定在屏幕坐标 (120,120)'}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
