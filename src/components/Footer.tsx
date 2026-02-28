import React from 'react';
import { Trash2 } from 'lucide-react';
import { isTauri } from '../services/tauri';
import { useAppContext } from '../contexts/AppContext';
import './styles/footer.css';

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
// 组件
// ============================================================================

/**
 * 底部状态栏：监听状态、记录数、快捷键提示、清空按钮
 */
export const Footer = React.memo(function Footer() {
  const { settings, history, filteredHistory, handleClearAll } = useAppContext();
  const darkMode = settings.darkMode;
  const immersiveShortcut = settings.immersiveShortcut?.trim() || 'Alt+Z';
  const shortcuts = [...BASE_SHORTCUTS, { key: immersiveShortcut, label: '沉浸' }] as const;
  const captureEnabled = isTauri && settings.autoCapture;
  const captureState = !isTauri ? 'preview' : captureEnabled ? 'capturing' : 'paused';

  return (
    <footer className="app-footer" data-theme={darkMode ? 'dark' : 'light'}>
      <div className="app-footer__left">
        <div className="app-footer__pill">
          <div className="app-footer__status-dot" data-capture-state={captureState} />
          <span>
            {!isTauri
              ? '网页预览模式'
              : captureEnabled
                ? '正在监听剪贴板'
                : '已暂停监听剪贴板'}
          </span>
        </div>
        {history.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="app-footer__clear-btn"
          >
            <Trash2 className="app-footer__clear-icon" /> 清空全部
          </button>
        )}
      </div>
      <div className="app-footer__right">
        <span className="app-footer__pill">{filteredHistory.length} 条记录</span>
        <div className="app-footer__shortcuts">
          {shortcuts.map(({ key, label }) => (
            <span key={key} className="app-footer__shortcut-item">
              <kbd className="app-footer__kbd">{key}</kbd> {label}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
});
