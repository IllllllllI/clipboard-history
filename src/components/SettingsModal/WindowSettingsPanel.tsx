import React from 'react';
import type { WindowSettingsPanelProps } from './types';
import type { WindowPlacementMode, GalleryDisplayMode, GalleryScrollDirection, GalleryWheelMode, CompactMetaDisplayMode, ClipItemHudTriggerMouseButton, ClipItemHudTriggerMouseMode, ClipItemHudRadialMenuLayoutProfile, ClipItemHudPositionMode } from '../../types';
import { CLIP_ITEM_HUD_BORDER_RING_WIDTH, CLIP_ITEM_HUD_BORDER_RUN_DURATION } from '../../hud/clipitem/constants';

// ── 通用选项卡渲染器（消除重复的 option-card 模式） ──

interface OptionCardItem<T extends string> {
  value: T;
  label: string;
  desc: string;
}

function OptionCardGrid<T extends string>({
  options,
  activeValue,
  dark,
  onSelect,
}: {
  options: OptionCardItem<T>[];
  activeValue: T;
  dark: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="sm-panel__option-grid">
      {options.map((opt) => {
        const active = opt.value === activeValue;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(opt.value)}
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
  );
}

// ── 选项数据（提取到组件外，避免每次渲染重建） ──

const GALLERY_DISPLAY_OPTIONS: OptionCardItem<GalleryDisplayMode>[] = [
  { value: 'grid',     label: '紧凑宫格', desc: '最多 4 张总览，2 列紧凑显示' },
  { value: 'carousel', label: '轮播相册', desc: '主图预览 + 轮播切换 + 浮动计数' },
  { value: 'list',     label: '列表模式', desc: '缩略行排列，hover 预览，交替底色' },
];

const GALLERY_DIRECTION_OPTIONS: OptionCardItem<GalleryScrollDirection>[] = [
  { value: 'horizontal', label: '水平方向', desc: '← → 左右切换，缩略图横向排列' },
  { value: 'vertical',   label: '垂直方向', desc: '↑ ↓ 上下切换，时钟式滚动' },
];

const GALLERY_WHEEL_MODE_OPTIONS: OptionCardItem<GalleryWheelMode>[] = [
  { value: 'ctrl',   label: '仅 Ctrl+滚轮切图', desc: '不按 Ctrl 时，滚轮用于页面滚动' },
  { value: 'always', label: '总是滚轮切图',       desc: '鼠标位于相册上时直接切图并阻断页面滚动' },
];

const COMPACT_META_DISPLAY_OPTIONS: OptionCardItem<CompactMetaDisplayMode>[] = [
  { value: 'inside',  label: '始终窗口内占位', desc: '时间与悬浮按钮始终占据条目右侧布局空间' },
  { value: 'auto',    label: '自动（推荐）',   desc: '空间充足时占位；窄宽度自动改为覆盖显示，释放内容区' },
  { value: 'overlay', label: '始终覆盖显示',   desc: '时间与悬浮按钮始终覆盖在条目上，不占用内容布局宽度' },
];

const HUD_TRIGGER_BUTTON_OPTIONS: OptionCardItem<ClipItemHudTriggerMouseButton>[] = [
  { value: 'middle', label: '中键（默认）', desc: '按住鼠标中键唤起窗口外 HUD，松开执行操作' },
  { value: 'right',  label: '右键',         desc: '按住鼠标右键唤起窗口外 HUD，松开执行操作' },
];

const HUD_TRIGGER_MODE_OPTIONS: OptionCardItem<ClipItemHudTriggerMouseMode>[] = [
  { value: 'press_release', label: '按下显示，松开触发', desc: '按住触发按钮显示 HUD，移动到按钮后松开即可触发该操作' },
  { value: 'click',         label: '点击显示',           desc: '点击触发按钮显示 HUD，再点击 HUD 按钮执行操作' },
];

const HUD_RADIAL_LAYOUT_OPTIONS: OptionCardItem<ClipItemHudRadialMenuLayoutProfile>[] = [
  { value: 'compact',  label: '紧凑', desc: '节点更靠内，扇区更窄，适合小范围操作' },
  { value: 'standard', label: '标准', desc: '默认手感，命中与视觉平衡' },
  { value: 'relaxed',  label: '宽松', desc: '节点更外扩，扇区更宽，容错更高' },
];

const HUD_POSITION_MODE_OPTIONS: OptionCardItem<ClipItemHudPositionMode>[] = [
  { value: 'dynamic', label: '跟随光标', desc: '根据光标位置动态出现在主窗口最近的边缘' },
  { value: 'top',     label: '顶部',     desc: '始终固定在主窗口顶部居中，水平方向' },
  { value: 'bottom',  label: '底部',     desc: '始终固定在主窗口底部居中，水平方向' },
  { value: 'left',    label: '左侧',     desc: '始终固定在主窗口左侧居中，垂直方向' },
  { value: 'right',   label: '右侧',     desc: '始终固定在主窗口右侧居中，垂直方向' },
];

// ── 微型组件：窗口尺寸指示器（隔离 Resize 导致的重渲染） ──
function WindowSizeDisplay() {
  const [windowSize, setWindowSize] = React.useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  }));

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    let timeoutId: number;
    const syncWindowSize = () => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        setWindowSize({ width: window.innerWidth, height: window.innerHeight });
      }, 150) as unknown as number;
    };
    window.addEventListener('resize', syncWindowSize);
    return () => {
      window.removeEventListener('resize', syncWindowSize);
      clearTimeout(timeoutId);
    };
  }, []);

  return <>{windowSize.width} × {windowSize.height}</>;
}

// ── 主组件 ──

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
  const commonBehaviorItems = React.useMemo(() => toggleSettingsAfterShortcut.filter(
    (item) => item.key === 'hideOnAction' || item.key === 'hideOnDrag' || item.key === 'hideAfterDrag'
  ), [toggleSettingsAfterShortcut]);
  
  const advancedBehaviorItems = React.useMemo(() => toggleSettingsAfterShortcut.filter(
    (item) => item.key === 'showDragDownloadHud' || item.key === 'prefetchImageOnDragStart'
  ), [toggleSettingsAfterShortcut]);
  
  const imagePreviewItem = React.useMemo(() => toggleSettingsAfterShortcut.find(
    (item) => item.key === 'showImagePreview',
  ), [toggleSettingsAfterShortcut]);

  const isAnyHudEnabled = !!settings.clipItemHudEnabled || !!settings.clipItemHudRadialMenuEnabled;
  const isRadialHudEnabled = !!settings.clipItemHudRadialMenuEnabled;

  return (
    <div className="sm-panel__stack">

      {/* ================================================================
          图片显示
          ================================================================ */}
      <section className="sm-panel__section" data-theme={dark ? 'dark' : 'light'}>
        <h3 className="sm-panel__section-title">图片显示</h3>

        {imagePreviewItem && (
          <SettingRow title={imagePreviewItem.title} desc={imagePreviewItem.desc}>
            <ToggleSwitch dark={dark} on={!!settings.showImagePreview} onToggle={() => updateSettings({ showImagePreview: !settings.showImagePreview })} />
          </SettingRow>
        )}

        <p className="sm-panel__muted">多图相册显示模式</p>
        <OptionCardGrid options={GALLERY_DISPLAY_OPTIONS} activeValue={settings.galleryDisplayMode} dark={dark} onSelect={(v) => updateSettings({ galleryDisplayMode: v })} />

        {settings.galleryDisplayMode === 'carousel' && (
          <>
            <p className="sm-panel__muted">轮播滚动方向</p>
            <OptionCardGrid options={GALLERY_DIRECTION_OPTIONS} activeValue={settings.galleryScrollDirection} dark={dark} onSelect={(v) => updateSettings({ galleryScrollDirection: v })} />

            <p className="sm-panel__muted">滚轮触发方式</p>
            <OptionCardGrid options={GALLERY_WHEEL_MODE_OPTIONS} activeValue={settings.galleryWheelMode} dark={dark} onSelect={(v) => updateSettings({ galleryWheelMode: v })} />
          </>
        )}

        <SettingRow title="列表最大条目" desc="列表模式下默认显示的图片条目数，超出后可展开">
          <input
            type="number" min={1} max={30} step={1}
            value={settings.galleryListMaxVisibleItems}
            onChange={(e) => {
              const next = Number.parseInt(e.target.value || '1', 10);
              updateSettings({ galleryListMaxVisibleItems: Number.isFinite(next) ? Math.min(30, Math.max(1, next)) : 6 });
            }}
            className="sm-field__number" data-theme={dark ? 'dark' : 'light'}
          />
        </SettingRow>

        <SettingRow title="文件列表最大条目" desc="文件列表默认显示条目数，超出后可展开">
          <input
            type="number" min={1} max={30} step={1}
            value={settings.fileListMaxVisibleItems}
            onChange={(e) => {
              const next = Number.parseInt(e.target.value || '1', 10);
              updateSettings({ fileListMaxVisibleItems: Number.isFinite(next) ? Math.min(30, Math.max(1, next)) : 5 });
            }}
            className="sm-field__number" data-theme={dark ? 'dark' : 'light'}
          />
        </SettingRow>
      </section>

      {/* ================================================================
          窗口内条目显示
          ================================================================ */}
      <section className="sm-panel__section" data-theme={dark ? 'dark' : 'light'}>
        <h3 className="sm-panel__section-title">窗口内条目显示</h3>

        <SettingRow title="显示条目右侧悬浮按钮" desc="控制条目右侧复制/编辑/删除悬浮按钮显示">
          <ToggleSwitch dark={dark} on={!!settings.clipItemFloatingActionsEnabled} onToggle={() => updateSettings({ clipItemFloatingActionsEnabled: !settings.clipItemFloatingActionsEnabled })} />
        </SettingRow>

        <p className="sm-panel__muted">元信息 / 悬浮按钮显示模式</p>
        <OptionCardGrid options={COMPACT_META_DISPLAY_OPTIONS} activeValue={settings.compactMetaDisplayMode} dark={dark} onSelect={(v) => updateSettings({ compactMetaDisplayMode: v })} />

        <SettingRow title="窗口宽度阈值自动隐藏元信息（px）" desc="当窗口宽度小于等于该值时，自动隐藏类型图标 + 时间/收藏/置顶信息；设为 0 表示禁用">
          <div className="sm-panel__metric-control">
            <input
              type="number" min={0} max={1600} step={1}
              value={settings.clipItemTimeMetaAutoHideWidthPx}
              onChange={(e) => {
                const next = Number.parseInt(e.target.value || '0', 10);
                updateSettings({ clipItemTimeMetaAutoHideWidthPx: Number.isFinite(next) ? Math.min(1600, Math.max(0, next)) : 0 });
              }}
              className="sm-field__number" data-theme={dark ? 'dark' : 'light'}
            />
            {settings.clipItemTimeMetaAutoHideWidthPx <= 0 && (
              <p className="sm-panel__note--tiny">当前自动隐藏：已禁用</p>
            )}
            <p className="sm-panel__note--tiny">当前窗口：<WindowSizeDisplay />px</p>
          </div>
        </SettingRow>

        <SettingRow title="筛选按钮图标模式阈值（px）" desc="当窗口宽度小于等于该值时，顶部筛选按钮自动切换为图标按钮；设为 0 表示禁用">
          <div className="sm-panel__metric-control">
            <input
              type="number" min={0} max={1600} step={1}
              value={settings.headerFilterIconModeWidthPx}
              onChange={(e) => {
                const next = Number.parseInt(e.target.value || '0', 10);
                updateSettings({ headerFilterIconModeWidthPx: Number.isFinite(next) ? Math.min(1600, Math.max(0, next)) : 0 });
              }}
              className="sm-field__number" data-theme={dark ? 'dark' : 'light'}
            />
            {settings.headerFilterIconModeWidthPx <= 0 && (
              <p className="sm-panel__note--tiny">当前图标模式阈值：已禁用</p>
            )}
          </div>
        </SettingRow>
      </section>

      {/* ================================================================
          窗口外 HUD
          ================================================================ */}
      <section className="sm-panel__section" data-theme={dark ? 'dark' : 'light'}>
        <h3 className="sm-panel__section-title">窗口外 HUD</h3>

        {/* ── 开关 ── */}
        <p className="sm-panel__muted">总开关</p>
        <SettingRow title="启用线性 HUD" desc="在条目旁显示窗口外线性操作 HUD（日期/复制/删除等按钮栏）">
          <ToggleSwitch dark={dark} on={!!settings.clipItemHudEnabled} onToggle={() => updateSettings({ clipItemHudEnabled: !settings.clipItemHudEnabled })} />
        </SettingRow>
        <SettingRow title="启用圆形 HUD" desc="按住中键/右键呼出的圆形菜单 HUD（径向菜单）">
          <ToggleSwitch dark={dark} on={!!settings.clipItemHudRadialMenuEnabled} onToggle={() => updateSettings({ clipItemHudRadialMenuEnabled: !settings.clipItemHudRadialMenuEnabled })} />
        </SettingRow>

        {!isAnyHudEnabled && (
          <p className="sm-panel__muted">线性 HUD 和圆形 HUD 均已关闭，以下设置不会生效。</p>
        )}

        {/* ── 共用触发设置（线性+圆形） ── */}
        {isAnyHudEnabled && (
          <>
            <p className="sm-panel__muted">鼠标触发按钮</p>
            <OptionCardGrid options={HUD_TRIGGER_BUTTON_OPTIONS} activeValue={settings.clipItemHudTriggerMouseButton} dark={dark} onSelect={(v) => updateSettings({ clipItemHudTriggerMouseButton: v })} />

            <p className="sm-panel__muted">鼠标触发模式</p>
            <OptionCardGrid options={HUD_TRIGGER_MODE_OPTIONS} activeValue={settings.clipItemHudTriggerMouseMode} dark={dark} onSelect={(v) => updateSettings({ clipItemHudTriggerMouseMode: v })} />
          </>
        )}

        {/* ── 线性 HUD 定位与外观 ── */}
        {!!settings.clipItemHudEnabled && (
          <>
            <p className="sm-panel__muted">线性 HUD 定位</p>
            <OptionCardGrid options={HUD_POSITION_MODE_OPTIONS} activeValue={settings.clipItemHudPositionMode} dark={dark} onSelect={(v) => updateSettings({ clipItemHudPositionMode: v })} />

            <p className="sm-panel__muted">线性 HUD 外观</p>
            <SettingRow title="流光边框速度（秒/圈）" desc="数值越小流动越快，建议范围 0.6 - 8.0">
              <input
                type="number"
                min={CLIP_ITEM_HUD_BORDER_RUN_DURATION.min}
                max={CLIP_ITEM_HUD_BORDER_RUN_DURATION.max}
                step={0.1}
                value={settings.clipItemHudBorderRunDurationSec}
                onChange={(e) => {
                  const next = Number.parseFloat(e.target.value || String(CLIP_ITEM_HUD_BORDER_RUN_DURATION.defaultValue));
                  const clamped = Number.isFinite(next)
                    ? Math.min(CLIP_ITEM_HUD_BORDER_RUN_DURATION.max, Math.max(CLIP_ITEM_HUD_BORDER_RUN_DURATION.min, next))
                    : CLIP_ITEM_HUD_BORDER_RUN_DURATION.defaultValue;
                  updateSettings({ clipItemHudBorderRunDurationSec: Number(clamped.toFixed(2)) });
                }}
                className="sm-field__number" data-theme={dark ? 'dark' : 'light'}
              />
            </SettingRow>
            <SettingRow title="流光边框厚度（px）" desc="边框环宽度，建议范围 1 - 6">
              <input
                type="number"
                min={CLIP_ITEM_HUD_BORDER_RING_WIDTH.min}
                max={CLIP_ITEM_HUD_BORDER_RING_WIDTH.max}
                step={0.5}
                value={settings.clipItemHudBorderRingWidthPx}
                onChange={(e) => {
                  const next = Number.parseFloat(e.target.value || String(CLIP_ITEM_HUD_BORDER_RING_WIDTH.defaultValue));
                  const clamped = Number.isFinite(next)
                    ? Math.min(CLIP_ITEM_HUD_BORDER_RING_WIDTH.max, Math.max(CLIP_ITEM_HUD_BORDER_RING_WIDTH.min, next))
                    : CLIP_ITEM_HUD_BORDER_RING_WIDTH.defaultValue;
                  updateSettings({ clipItemHudBorderRingWidthPx: Number(clamped.toFixed(2)) });
                }}
                className="sm-field__number" data-theme={dark ? 'dark' : 'light'}
              />
            </SettingRow>
          </>
        )}

        {/* ── 圆形 HUD (径向菜单) ── */}
        {isRadialHudEnabled && (
          <>
            <p className="sm-panel__muted">圆形 HUD 布局</p>
            <OptionCardGrid options={HUD_RADIAL_LAYOUT_OPTIONS} activeValue={settings.clipItemHudRadialMenuLayoutProfile} dark={dark} onSelect={(v) => updateSettings({ clipItemHudRadialMenuLayoutProfile: v })} />

            <SettingRow title="圆形菜单炫光动效" desc="开启后使用旋转光环与光束特效；关闭后为普通低动效样式">
              <ToggleSwitch dark={dark} on={!!settings.clipItemHudRadialMenuFancyFx} onToggle={() => updateSettings({ clipItemHudRadialMenuFancyFx: !settings.clipItemHudRadialMenuFancyFx })} />
            </SettingRow>
          </>
        )}
      </section>

      {/* ================================================================
          窗口行为
          ================================================================ */}
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

      {/* ================================================================
          窗口位置
          ================================================================ */}
      <section className="sm-panel__section" data-theme={dark ? 'dark' : 'light'}>
        <h3 className="sm-panel__section-title">窗口位置</h3>
        <div className="sm-panel__stack">
          <p className="sm-panel__muted">该设置决定"通过快捷键唤起窗口"时的弹出位置策略</p>
          <OptionCardGrid
            options={windowPlacementOptions}
            activeValue={settings.windowPlacement.mode}
            dark={dark}
            onSelect={(mode) => updateSettings({ windowPlacement: { ...settings.windowPlacement, mode: mode as WindowPlacementMode } })}
          />

          <p className="sm-panel__note">当前模式：{selectedPlacementLabel ?? '未知'}</p>

          {(isCustomPlacement || isCustomAnchorPlacement) && (
            <div className="sm-panel__custom-box" data-theme={dark ? 'dark' : 'light'}>
              <p className="sm-panel__muted">
                {isCustomAnchorPlacement ? '窗口内锚点偏移（像素）' : '自定义坐标（屏幕绝对坐标）'}
              </p>
              <div className="sm-panel__custom-grid">
                <label className="sm-panel__custom-label">
                  <span className="sm-panel__custom-axis">X</span>
                  <input
                    type="number" step={1}
                    min={isCustomAnchorPlacement ? 0 : undefined}
                    value={settings.windowPlacement.customX}
                    onChange={(e) => {
                      const nextX = Number.parseInt(e.target.value || '0', 10);
                      updateSettings({ windowPlacement: { ...settings.windowPlacement, customX: Number.isFinite(nextX) ? nextX : 0 } });
                    }}
                    className="sm-field__number" data-theme={dark ? 'dark' : 'light'}
                  />
                </label>
                <label className="sm-panel__custom-label">
                  <span className="sm-panel__custom-axis">Y</span>
                  <input
                    type="number" step={1}
                    min={isCustomAnchorPlacement ? 0 : undefined}
                    value={settings.windowPlacement.customY}
                    onChange={(e) => {
                      const nextY = Number.parseInt(e.target.value || '0', 10);
                      updateSettings({ windowPlacement: { ...settings.windowPlacement, customY: Number.isFinite(nextY) ? nextY : 0 } });
                    }}
                    className="sm-field__number" data-theme={dark ? 'dark' : 'light'}
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
