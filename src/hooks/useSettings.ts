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
      })
      .catch((error) => {
        console.warn('同步图片高级配置失败：', error);
      });
  }, [settings.allowPrivateNetwork, settings.resolveDnsForUrlSafety, settings.maxDecodedBytes]);

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
