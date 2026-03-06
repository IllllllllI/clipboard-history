/**
 * Toast 通知组件
 *
 * 全局错误/成功提示，替代 console.error 静默吞错模式。
 * 使用发布-订阅模式，没有任何 React Context 束缚，任何普通 TypeScript 文件、Hook 均可顺畅使用。
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import './styles/toast.css';

// ============================================================================
// Toast 类型
// ============================================================================

export interface ToastMessage {
  id: number;
  type: 'error' | 'success' | 'info';
  message: string;
  duration: number;
}

type ToastListener = (toast: ToastMessage) => void;

// ============================================================================
// 发布-订阅 API (轻量单例)
// ============================================================================

let nextId = 1;
const listeners: Set<ToastListener> = new Set();
const removeListeners: Set<(id: number) => void> = new Set();
const MAX_TOASTS = 4;

function emit(type: ToastMessage['type'], message: string, duration = 4000) {
  const msg: ToastMessage = { id: nextId++, type, message, duration };
  listeners.forEach(fn => fn(msg));
}

export const toast = {
  error: (message: string, duration = 5000) => emit('error', message, duration),
  success: (message: string, duration = 3000) => emit('success', message, duration),
  info: (message: string, duration = 3000) => emit('info', message, duration),
  dismiss: (id: number) => removeListeners.forEach(fn => fn(id)),
};

// ============================================================================
// Toast 容器组件
// ============================================================================

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const onAdd: ToastListener = (msg) => {
      setToasts(prev => {
        // 如果相同类型的重复文案已经存在，不再堆叠弹窗而是只刷新定时器（可选，目前走限制数量方案）
        const updated = [...prev, msg];
        return updated.length > MAX_TOASTS ? updated.slice(updated.length - MAX_TOASTS) : updated;
      });
    };
    
    const onRemove = (id: number) => {
      setToasts(prev => prev.filter(t => t.id !== id));
    };

    listeners.add(onAdd);
    removeListeners.add(onRemove);
    return () => { 
      listeners.delete(onAdd); 
      removeListeners.delete(onRemove);
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    toast.dismiss(id);
  }, []);

  // 将容器提升到 body 层，防止受到深层组件的 z-index 或 overflow: hidden 截断影响
  return createPortal(
    <div className="toast-container" aria-live="polite" aria-atomic="true">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>,
    document.body
  );
}

const ToastItem = memo(function ToastItem({ toast: t, onDismiss }: { toast: ToastMessage; onDismiss: (id: number) => void }) {
  // 悬停时暂停销毁倒计时
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isHovered) return;
    
    const timer = window.setTimeout(() => onDismiss(t.id), t.duration);
    return () => window.clearTimeout(timer);
  }, [t.id, t.duration, isHovered, onDismiss]);

  const Icon = t.type === 'error' ? AlertCircle : t.type === 'success' ? CheckCircle2 : Info;

  return (
    <div
      className="toast-item animate-slide-in group"
      data-type={t.type}
      role="alert"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="toast-item__content">
        <Icon className="toast-item__icon" aria-hidden="true" />
        <span className="toast-item__message">{t.message}</span>
      </div>
      <button 
        type="button" 
        className="toast-item__close-btn opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onDismiss(t.id)}
        aria-label="关闭通知"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
});
