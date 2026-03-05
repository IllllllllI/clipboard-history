import type { UnlistenFn } from '@tauri-apps/api/event';

/**
 * 创建 Tauri 事件监听器并返回同步清理函数。
 *
 * 正确处理以下竞态场景：
 * - React StrictMode 快速挂载 / 卸载
 * - subscribe Promise 在 cleanup 后才 resolve → 自动 dispose
 * - handler 在 cleanup 后不再触发
 *
 * 相比原始模式（let mounted + if/else promise 链）：
 * - 消除 5-8 行样板代码（每个监听器）
 * - 无泄漏：若 Promise 在 cleanup 后才 resolve，立即 dispose
 * - 安全幂等：cleanup 可重复调用
 */
export function subscribeTauriEvent<T>(
  subscribe: (handler: (payload: T) => void) => Promise<UnlistenFn>,
  handler: (payload: T) => void,
): () => void {
  let active = true;
  let unlisten: UnlistenFn | null = null;

  subscribe((payload) => {
    if (active) handler(payload);
  }).then((dispose) => {
    if (active) {
      unlisten = dispose;
    } else {
      // 组件已卸载，立即释放
      dispose();
    }
  }).catch(() => {});

  return () => {
    active = false;
    unlisten?.();
  };
}
