import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { AppSettings } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import {
  CLIP_ITEM_HUD_BORDER_RING_WIDTH,
  CLIP_ITEM_HUD_BORDER_RUN_DURATION,
} from '../hud/clipitem/constants';
import { TauriService } from '../services/tauri';

const SAVE_DEBOUNCE_MS = 300;
const THEME_TRANSITION_MS = 240;

// ============================================================================
// 声明式字段约束 — 新增字段只需加一行规则，违反约束自动回退到 DEFAULT_SETTINGS
// ============================================================================

// ── 约束类型 ──

type Constraint =
  | Readonly<{ kind: 'bool' }>
  | Readonly<{ kind: 'enum'; values: ReadonlySet<string> }>
  | Readonly<{
      kind: 'num';
      min: number;
      max: number;
      /** 截断为整数 */    trunc?: boolean;
      /** 越界时钳位到边界（默认重置为 DEFAULT_SETTINGS 值） */
      clamp?: boolean;
    }>;

// ── 便捷构造器（模块级单例，Set 只分配一次）──

const BOOL: Constraint = { kind: 'bool' };
const enumOf = (...vs: string[]): Constraint =>
  ({ kind: 'enum', values: new Set(vs) });
const gateInt = (min: number, max = Infinity): Constraint =>
  ({ kind: 'num', min, max, trunc: true });
const clampInt = (min: number, max: number): Constraint =>
  ({ kind: 'num', min, max, trunc: true, clamp: true });
const clampFloat = (min: number, max: number): Constraint =>
  ({ kind: 'num', min, max, clamp: true });

/** 根据约束校验单个值，不通过则返回 fallback */
function applyConstraint(
  value: unknown,
  rule: Constraint,
  fallback: unknown,
): unknown {
  switch (rule.kind) {
    case 'bool':
      return typeof value === 'boolean' ? value : fallback;
    case 'enum':
      return rule.values.has(value as string) ? value : fallback;
    case 'num': {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      const v = rule.trunc ? Math.trunc(n) : n;
      if (v >= rule.min && v <= rule.max) return v;
      return rule.clamp
        ? Math.min(rule.max, Math.max(rule.min, v))
        : fallback;
    }
  }
}

/**
 * 字段约束表
 *
 * - 存储值不在约束范围内 → 回退到 DEFAULT_SETTINGS 中对应的默认值
 * - 未列出的字段仅靠 `{ ...DEFAULT_SETTINGS, ...stored }` 填充缺失值
 */
const FIELD_CONSTRAINTS: ReadonlyArray<
  readonly [keyof AppSettings, Constraint]
> = [
  // ── 布尔 ──
  ['allowPrivateNetwork',              BOOL],
  ['resolveDnsForUrlSafety',           BOOL],
  ['showDragDownloadHud',              BOOL],
  ['prefetchImageOnDragStart',         BOOL],
  ['clipItemFloatingActionsEnabled',   BOOL],
  ['clipItemHudEnabled',               BOOL],
  ['clipItemHudRadialMenuEnabled',     BOOL],
  ['clipItemHudRadialMenuFancyFx',     BOOL],
  ['alwaysOnTop',                      BOOL],

  // ── 枚举 ──
  ['imagePerformanceProfile',            enumOf('quality', 'balanced', 'speed')],
  ['galleryDisplayMode',                 enumOf('grid', 'carousel', 'list')],
  ['galleryScrollDirection',             enumOf('horizontal', 'vertical')],
  ['galleryWheelMode',                   enumOf('always', 'ctrl')],
  ['compactMetaDisplayMode',             enumOf('inside', 'auto', 'overlay')],
  ['clipItemHudTriggerMouseButton',      enumOf('middle', 'right')],
  ['clipItemHudTriggerMouseMode',        enumOf('click', 'press_release')],
  ['clipItemHudRadialMenuLayoutProfile', enumOf('compact', 'standard', 'relaxed')],
  ['clipItemHudPositionMode',            enumOf('dynamic', 'top', 'bottom', 'left', 'right')],

  // ── 数值（门限：越界 → 重置为默认值）──
  ['maxDecodedBytes',                  gateInt(8 * 1024 * 1024)],
  ['imageConnectTimeout',             gateInt(1)],
  ['imageFirstByteTimeoutMs',         gateInt(500)],
  ['imageChunkTimeoutMs',             gateInt(500)],
  ['imageClipboardRetryMaxTotalMs',   gateInt(200)],
  ['imageClipboardRetryMaxDelayMs',   gateInt(10)],

  // ── 数值（钳位：越界 → 夹到最近边界）──
  ['clipboardEventMinIntervalMs',     clampInt(20, 5_000)],
  ['galleryListMaxVisibleItems',      clampInt(1, 30)],
  ['fileListMaxVisibleItems',         clampInt(1, 30)],
  ['clipItemTimeMetaAutoHideWidthPx', clampInt(0, 1_600)],
  ['headerFilterIconModeWidthPx',     clampInt(0, 1_600)],
  ['clipItemHudBorderRunDurationSec', clampFloat(
    CLIP_ITEM_HUD_BORDER_RUN_DURATION.min,
    CLIP_ITEM_HUD_BORDER_RUN_DURATION.max,
  )],
  ['clipItemHudBorderRingWidthPx',    clampFloat(
    CLIP_ITEM_HUD_BORDER_RING_WIDTH.min,
    CLIP_ITEM_HUD_BORDER_RING_WIDTH.max,
  )],
];

// ============================================================================
// 数据迁移 — 仅做键名 / 值的历史变换，与约束校验完全解耦
// ============================================================================

const DATA_MIGRATIONS: ReadonlyArray<
  (raw: Record<string, unknown>) => void
> = [
  // 旧快捷键 → Alt+V
  (raw) => {
    const sc = raw.globalShortcut;
    if (sc === 'CmdOrControl+Shift+V' || sc === 'CommandOrControl+Shift+V') {
      raw.globalShortcut = 'Alt+V';
    }
  },
  // 线性 HUD 位置模式重命名 + 清理废弃字段
  (raw) => {
    const mode = raw.clipItemHudPositionMode;
    if (mode === 'near_item' || mode === 'fixed') {
      raw.clipItemHudPositionMode = 'dynamic';
    }
    delete raw.clipItemHudFixedX;
    delete raw.clipItemHudFixedY;
  },
  // 后续迁移在此追加...
];

// ============================================================================
// windowPlacement 结构校验
// ============================================================================

const ALLOWED_PLACEMENT_MODES: ReadonlySet<string> = new Set([
  'smart_near_cursor', 'cursor_top_left', 'cursor_center', 'custom_anchor',
  'monitor_center', 'screen_center', 'custom', 'last_position',
]);

function validateWindowPlacement(
  raw: unknown,
): AppSettings['windowPlacement'] {
  const fb = DEFAULT_SETTINGS.windowPlacement;
  if (typeof raw !== 'object' || raw === null) return fb;

  const obj = raw as Record<string, unknown>;
  const mode =
    typeof obj.mode === 'string' && ALLOWED_PLACEMENT_MODES.has(obj.mode)
      ? (obj.mode as AppSettings['windowPlacement']['mode'])
      : fb.mode;
  const cx = Number(obj.customX);
  const cy = Number(obj.customY);

  return {
    mode,
    customX: Number.isFinite(cx) ? Math.trunc(cx) : fb.customX,
    customY: Number.isFinite(cy) ? Math.trunc(cy) : fb.customY,
  };
}

// ============================================================================
// normalizeSettings
// ============================================================================

function normalizeSettings(raw: Record<string, unknown>): AppSettings {
  // 1. 数据迁移（历史键名 / 值变换）
  for (const migrate of DATA_MIGRATIONS) migrate(raw);

  // 2. 合并默认值（填充缺失字段）
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS, ...raw };

  // 3. 声明式约束校验
  const defaults = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
  for (const [key, rule] of FIELD_CONSTRAINTS) {
    merged[key] = applyConstraint(merged[key], rule, defaults[key]);
  }

  // 4. 结构体字段单独校验
  merged.windowPlacement = validateWindowPlacement(raw.windowPlacement);

  return merged as unknown as AppSettings;
}

// ============================================================================
// Hook
// ============================================================================

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootstrappedRef = useRef(false);

  /** 始终指向最新 settings，供卸载冲洗读取 */
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // ── 1. 从后端加载设置 ──

  useEffect(() => {
    let cancelled = false;

    TauriService.getAppSettings()
      .then((stored) => {
        if (cancelled || !stored || typeof stored !== 'object') return;
        setSettings(normalizeSettings(stored));
      })
      .catch((err) => console.warn('读取后端应用设置失败：', err))
      .finally(() => {
        if (!cancelled) bootstrappedRef.current = true;
      });

    return () => { cancelled = true; };
  }, []);

  // ── 2. 防抖写入后端存储 ──

  useEffect(() => {
    if (!bootstrappedRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      TauriService
        .setAppSettings(settings as unknown as Record<string, unknown>)
        .catch((err) => console.warn('写入后端应用设置失败：', err));
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [settings]);

  // 卸载 / 页面关闭时冲洗未保存的 debounce（防止最后一次变更丢失）
  useEffect(() => {
    const flush = () => {
      if (!timerRef.current) return;
      clearTimeout(timerRef.current);
      timerRef.current = null;
      TauriService
        .setAppSettings(settingsRef.current as unknown as Record<string, unknown>)
        .catch((err) => console.warn('冲洗设置失败：', err));
    };

    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush(); // 组件卸载时也冲洗
    };
  }, []);

  // ── 3. 主题同步 ──

  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    let transitionTimer: ReturnType<typeof setTimeout> | null = null;

    if (wasDark !== settings.darkMode) {
      root.classList.add('theme-switching');
      transitionTimer = setTimeout(
        () => root.classList.remove('theme-switching'),
        THEME_TRANSITION_MS,
      );
    }

    root.classList.toggle('dark', settings.darkMode);

    try {
      getCurrentWindow().setTheme(settings.darkMode ? 'dark' : 'light');
    } catch { /* 非 Tauri 环境 */ }

    return () => {
      if (transitionTimer) clearTimeout(transitionTimer);
      root.classList.remove('theme-switching');
    };
  }, [settings.darkMode]);

  // ── 4. 后端属性同步 ──

  useEffect(() => {
    if (!bootstrappedRef.current) return;
    TauriService
      .setImagePerformanceProfile(settings.imagePerformanceProfile)
      .catch((err) => console.warn('同步图片性能档位失败：', err));
  }, [settings.imagePerformanceProfile]);

  useEffect(() => {
    if (!bootstrappedRef.current) return;
    TauriService
      .setImageAdvancedConfig({
        allow_private_network: settings.allowPrivateNetwork,
        resolve_dns_for_url_safety: settings.resolveDnsForUrlSafety,
        max_decoded_bytes: settings.maxDecodedBytes,
        connect_timeout: settings.imageConnectTimeout,
        stream_first_byte_timeout_ms: settings.imageFirstByteTimeoutMs,
        stream_chunk_timeout_ms: settings.imageChunkTimeoutMs,
        clipboard_retry_max_total_ms: settings.imageClipboardRetryMaxTotalMs,
        clipboard_retry_max_delay_ms: settings.imageClipboardRetryMaxDelayMs,
      })
      .catch((err) => console.warn('同步图片高级配置失败：', err));
  }, [
    settings.allowPrivateNetwork,
    settings.resolveDnsForUrlSafety,
    settings.maxDecodedBytes,
    settings.imageConnectTimeout,
    settings.imageFirstByteTimeoutMs,
    settings.imageChunkTimeoutMs,
    settings.imageClipboardRetryMaxTotalMs,
    settings.imageClipboardRetryMaxDelayMs,
  ]);

  useEffect(() => {
    if (!bootstrappedRef.current) return;
    TauriService
      .setAlwaysOnTop(settings.alwaysOnTop)
      .catch((err) => console.warn('同步主窗口置顶状态失败：', err));
  }, [settings.alwaysOnTop]);

  // ── 5. 对外 API ──

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      const changed = (Object.keys(updates) as Array<keyof AppSettings>)
        .some((k) => prev[k] !== next[k]);
      return changed ? next : prev;
    });
  }, []);

  return { settings, updateSettings } as const;
}
