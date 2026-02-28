export type AnimationMode = 'safe' | 'fancy';

type DurationPreset = {
  fast: number;
  normal: number;
  slow: number;
};

type SpringPreset = {
  stiffness: number;
  damping: number;
};

export interface MotionPreset {
  mode: AnimationMode;
  duration: DurationPreset;
  spring: {
    ui: SpringPreset;
    popover: SpringPreset;
    list: SpringPreset;
  };
  stagger: number;
}

const SAFE_PRESET: MotionPreset = {
  mode: 'safe',
  duration: {
    fast: 0.12,
    normal: 0.18,
    slow: 0.24,
  },
  spring: {
    ui: { stiffness: 320, damping: 30 },
    popover: { stiffness: 320, damping: 28 },
    list: { stiffness: 340, damping: 30 },
  },
  stagger: 0.02,
};

const FANCY_PRESET: MotionPreset = {
  mode: 'fancy',
  duration: {
    fast: 0.16,
    normal: 0.24,
    slow: 0.34,
  },
  spring: {
    ui: { stiffness: 300, damping: 24 },
    popover: { stiffness: 360, damping: 24 },
    list: { stiffness: 380, damping: 24 },
  },
  stagger: 0.04,
};

export function getMotionPreset(mode: AnimationMode): MotionPreset {
  return mode === 'safe' ? SAFE_PRESET : FANCY_PRESET;
}
