import React from 'react';
import type { WindowSettingsPanelProps } from './types';
import type { WindowPlacementMode, GalleryDisplayMode, GalleryScrollDirection, GalleryWheelMode } from '../../types';

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

  const imagePreviewItem = toggleSettingsAfterShortcut.find(
    (item) => item.key === 'showImagePreview',
  );

  const galleryDisplayOptions: { value: GalleryDisplayMode; label: string; desc: string }[] = [
    { value: 'grid',     label: '紧凑宫格', desc: '最多 4 张总览，2 列紧凑显示' },
    { value: 'carousel', label: '轮播相册', desc: '主图预览 + 轮播切换 + 浮动计数' },
    { value: 'list',     label: '列表模式', desc: '缩略行排列，hover 预览，交替底色' },
  ];

  const galleryDirectionOptions: { value: GalleryScrollDirection; label: string; desc: string }[] = [
    { value: 'horizontal', label: '水平方向', desc: '← → 左右切换，缩略图横向排列' },
    { value: 'vertical',   label: '垂直方向', desc: '↑ ↓ 上下切换，时钟式滚动' },
  ];

  const galleryWheelModeOptions: { value: GalleryWheelMode; label: string; desc: string }[] = [
    { value: 'ctrl', label: '仅 Ctrl+滚轮切图', desc: '不按 Ctrl 时，滚轮用于页面滚动' },
    { value: 'always', label: '总是滚轮切图', desc: '鼠标位于相册上时直接切图并阻断页面滚动' },
  ];

  return (
    <div className="sm-panel__stack">
      <section className="sm-panel__section" data-theme={dark ? 'dark' : 'light'}>
        <h3 className="sm-panel__section-title">图片显示</h3>
        {imagePreviewItem && (
          <SettingRow title={imagePreviewItem.title} desc={imagePreviewItem.desc}>
            <ToggleSwitch dark={dark} on={!!settings.showImagePreview} onToggle={() => updateSettings({ showImagePreview: !settings.showImagePreview })} />
          </SettingRow>
        )}

        <p className="sm-panel__muted">多图相册显示模式</p>
        <div className="sm-panel__option-grid">
          {galleryDisplayOptions.map((opt) => {
            const active = opt.value === settings.galleryDisplayMode;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateSettings({ galleryDisplayMode: opt.value })}
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

        {settings.galleryDisplayMode === 'carousel' && (
          <>
            <p className="sm-panel__muted">轮播滚动方向</p>
            <div className="sm-panel__option-grid">
              {galleryDirectionOptions.map((opt) => {
                const active = opt.value === settings.galleryScrollDirection;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateSettings({ galleryScrollDirection: opt.value })}
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

            <p className="sm-panel__muted">滚轮触发方式</p>
            <div className="sm-panel__option-grid">
              {galleryWheelModeOptions.map((opt) => {
                const active = opt.value === settings.galleryWheelMode;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateSettings({ galleryWheelMode: opt.value })}
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
          </>
        )}
      </section>

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
