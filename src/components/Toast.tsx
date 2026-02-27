/**
 * Toast 通知组件
 *
 * 全局错误/成功提示，替代 console.error 静默吞错模式。
 * 使用发布-订阅模式，任何模块均可通过 `toast.error()` / `toast.success()` 触发。
 */

import React, { useState, useEffect, useCallback } from 'react';

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
// 发布-订阅 API
// ============================================================================

let nextId = 1;
const listeners: Set<ToastListener> = new Set();

function emit(type: ToastMessage['type'], message: string, duration = 4000) {
  const msg: ToastMessage = { id: nextId++, type, message, duration };
  listeners.forEach(fn => fn(msg));
}

export const toast = {
  error: (message: string, duration = 5000) => emit('error', message, duration),
  success: (message: string, duration = 3000) => emit('success', message, duration),
  info: (message: string, duration = 3000) => emit('info', message, duration),
};

// ============================================================================
// Toast 容器组件
// ============================================================================

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler: ToastListener = (msg) => {
      setToasts(prev => [...prev.slice(-4), msg]); // 最多 5 条
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast: t, onDismiss }: { toast: ToastMessage; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(t.id), t.duration);
    return () => clearTimeout(timer);
  }, [t.id, t.duration, onDismiss]);

  const bgColor = t.type === 'error'
    ? 'bg-red-600'
    : t.type === 'success'
      ? 'bg-green-600'
      : 'bg-blue-600';

  const icon = t.type === 'error' ? '✕' : t.type === 'success' ? '✓' : 'ℹ';

  return (
    <div
      className={`${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-start gap-2 animate-slide-in cursor-pointer text-sm`}
      onClick={() => onDismiss(t.id)}
      role="alert"
    >
      <span className="font-bold text-base leading-5">{icon}</span>
      <span className="flex-1 break-words">{t.message}</span>
    </div>
  );
}
