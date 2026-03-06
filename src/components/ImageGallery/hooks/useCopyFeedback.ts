import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * 管理「复制反馈」UI 状态：记录当前被复制的 key 并在超时后自动清除。
 *
 * 泛型 K 允许调用方使用 string（URL）或 number（索引）作为 key。
 *
 * @example
 *   const { copiedKey, trigger, reset } = useCopyFeedback<string>(1200);
 *   trigger(url);           // 设置 copiedKey = url，1200ms 后自动清除
 *   copiedKey === url;      // true → 显示"已复制"图标
 */
export function useCopyFeedback<K = string>(durationMs: number) {
  const [copiedKey, setCopiedKey] = useState<K | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationRef = useRef(durationMs);

  // 监听时长更新，避免在 useCallback 中建立依赖导致闭包函数重建
  useEffect(() => {
    durationRef.current = durationMs;
  }, [durationMs]);

  const trigger = useCallback((key: K) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setCopiedKey(key);
    timerRef.current = setTimeout(() => {
      setCopiedKey(null);
      timerRef.current = null;
    }, durationRef.current);
  }, []);

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCopiedKey(null);
  }, []);

  // 卸载时清理
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  return { copiedKey, trigger, reset } as const;
}
