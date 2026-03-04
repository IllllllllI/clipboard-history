import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { AppSettings } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import { CLIP_ITEM_HUD_BORDER_RING_WIDTH, CLIP_ITEM_HUD_BORDER_RUN_DURATION } from '../hud/clipitem/constants';
import { TauriService } from '../services/tauri';

const SAVE_DEBOUNCE_MS = 300;
const THEME_TRANSITION_MS = 240;

// ============================================================================
// 声明式迁移管道 — 新增迁移只需加一条记录，符合开闭原则
// ============================================================================

type Migration = (data: Record<string, unknown>) => void;

/** 按顺序执行的迁移列表 */
const MIGRATIONS: Migration[] = [
  // v0.1: 旧快捷键迁移
  (data) => {
    if (
      data.globalShortcut === 'CmdOrControl+Shift+V' ||
      data.globalShortcut === 'CommandOrControl+Shift+V'
    ) {
      data.globalShortcut = 'Alt+V';
    }
  },
  // v0.2: 图片性能档位兜底
  (data) => {
    const profile = data.imagePerformanceProfile;
    if (profile !== 'quality' && profile !== 'balanced' && profile !== 'speed') {
      data.imagePerformanceProfile = 'balanced';
    }
  },
  // v0.3: 高级配置兜底
  (data) => {
    if (typeof data.allowPrivateNetwork !== 'boolean') {
      data.allowPrivateNetwork = false;
    }
    if (typeof data.resolveDnsForUrlSafety !== 'boolean') {
      data.resolveDnsForUrlSafety = true;
    }

    const bytes = Number(data.maxDecodedBytes);
    if (!Number.isFinite(bytes) || bytes < 8 * 1024 * 1024) {
      data.maxDecodedBytes = 160 * 1024 * 1024;
    }
  },
  // v0.4: 全局快捷键窗口定位策略
  (data) => {
    const placement = data.windowPlacement;
    const allowedModes = new Set([
      'smart_near_cursor',
      'cursor_top_left',
      'cursor_center',
      'custom_anchor',
      'monitor_center',
      'screen_center',
      'custom',
      'last_position',
    ]);

    const fallback = {
      mode: 'smart_near_cursor',
      customX: 120,
      customY: 120,
    };

    if (typeof placement !== 'object' || placement === null) {
      data.windowPlacement = fallback;
      return;
    }

    const placementObj = placement as Record<string, unknown>;
    const mode = typeof placementObj.mode === 'string' ? placementObj.mode : fallback.mode;
    const customX = Number(placementObj.customX);
    const customY = Number(placementObj.customY);

    data.windowPlacement = {
      mode: allowedModes.has(mode) ? mode : fallback.mode,
      customX: Number.isFinite(customX) ? Math.trunc(customX) : fallback.customX,
      customY: Number.isFinite(customY) ? Math.trunc(customY) : fallback.customY,
    };
  },
  // v0.5: 拖拽下载 HUD 开关兜底
  (data) => {
    if (typeof data.showDragDownloadHud !== 'boolean') {
      data.showDragDownloadHud = true;
    }
  },
  // v0.6: 拖拽开始预取开关兜底
  (data) => {
    if (typeof data.prefetchImageOnDragStart !== 'boolean') {
      data.prefetchImageOnDragStart = false;
    }
  },
  // v0.7: 图片下载分阶段超时兜底
  (data) => {
    const connect = Number(data.imageConnectTimeout);
    const firstByte = Number(data.imageFirstByteTimeoutMs);
    const chunk = Number(data.imageChunkTimeoutMs);

    data.imageConnectTimeout = Number.isFinite(connect) && connect >= 1 ? Math.trunc(connect) : 8;
    data.imageFirstByteTimeoutMs = Number.isFinite(firstByte) && firstByte >= 500 ? Math.trunc(firstByte) : 10_000;
    data.imageChunkTimeoutMs = Number.isFinite(chunk) && chunk >= 500 ? Math.trunc(chunk) : 15_000;
  },
  // v0.8: 剪贴板写入重试预算兜底
  (data) => {
    const retryBudget = Number(data.imageClipboardRetryMaxTotalMs);
    const retryMaxDelay = Number(data.imageClipboardRetryMaxDelayMs);

    data.imageClipboardRetryMaxTotalMs =
      Number.isFinite(retryBudget) && retryBudget >= 200
        ? Math.trunc(retryBudget)
        : 1_800;

    data.imageClipboardRetryMaxDelayMs =
      Number.isFinite(retryMaxDelay) && retryMaxDelay >= 10
        ? Math.trunc(retryMaxDelay)
        : 900;
  },
  // v0.9: 剪贴板监听事件节流间隔兜底
  (data) => {
    const interval = Number(data.clipboardEventMinIntervalMs);
    data.clipboardEventMinIntervalMs =
      Number.isFinite(interval)
        ? Math.min(5000, Math.max(20, Math.trunc(interval)))
        : 80;
  },
  // v0.10: 多图相册显示模式 / 滚动方向兜底
  (data) => {
    const allowedModes = new Set(['grid', 'carousel', 'list']);
    const allowedDirs = new Set(['horizontal', 'vertical']);
    if (!allowedModes.has(data.galleryDisplayMode as string)) {
      data.galleryDisplayMode = 'carousel';
    }
    if (!allowedDirs.has(data.galleryScrollDirection as string)) {
      data.galleryScrollDirection = 'horizontal';
    }
  },
  // v0.11: 多图相册滚轮触发方式兜底
  (data) => {
    const allowedWheelModes = new Set(['always', 'ctrl']);
    if (!allowedWheelModes.has(data.galleryWheelMode as string)) {
      data.galleryWheelMode = 'ctrl';
    }
  },
  // v0.12: 列表模式最大显示条目兜底
  (data) => {
    const maxVisible = Number(data.galleryListMaxVisibleItems);
    data.galleryListMaxVisibleItems =
      Number.isFinite(maxVisible)
        ? Math.min(30, Math.max(1, Math.trunc(maxVisible)))
        : 6;
  },
  // v0.13: 文件列表最大显示条目兜底
  (data) => {
    const maxVisible = Number(data.fileListMaxVisibleItems);
    data.fileListMaxVisibleItems =
      Number.isFinite(maxVisible)
        ? Math.min(30, Math.max(1, Math.trunc(maxVisible)))
        : 5;
  },
  // v0.14: 窄宽度工具区显示策略兜底
  (data) => {
    const allowedModes = new Set(['inside', 'auto', 'overlay']);
    if (!allowedModes.has(data.compactMetaDisplayMode as string)) {
      data.compactMetaDisplayMode = 'auto';
    }
  },
  // v0.17: 条目 HUD 鼠标触发按钮兜底
  (data) => {
    const allowedButtons = new Set(['middle', 'right']);
    if (!allowedButtons.has(data.clipItemHudTriggerMouseButton as string)) {
      data.clipItemHudTriggerMouseButton = 'middle';
    }
  },
  // v0.18: 条目 HUD 鼠标触发模式兜底
  (data) => {
    const allowedModes = new Set(['click', 'press_release']);
    if (!allowedModes.has(data.clipItemHudTriggerMouseMode as string)) {
      data.clipItemHudTriggerMouseMode = 'press_release';
    }
  },
  // v0.19: 条目 HUD 径向菜单动效开关兜底
  (data) => {
    if (typeof data.clipItemHudRadialMenuFancyFx !== 'boolean') {
      data.clipItemHudRadialMenuFancyFx = true;
    }
  },
  // v0.20: 条目 HUD 径向菜单布局档位兜底
  (data) => {
    const allowedProfiles = new Set(['compact', 'standard', 'relaxed']);
    if (!allowedProfiles.has(data.clipItemHudRadialMenuLayoutProfile as string)) {
      data.clipItemHudRadialMenuLayoutProfile = 'standard';
    }
  },
  // v0.21: 条目 HUD 流光边框速度兜底
  (data) => {
    const next = Number(data.clipItemHudBorderRunDurationSec);
    if (!Number.isFinite(next)) {
      data.clipItemHudBorderRunDurationSec = CLIP_ITEM_HUD_BORDER_RUN_DURATION.defaultValue;
      return;
    }
    data.clipItemHudBorderRunDurationSec = Math.min(
      CLIP_ITEM_HUD_BORDER_RUN_DURATION.max,
      Math.max(CLIP_ITEM_HUD_BORDER_RUN_DURATION.min, next),
    );
  },
  // v0.22: 条目 HUD 流光边框宽度兜底
  (data) => {
    const next = Number(data.clipItemHudBorderRingWidthPx);
    if (!Number.isFinite(next)) {
      data.clipItemHudBorderRingWidthPx = CLIP_ITEM_HUD_BORDER_RING_WIDTH.defaultValue;
      return;
    }
    data.clipItemHudBorderRingWidthPx = Math.min(
      CLIP_ITEM_HUD_BORDER_RING_WIDTH.max,
      Math.max(CLIP_ITEM_HUD_BORDER_RING_WIDTH.min, next),
    );
  },
  // v0.23: 右侧悬浮操作按钮开关兜底
  (data) => {
    if (typeof data.clipItemFloatingActionsEnabled !== 'boolean') {
      data.clipItemFloatingActionsEnabled = true;
    }
  },
  // v0.24: 窗口外 HUD 总开关兜底
  (data) => {
    if (typeof data.clipItemHudEnabled !== 'boolean') {
      data.clipItemHudEnabled = true;
    }
  },
  // v0.25: 窗口外圆形 HUD 开关兜底
  (data) => {
    if (typeof data.clipItemHudRadialMenuEnabled !== 'boolean') {
      data.clipItemHudRadialMenuEnabled = true;
    }
  },
  // v0.26: 条目时间信息自动隐藏阈值兜底（0=禁用）
  (data) => {
    const next = Number(data.clipItemTimeMetaAutoHideWidthPx);
    data.clipItemTimeMetaAutoHideWidthPx =
      Number.isFinite(next)
        ? Math.min(1600, Math.max(0, Math.trunc(next)))
        : 0;
  },
  // v0.27: 筛选按钮图标模式阈值兜底
  (data) => {
    const next = Number(data.headerFilterIconModeWidthPx);
    data.headerFilterIconModeWidthPx =
      Number.isFinite(next)
        ? Math.min(1600, Math.max(0, Math.trunc(next)))
        : 640;
  },
  // v0.28: 线性 HUD 定位模式兜底（near_item → dynamic，fixed → dynamic）
  (data) => {
    const allowedModes = new Set(['dynamic', 'top', 'bottom', 'left', 'right']);
    // 兼容旧值迁移
    if (data.clipItemHudPositionMode === 'near_item') {
      data.clipItemHudPositionMode = 'dynamic';
    } else if (data.clipItemHudPositionMode === 'fixed') {
      data.clipItemHudPositionMode = 'dynamic';
    }
    if (!allowedModes.has(data.clipItemHudPositionMode as string)) {
      data.clipItemHudPositionMode = 'dynamic';
    }
    // 清理已废弃的固定坐标字段
    delete data.clipItemHudFixedX;
    delete data.clipItemHudFixedY;
  },
  // v0.29: 主窗口置顶开关兜底
  (data) => {
    if (typeof data.alwaysOnTop !== 'boolean') {
      data.alwaysOnTop = true;
    }
  },
  // 后续迁移在此追加...
];

function normalizeSettings(data: Record<string, unknown>): AppSettings {
  const next = { ...data };
  MIGRATIONS.forEach((migration) => migration(next));
  return { ...DEFAULT_SETTINGS, ...next };
}

// ============================================================================
// Hook
// ============================================================================

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootstrappedSettingsRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    TauriService
      .getAppSettings()
      .then((stored) => {
        if (cancelled || !stored || typeof stored !== 'object') return;
        setSettings(normalizeSettings(stored));
      })
      .catch((error) => {
        console.warn('读取后端应用设置失败：', error);
      })
      .finally(() => {
        if (!cancelled) bootstrappedSettingsRef.current = true;
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // 防抖写入后端设置存储
  useEffect(() => {
    if (!bootstrappedSettingsRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      TauriService
        .setAppSettings(settings as unknown as Record<string, unknown>)
        .catch((error) => {
          console.warn('写入后端应用设置失败：', error);
        });
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [settings]);

  // 同步窗口标题栏主题和 HTML 根节点暗黑模式类
  useEffect(() => {
    const root = document.documentElement;
    const hadDarkMode = root.classList.contains('dark');
    const hasThemeChanged = hadDarkMode !== settings.darkMode;
    let transitionTimer: ReturnType<typeof setTimeout> | null = null;

    if (hasThemeChanged) {
      root.classList.add('theme-switching');
      transitionTimer = setTimeout(() => {
        root.classList.remove('theme-switching');
      }, THEME_TRANSITION_MS);
    }

    if (settings.darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    try {
      getCurrentWindow().setTheme(settings.darkMode ? 'dark' : 'light');
    } catch {
      // 非 Tauri 环境下忽略
    }

    return () => {
      if (transitionTimer) {
        clearTimeout(transitionTimer);
        transitionTimer = null;
      }
      root.classList.remove('theme-switching');
    };
  }, [settings.darkMode]);

  useEffect(() => {
    if (!bootstrappedSettingsRef.current) return;

    TauriService
      .setImagePerformanceProfile(settings.imagePerformanceProfile)
      .catch((error) => {
        console.warn('同步图片性能档位失败：', error);
      });
  }, [settings.imagePerformanceProfile]);

  useEffect(() => {
    if (!bootstrappedSettingsRef.current) return;

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
      .catch((error) => {
        console.warn('同步图片高级配置失败：', error);
      });
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

  // 同步主窗口置顶状态
  useEffect(() => {
    if (!bootstrappedSettingsRef.current) return;

    TauriService
      .setAlwaysOnTop(settings.alwaysOnTop)
      .catch((error) => {
        console.warn('同步主窗口置顶状态失败：', error);
      });
  }, [settings.alwaysOnTop]);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...updates };
      const changed = (Object.keys(updates) as Array<keyof AppSettings>)
        .some((key) => prev[key] !== next[key]);
      return changed ? next : prev;
    });
  }, []);

  return { settings, updateSettings };
}
