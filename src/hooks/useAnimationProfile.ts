import { useMemo } from 'react';
import { useReducedMotion } from 'motion/react';
import { AnimationMode } from '../utils/motionPresets';

function detectWindowsPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /windows/i.test(navigator.userAgent) || /win/i.test(navigator.platform);
}

export function useAnimationProfile(): AnimationMode {
  const prefersReducedMotion = useReducedMotion();

  return useMemo(() => {
    if (prefersReducedMotion) return 'safe';
    if (detectWindowsPlatform()) return 'safe';
    return 'fancy';
  }, [prefersReducedMotion]);
}
