import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Trash2, AlertCircle, X } from 'lucide-react';
import { isTauri } from '../services/tauri';
import { useSettingsContext } from '../contexts/SettingsContext';
import { useClipboardContext } from '../contexts/ClipboardContext';
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
 *
 * 优化点：
 * 1. 结构与语义：增加了显示 "筛选数 / 总数" 的对比，便于感知当前搜索过滤状态。
 * 2. 交互安全：实现 "两步走" 的清空确认机制 (防止误触丢失所有历史)，并附带倒计时自动恢复。
 * 3. 性能：分离 useCallback 闭包定时器引用，防止频繁重渲染阻断交互。
 */
export const Footer = React.memo(function Footer() {
  const { settings } = useSettingsContext();
  const { history, handleClearAll } = useClipboardContext();
  const { filteredHistory } = useAppContext();
  
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const clearTimerRef = useRef<number | null>(null);

  const darkMode = settings.darkMode;
  const immersiveShortcut = settings.immersiveShortcut?.trim() || 'Alt+Z';
  const shortcuts = useMemo(
    () => [...BASE_SHORTCUTS, { key: immersiveShortcut, label: '沉浸' }] as const,
    [immersiveShortcut],
  );
  
  const captureEnabled = isTauri && settings.autoCapture;
  const captureState = !isTauri ? 'preview' : captureEnabled ? 'capturing' : 'paused';

  const totalCount = history.length;
  const filteredCount = filteredHistory.length;
  const isFiltered = filteredCount !== totalCount;

  // -- 清空交互逻辑 --
  const doClear = useCallback(() => {
    setIsConfirmingClear(false);
    handleClearAll();
  }, [handleClearAll]);

  const onClearClick = useCallback(() => {
    if (isConfirmingClear) {
      if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
      doClear();
    } else {
      setIsConfirmingClear(true);
      if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = window.setTimeout(() => {
        setIsConfirmingClear(false);
      }, 3000);
    }
  }, [isConfirmingClear, doClear]);

  const onCancelClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsConfirmingClear(false);
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
  }, []);

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    };
  }, []);

  return (
    <footer className="app-footer" data-theme={darkMode ? 'dark' : 'light'}>
      <div className="app-footer__left">
        <div 
          className="app-footer__pill" 
          title={captureState === 'capturing' ? '正在后台监听剪贴板变化' : captureState === 'paused' ? '监听已暂停' : '当前为前端预览模式'}
        >
          <div className="app-footer__status-dot" data-capture-state={captureState} />
          <span>
            {!isTauri
              ? '网页预览模式'
              : captureEnabled
                ? '剪贴板监听中'
                : '监听已暂停'}
          </span>
        </div>
        
        {totalCount > 0 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClearClick}
              className={`app-footer__clear-btn ${isConfirmingClear ? '!text-amber-600 !bg-amber-500/10 hover:!bg-amber-500/20' : ''}`}
            >
              {isConfirmingClear ? (
                <>
                  <AlertCircle className="app-footer__clear-icon animate-pulse" />
                  <span>确定清空？</span>
                </>
              ) : (
                <>
                  <Trash2 className="app-footer__clear-icon" /> 
                  <span>清空全部</span>
                </>
              )}
            </button>
            {isConfirmingClear && (
              <button
                type="button"
                className="p-1 rounded-md text-amber-600/70 hover:text-amber-600 hover:bg-amber-500/10 transition-colors"
                onClick={onCancelClear}
                title="取消清空"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      
      <div className="app-footer__right">
        <span className="app-footer__pill" title={isFiltered ? '当前筛选结果数 / 历史总记录数' : '历史总记录数'}>
          {isFiltered ? (
             <><span className="font-semibold">{filteredCount}</span> <span className="opacity-50 mx-0.5">/</span> {totalCount} 项</>
          ) : (
             <>共 {totalCount} 项</>
          )}
        </span>
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
