import { useState, useEffect, useRef, useCallback } from 'react';
import { TauriService, isTauri } from '../services/tauri';

// Vite 热更新兜底：在模块替换前/销毁时强制清理全局快捷键
if (import.meta.hot) {
  const cleanup = () => {
    if (!isTauri) return;
    void TauriService.unregisterAllShortcuts();
  };

  import.meta.hot.on('vite:beforeUpdate', cleanup);
  import.meta.hot.dispose(() => {
    import.meta.hot?.off('vite:beforeUpdate', cleanup);
    cleanup();
  });
}

/** 将 Tauri 插件错误转为用户友好的中文提示 */
function formatShortcutError(shortcut: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('already registered')) {
    return `快捷键 ${shortcut} 已被占用，请尝试更换其他快捷键`;
  }
  return msg;
}

export function useShortcuts(globalShortcut: string) {
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  // 并发防护：快速连续变更快捷键时，只以最后一次为准
  const versionRef = useRef(0);
  const pendingRef = useRef<Promise<void> | null>(null);
  const registeredShortcutRef = useRef<string>('');

  const cleanupShortcuts = useCallback(() => {
    if (!isTauri) return;
    if (registeredShortcutRef.current) {
      void TauriService.unregisterShortcut(registeredShortcutRef.current);
      registeredShortcutRef.current = '';
    }
  }, []);

  useEffect(() => {
    if (!isTauri) return;

    const thisVersion = ++versionRef.current;
    let disposed = false;
    setShortcutError(null);

    const setup = async () => {
      let task: Promise<void> | null = null;

      try {
        setIsRegistering(Boolean(globalShortcut));

        // 串行化注册流程，避免重复注册竞态导致的 "already registered"
        if (pendingRef.current) {
          await pendingRef.current;
        }

        task = (async () => {
          const previous = registeredShortcutRef.current;
          if (previous && previous !== globalShortcut) {
            await TauriService.unregisterShortcut(previous);
            if (registeredShortcutRef.current === previous) {
              registeredShortcutRef.current = '';
            }
          }
          if (disposed || versionRef.current !== thisVersion) return;

          if (!globalShortcut) {
            return;
          }

          if (registeredShortcutRef.current === globalShortcut) {
            return;
          }

          await TauriService.registerShortcut(globalShortcut, () => {
            void TauriService.handleGlobalShortcut();
          });

          if (disposed || versionRef.current !== thisVersion) {
            await TauriService.unregisterShortcut(globalShortcut);
            return;
          }

          registeredShortcutRef.current = globalShortcut;
        })();

        pendingRef.current = task;
        await task;

        // 注册成功后确认仍是最新版本
        if (!disposed && versionRef.current === thisVersion) {
          setShortcutError(null);
        }
      } catch (err) {
        if (disposed || versionRef.current !== thisVersion) return;
        console.error('Failed to register global shortcut:', err);
        setShortcutError(formatShortcutError(globalShortcut, err));
      } finally {
        if (!disposed && versionRef.current === thisVersion) {
          setIsRegistering(false);
        }
        if (task && pendingRef.current === task) {
          pendingRef.current = null;
        }
      }
    };

    setup();

    return () => {
      disposed = true;
    };
  }, [globalShortcut]);

  // 组件卸载时清理快捷键
  useEffect(() => {
    return () => cleanupShortcuts();
  }, [cleanupShortcuts]);

  // 页面卸载 / 关闭时兜底清理（刷新、导航、应用退出流程）
  useEffect(() => {
    window.addEventListener('beforeunload', cleanupShortcuts);
    window.addEventListener('pagehide', cleanupShortcuts);

    return () => {
      window.removeEventListener('beforeunload', cleanupShortcuts);
      window.removeEventListener('pagehide', cleanupShortcuts);
    };
  }, [cleanupShortcuts]);

  return { shortcutError, isRegistering };
}
