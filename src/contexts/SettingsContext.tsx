/**
 * 设置 Context
 *
 * 管理应用设置的读写与持久化。
 * 从 AppContext 拆分，避免设置变更触发不相关组件重渲染。
 */

import React, { createContext, useContext, useMemo } from 'react';
import { AppSettings } from '../types';
import { useSettings } from '../hooks/useSettings';

export interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettingsContext(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettingsContext 必须在 SettingsProvider 内使用');
  return ctx;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings } = useSettings();

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, updateSettings }),
    [settings, updateSettings],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
