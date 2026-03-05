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

  const trigger = useCallback(
    (key: K) => {
      setCopiedKey(key);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setCopiedKey(null);
        timerRef.current = null;
      }, durationMs);
    },
    [durationMs],
  );

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
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { copiedKey, trigger, reset } as const;
}
