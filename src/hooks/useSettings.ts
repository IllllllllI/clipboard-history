import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { AppSettings } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import { TauriService } from '../services/tauri';

const STORAGE_KEY = 'app-settings';
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
  // 后续迁移在此追加...
];

/** 从 localStorage 加载并迁移设置 */
function loadSettings(): AppSettings {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return DEFAULT_SETTINGS;

  try {
    const parsed = JSON.parse(saved) as Record<string, unknown>;
    MIGRATIONS.forEach(m => m(parsed));
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    console.warn('设置数据解析失败，使用默认值');
    return DEFAULT_SETTINGS;
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootstrappedBackendProfileRef = useRef(false);
  const bootstrappedBackendAdvancedRef = useRef(false);

  // 防抖写入 localStorage（滑块等高频操作不会每帧写入）
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
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
    let cancelled = false;

    TauriService
      .getImagePerformanceProfile()
      .then((profile) => {
        if (cancelled || !profile) return;

        setSettings((prev) => {
          if (prev.imagePerformanceProfile === profile) return prev;
          return { ...prev, imagePerformanceProfile: profile };
        });
      })
      .catch((error) => {
        console.warn('读取后端图片性能档位失败：', error);
      })
      .finally(() => {
        if (!cancelled) bootstrappedBackendProfileRef.current = true;
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    TauriService
      .getImageAdvancedConfig()
      .then((config) => {
        if (cancelled || !config) return;

        setSettings((prev) => {
          if (
            prev.allowPrivateNetwork === config.allow_private_network
            && prev.resolveDnsForUrlSafety === config.resolve_dns_for_url_safety
            && prev.maxDecodedBytes === config.max_decoded_bytes
          ) {
            return prev;
          }

          return {
            ...prev,
            allowPrivateNetwork: config.allow_private_network,
            resolveDnsForUrlSafety: config.resolve_dns_for_url_safety,
            maxDecodedBytes: config.max_decoded_bytes,
          };
        });
      })
      .catch((error) => {
        console.warn('读取后端图片高级配置失败：', error);
      })
      .finally(() => {
        if (!cancelled) bootstrappedBackendAdvancedRef.current = true;
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!bootstrappedBackendProfileRef.current) return;

    TauriService
      .setImagePerformanceProfile(settings.imagePerformanceProfile)
      .catch((error) => {
        console.warn('同步图片性能档位失败：', error);
      });
  }, [settings.imagePerformanceProfile]);

  useEffect(() => {
    if (!bootstrappedBackendAdvancedRef.current) return;

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
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  return { settings, updateSettings };
}
