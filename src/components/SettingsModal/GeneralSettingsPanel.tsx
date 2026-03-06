import React, { useMemo } from 'react';
import type { GeneralSettingsPanelProps } from './types';

// ── 微型组件：滑块控制器（隔离拖动期间的疯狂重渲染） ──
function RangeControl({
  dark,
  value,
  onChangeComplete
}: {
  dark: boolean;
  value: number;
  onChangeComplete: (val: number) => void;
}) {
  const [localVal, setLocalVal] = React.useState(value);

  // 外部值变动时同步（比如重置设置时）
  React.useEffect(() => {
    setLocalVal(value);
  }, [value]);

  return (
    <>
      <input
        type="range"
        min="10"
        max="500"
        step="10"
        value={localVal}
        // 仅修改局部状态，保证滑块在 UI 上顺滑移动
        onChange={(e) => setLocalVal(Number.parseInt(e.target.value, 10))}
        // 鼠标松开或触摸结束时，才向外提交修改并触发庞大的面板重绘
        onMouseUp={() => onChangeComplete(localVal)}
        onTouchEnd={() => onChangeComplete(localVal)}
        className="sm-panel__range"
        data-theme={dark ? 'dark' : 'light'}
      />
      <div className="sm-panel__range-values" data-theme={dark ? 'dark' : 'light'}>
        <span>10</span>
        <span className="sm-panel__range-current">{localVal}</span>
        <span>500</span>
      </div>
    </>
  );
}

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
  const statItems = useMemo(() => [
    { label: '总计', value: stats.total, color: '' },
    { label: '今日', value: stats.today, color: '--indigo' },
    { label: '置顶', value: stats.pinned, color: '--emerald' },
    { label: '收藏', value: stats.favorites, color: '--amber' },
  ], [stats.total, stats.today, stats.pinned, stats.favorites]);

  return (
    <div className="sm-panel__stack">
      <div className="sm-panel__stats-grid">
        {statItems.map((item) => (
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
            <p className="sm-panel__label">历史记录容量上限</p>
            <RangeControl
              dark={dark}
              value={settings.maxItems}
              onChangeComplete={(val) => updateSettings({ maxItems: val })}
            />
            <p className="sm-panel__muted">超过上限后会按时间自动淘汰最旧记录（不影响置顶/收藏状态本身）</p>
          </div>

          <div className="sm-panel__block--tight">
            <p className="sm-panel__label">自动清理周期（天）</p>
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
            <p className="sm-panel__muted">按最后更新时间清理历史记录；选择“从不清理”将关闭自动清理</p>
          </div>
        </div>
      </section>
    </div>
  );
}
