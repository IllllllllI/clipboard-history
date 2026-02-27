import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { AppSettings } from '../types';
import { DEFAULT_SETTINGS } from '../constants';

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

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  return { settings, updateSettings };
}
