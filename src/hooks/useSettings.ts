import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { AppSettings } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import { TauriService } from '../services/tauri';

const SAVE_DEBOUNCE_MS = 300;

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
    if (settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      getCurrentWindow().setTheme(settings.darkMode ? 'dark' : 'light');
    } catch {
      // 非 Tauri 环境下忽略
    }
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
