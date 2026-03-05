import { useEffect, useRef } from 'react';
import type { GalleryWheelMode } from '../../../types';

const WHEEL_THROTTLE_MS = 140;
const WHEEL_MIN_DELTA = 12;

interface UseWheelNavigationOptions {
  /** 是否启用滚轮导航 */
  enabled: boolean;
  /** 绑定监听的 DOM 元素 */
  elementRef: React.RefObject<HTMLElement | null>;
  /** 激活模式：'ctrl' 需按住 Ctrl，'always' 无条件触发 */
  wheelMode: GalleryWheelMode;
  /** 项目总数（≤ 1 时不触发） */
  itemCount: number;
  /** 切换回调，+1 或 -1 */
  onSwitch: (delta: number) => void;
}

/**
 * 为指定元素附加节流的、非 passive 的 wheel 监听器，用于上/下一张导航。
 * 同时处理 deltaY 和 deltaX 以支持触控板。
 */
export function useWheelNavigation({
  enabled,
  elementRef,
  wheelMode,
  itemCount,
  onSwitch,
}: UseWheelNavigationOptions): void {
  const timestampRef = useRef(0);

  useEffect(() => {
    if (!enabled || itemCount <= 1) return;
    const el = elementRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (wheelMode === 'ctrl' && !e.ctrlKey) return;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();

      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(delta) < WHEEL_MIN_DELTA) return;

      const now = Date.now();
      if (now - timestampRef.current < WHEEL_THROTTLE_MS) return;
      timestampRef.current = now;

      onSwitch(delta > 0 ? 1 : -1);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [enabled, elementRef, wheelMode, itemCount, onSwitch]);
}
