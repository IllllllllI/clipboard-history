import React from 'react';
import { Trash2 } from 'lucide-react';
import { isTauri } from '../services/tauri';
import { useAppContext } from '../contexts/AppContext';

// ============================================================================
// 常量
// ============================================================================

/** 基础快捷键提示数据 */
const BASE_SHORTCUTS = [
  { key: '↑↓',     label: '导航' },
  { key: '↵',      label: '粘贴' },
  { key: 'Ctrl+C', label: '复制' },
] as const;

// ============================================================================
// 样式工具
// ============================================================================

const pillClass = (dark: boolean) =>
  `px-2.5 py-1 rounded-full ${dark ? 'bg-white/5' : 'bg-black/5'}`;

const kbdClass = (dark: boolean) =>
  `font-mono px-1.5 py-0.5 rounded-md shadow-sm ${dark ? 'bg-white/10 border border-white/5' : 'bg-black/10 border border-black/5'}`;

// ============================================================================
// 组件
// ============================================================================

/**
 * 底部状态栏：监听状态、记录数、快捷键提示、清空按钮
 */
export const Footer = React.memo(function Footer() {
  const { settings, history, filteredHistory, handleClearAll } = useAppContext();
  const dark = settings.darkMode;
  const immersiveShortcut = settings.immersiveShortcut?.trim() || 'Alt+Z';
  const shortcuts = [...BASE_SHORTCUTS, { key: immersiveShortcut, label: '沉浸' }] as const;
  const captureEnabled = isTauri && settings.autoCapture;

  return (
    <footer className={`px-5 py-2.5 border-t flex items-center justify-between shrink-0 text-xs font-medium transition-colors duration-300 z-10 shadow-[0_-1px_2px_rgba(0,0,0,0.02)] backdrop-blur-md ${dark ? 'bg-neutral-900/80 border-neutral-800 text-neutral-500' : 'bg-white/80 border-neutral-200 text-neutral-500'}`}>
      <div className="flex items-center gap-4">
        <div className={`flex items-center gap-2 ${pillClass(dark)}`}>
          <div className={`w-2 h-2 rounded-full ${
            !isTauri
              ? 'bg-blue-500'
              : captureEnabled
                ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                : 'bg-amber-500/90 shadow-[0_0_6px_rgba(245,158,11,0.45)]'
          }`} />
          <span>
            {!isTauri
              ? '网页预览模式'
              : captureEnabled
                ? '正在监听剪贴板'
                : '已暂停监听剪贴板'}
          </span>
        </div>
        {history.length > 0 && (
          <button onClick={handleClearAll} className="hover:text-red-500 hover:bg-red-500/10 px-2 py-1 rounded transition-all active:scale-95 flex items-center gap-1">
            <Trash2 className="w-3.5 h-3.5" /> 清空全部
          </button>
        )}
      </div>
      <div className="flex items-center gap-5">
        <span className={pillClass(dark)}>{filteredHistory.length} 条记录</span>
        <div className="hidden sm:flex items-center gap-3">
          {shortcuts.map(({ key, label }) => (
            <span key={key} className="flex items-center gap-1.5">
              <kbd className={kbdClass(dark)}>{key}</kbd> {label}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
});
