import { useMemo } from 'react';
import { useReducedMotion } from 'motion/react';
import { type AnimationMode, type MotionPreset, getMotionPreset } from '../utils/motionPresets';

function detectWindowsPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /windows/i.test(navigator.userAgent) || /win/i.test(navigator.platform);
}

/**
 * 返回当前动画模式（safe / fancy）。
 *
 * - `prefers-reduced-motion` → safe
 * - Windows 平台 → safe（WinCompositor 对高频弹簧动画性能不佳）
 * - 其他 → fancy
 */
export function useAnimationProfile(): AnimationMode {
  const prefersReducedMotion = useReducedMotion();

  return useMemo(() => {
    if (prefersReducedMotion) return 'safe';
    if (detectWindowsPlatform()) return 'safe';
    return 'fancy';
  }, [prefersReducedMotion]);
}

/**
 * 返回完整的动画预设对象，包含 spring/duration/stagger 参数。
 * 相比 `useAnimationProfile` 更便于直接消费。
 */
export function useMotionPreset(): MotionPreset {
  const mode = useAnimationProfile();
  return useMemo(() => getMotionPreset(mode), [mode]);
}
