import { useState, useEffect, useRef } from 'react';
import { TauriService, isTauri } from '../services/tauri';
import type { WindowPlacementSettings } from '../types';

// ── Vite HMR 兜底：模块替换前强制清理全局快捷键 ────────────────
if (import.meta.hot) {
  const cleanup = () => {
    if (isTauri) void TauriService.unregisterAllShortcuts();
  };
  import.meta.hot.on('vite:beforeUpdate', cleanup);
  import.meta.hot.dispose(() => {
    import.meta.hot?.off('vite:beforeUpdate', cleanup);
    cleanup();
  });
}

/** Tauri 插件错误 → 用户友好中文提示 */
function formatShortcutError(shortcut: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('already registered')) {
    return `快捷键 ${shortcut} 已被占用，请尝试更换其他快捷键`;
  }
  return msg;
}

/**
 * 异步 FIFO 串行队列。
 * 入列函数严格顺序执行，前驱无论成败都继续下一个，
 * 杜绝 register/unregister 并发竞态。
 */
function createAsyncQueue() {
  let tail = Promise.resolve();
  return (fn: () => Promise<void>): Promise<void> => {
    const next = tail.then(fn, fn);
    // 静默吞错，避免 unhandled rejection 链式传播
    tail = next.then(() => {}, () => {});
    return next;
  };
}

// ────────────────────────────────────────────────────────────────

export function useShortcuts(
  globalShortcut: string,
  windowPlacement: WindowPlacementSettings,
) {
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  /** 当前已注册的快捷键（空串 = 未注册） */
  const registeredRef = useRef('');
  /** 回调始终读取最新 windowPlacement，无需重新注册快捷键 */
  const placementRef = useRef(windowPlacement);
  placementRef.current = windowPlacement;

  /** 串行队列实例（组件生命周期内唯一） */
  const queueRef = useRef<ReturnType<typeof createAsyncQueue>>(null!);
  if (!queueRef.current) queueRef.current = createAsyncQueue();
  const enqueue = queueRef.current;

  /** 递增版本号——丢弃过期的异步结果 */
  const versionRef = useRef(0);

  // ── 核心注册 effect ──────────────────────────────────────────
  useEffect(() => {
    if (!isTauri) return;

    const thisVersion = ++versionRef.current;
    const isStale = () => versionRef.current !== thisVersion;

    setShortcutError(null);
    setIsRegistering(Boolean(globalShortcut));

    enqueue(async () => {
      // 1) 注销旧快捷键
      const prev = registeredRef.current;
      if (prev && prev !== globalShortcut) {
        await TauriService.unregisterShortcut(prev);
        if (registeredRef.current === prev) registeredRef.current = '';
      }
      if (isStale()) return;

      // 2) 无需注册 / 已注册 → 跳过
      if (!globalShortcut || registeredRef.current === globalShortcut) return;

      // 3) 注册新快捷键
      await TauriService.registerShortcut(globalShortcut, () => {
        void TauriService.handleGlobalShortcut(placementRef.current);
      });

      // 4) 注册期间版本已变 → 立即回滚
      if (isStale()) {
        await TauriService.unregisterShortcut(globalShortcut);
        return;
      }

      registeredRef.current = globalShortcut;
    })
      .then(() => {
        if (!isStale()) setShortcutError(null);
      })
      .catch((err: unknown) => {
        if (isStale()) return;
        console.error('Failed to register global shortcut:', err);
        setShortcutError(formatShortcutError(globalShortcut, err));
      })
      .finally(() => {
        if (!isStale()) setIsRegistering(false);
      });

    return () => {
      // 使挂起的异步任务过期，防止卸载后继续写入 registeredRef
      ++versionRef.current;
    };
    // windowPlacement 通过 ref 传递——避免仅改位置就重新注销/注册快捷键
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalShortcut]);

  // ── 组件卸载 + 页面关闭 统一清理 ────────────────────────────
  useEffect(() => {
    const cleanup = () => {
      if (!isTauri || !registeredRef.current) return;
      void TauriService.unregisterShortcut(registeredRef.current);
      registeredRef.current = '';
    };

    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide', cleanup);

    return () => {
      window.removeEventListener('beforeunload', cleanup);
      window.removeEventListener('pagehide', cleanup);
      cleanup(); // 组件卸载时也清理
    };
  }, []);

  return { shortcutError, isRegistering } as const;
}
