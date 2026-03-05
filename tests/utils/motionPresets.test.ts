import { describe, it, expect } from 'vitest';
import {
  getMotionPreset,
  backdropVariants,
  backdropVariantsDelayed,
  modalVariants,
  tagModalVariants,
  dialogCenteredVariants,
  dialogOverlayVariants,
  popoverVariants,
  collapseVariants,
  scaleFeedbackVariants,
  emptyStateVariants,
  listItemVariants,
  tagPillVariants,
  iconSwapInVariants,
  iconSwapOutVariants,
  fadeInVariants,
  checkMarkVariants,
  staggeredListTransition,
  SPRING_UI,
  SPRING_DIALOG,
  SPRING_LIST,
  SPRING_ICON,
  SPRING_POPOVER,
  SPRING_LAYOUT,
  DURATION_FAST,
  DURATION_NORMAL,
  DURATION_SLOW,
  DURATION_POPOVER,
  type AnimationMode,
} from '../../src/utils/motionPresets';

// ============================================================================
// getMotionPreset — safe / fancy 切换
// ============================================================================

describe('getMotionPreset', () => {
  it('should return safe preset', () => {
    const preset = getMotionPreset('safe');
    expect(preset.mode).toBe('safe');
    expect(preset.duration.fast).toBeLessThan(preset.duration.normal);
    expect(preset.duration.normal).toBeLessThan(preset.duration.slow);
  });

  it('should return fancy preset', () => {
    const preset = getMotionPreset('fancy');
    expect(preset.mode).toBe('fancy');
    expect(preset.duration.fast).toBeLessThan(preset.duration.normal);
  });

  it('safe stagger should be less than fancy stagger', () => {
    expect(getMotionPreset('safe').stagger).toBeLessThan(getMotionPreset('fancy').stagger);
  });

  it('should return frozen objects', () => {
    const safe = getMotionPreset('safe');
    const fancy = getMotionPreset('fancy');
    expect(Object.isFrozen(safe)).toBe(true);
    expect(Object.isFrozen(fancy)).toBe(true);
  });

  it('safe should have higher stiffness (stiffer = less bounce)', () => {
    const safe = getMotionPreset('safe');
    const fancy = getMotionPreset('fancy');
    expect(safe.spring.ui.stiffness).toBeGreaterThan(fancy.spring.ui.stiffness);
  });

  it('should include all spring categories', () => {
    const preset = getMotionPreset('safe');
    expect(preset.spring).toHaveProperty('ui');
    expect(preset.spring).toHaveProperty('dialog');
    expect(preset.spring).toHaveProperty('popover');
    expect(preset.spring).toHaveProperty('list');
    expect(preset.spring).toHaveProperty('icon');
  });
});

// ============================================================================
// Spring / Duration 常量 — 单例 + 冻结
// ============================================================================

describe('spring and duration constants', () => {
  it('SPRING_* should be frozen objects with type=spring', () => {
    for (const spring of [SPRING_UI, SPRING_DIALOG, SPRING_LIST, SPRING_ICON, SPRING_POPOVER]) {
      expect(Object.isFrozen(spring)).toBe(true);
      expect(spring.type).toBe('spring');
      expect(spring.stiffness).toBeGreaterThan(0);
      expect(spring.damping).toBeGreaterThan(0);
    }
  });

  it('SPRING_LAYOUT should be frozen', () => {
    expect(Object.isFrozen(SPRING_LAYOUT)).toBe(true);
    expect(SPRING_LAYOUT.type).toBe('spring');
  });

  it('DURATION_* should be frozen objects with positive duration', () => {
    for (const dur of [DURATION_FAST, DURATION_NORMAL, DURATION_SLOW]) {
      expect(Object.isFrozen(dur)).toBe(true);
      expect(dur.duration).toBeGreaterThan(0);
    }
  });

  it('DURATION_POPOVER should have custom ease array', () => {
    expect(Object.isFrozen(DURATION_POPOVER)).toBe(true);
    expect(Array.isArray(DURATION_POPOVER.ease)).toBe(true);
    expect((DURATION_POPOVER.ease as number[]).length).toBe(4);
  });
});

// ============================================================================
// Variants — 结构完整性
// ============================================================================

describe('variant objects', () => {
  const allVariants = [
    { name: 'backdropVariants', v: backdropVariants },
    { name: 'backdropVariantsDelayed', v: backdropVariantsDelayed },
    { name: 'modalVariants', v: modalVariants },
    { name: 'tagModalVariants', v: tagModalVariants },
    { name: 'dialogCenteredVariants', v: dialogCenteredVariants },
    { name: 'dialogOverlayVariants', v: dialogOverlayVariants },
    { name: 'popoverVariants', v: popoverVariants },
    { name: 'collapseVariants', v: collapseVariants },
    { name: 'scaleFeedbackVariants', v: scaleFeedbackVariants },
    { name: 'emptyStateVariants', v: emptyStateVariants },
    { name: 'listItemVariants', v: listItemVariants },
    { name: 'tagPillVariants', v: tagPillVariants },
    { name: 'iconSwapInVariants', v: iconSwapInVariants },
    { name: 'iconSwapOutVariants', v: iconSwapOutVariants },
    { name: 'fadeInVariants', v: fadeInVariants },
  ];

  it.each(allVariants)('$name should have initial and animate keys', ({ v }) => {
    expect(v).toHaveProperty('initial');
    expect(v).toHaveProperty('animate');
  });

  it.each(allVariants)('$name should be frozen', ({ v }) => {
    expect(Object.isFrozen(v)).toBe(true);
  });

  it('checkMarkVariants should have initial and animate', () => {
    expect(checkMarkVariants).toHaveProperty('initial');
    expect(checkMarkVariants).toHaveProperty('animate');
    expect(Object.isFrozen(checkMarkVariants)).toBe(true);
  });
});

// ============================================================================
// backdropVariants — 语义验证
// ============================================================================

describe('backdropVariants', () => {
  it('should fade from 0 to 1', () => {
    const init = backdropVariants.initial as Record<string, unknown>;
    const anim = backdropVariants.animate as Record<string, unknown>;
    const exit = backdropVariants.exit as Record<string, unknown>;
    expect(init.opacity).toBe(0);
    expect(anim.opacity).toBe(1);
    expect(exit.opacity).toBe(0);
  });
});

describe('backdropVariantsDelayed', () => {
  it('exit should have delay', () => {
    const exit = backdropVariantsDelayed.exit as Record<string, unknown>;
    const trans = exit.transition as Record<string, number>;
    expect(trans.delay).toBeGreaterThan(0);
  });
});

// ============================================================================
// modalVariants — 语义验证
// ============================================================================

describe('modalVariants', () => {
  it('should scale from 0.95 to 1 with y offset', () => {
    const init = modalVariants.initial as Record<string, unknown>;
    const anim = modalVariants.animate as Record<string, unknown>;
    expect(init.scale).toBe(0.95);
    expect(init.y).toBe(10);
    expect(anim.scale).toBe(1);
    expect(anim.y).toBe(0);
  });
});

// ============================================================================
// dialogCenteredVariants — 语义验证
// ============================================================================

describe('dialogCenteredVariants', () => {
  it('initial should have x: -50%', () => {
    const init = dialogCenteredVariants.initial as Record<string, unknown>;
    expect(init.x).toBe('-50%');
  });

  it('animate should have spring transition', () => {
    const anim = dialogCenteredVariants.animate as Record<string, unknown>;
    const trans = anim.transition as Record<string, unknown>;
    expect(trans.type).toBe('spring');
  });
});

// ============================================================================
// staggeredListTransition
// ============================================================================

describe('staggeredListTransition', () => {
  it('should return transition with delay based on index', () => {
    const t0 = staggeredListTransition(0) as Record<string, unknown>;
    const t3 = staggeredListTransition(3) as Record<string, unknown>;

    const d0 = t0.default as Record<string, number>;
    const d3 = t3.default as Record<string, number>;

    expect(d0.delay).toBe(0);
    expect(d3.delay).toBeCloseTo(0.12, 5);
  });

  it('should support custom stagger step', () => {
    const t = staggeredListTransition(2, 0.1) as Record<string, unknown>;
    const d = t.default as Record<string, number>;
    expect(d.delay).toBeCloseTo(0.2, 5);
  });

  it('should include opacity duration', () => {
    const t = staggeredListTransition(0) as Record<string, unknown>;
    const o = t.opacity as Record<string, number>;
    expect(o.duration).toBe(0.2);
  });
});

// ============================================================================
// collapseVariants
// ============================================================================

describe('collapseVariants', () => {
  it('should animate from height: 0 to height: auto', () => {
    const init = collapseVariants.initial as Record<string, unknown>;
    const anim = collapseVariants.animate as Record<string, unknown>;
    expect(init.height).toBe(0);
    expect(anim.height).toBe('auto');
  });
});

// ============================================================================
// tagPillVariants
// ============================================================================

describe('tagPillVariants', () => {
  it('should include blur filter', () => {
    const init = tagPillVariants.initial as Record<string, string>;
    const anim = tagPillVariants.animate as Record<string, string>;
    expect(init.filter).toContain('blur');
    expect(anim.filter).toContain('blur(0');
  });
});

// ============================================================================
// AnimationMode type
// ============================================================================

describe('AnimationMode type', () => {
  it('getMotionPreset should accept safe and fancy', () => {
    const modes: AnimationMode[] = ['safe', 'fancy'];
    for (const mode of modes) {
      const p = getMotionPreset(mode);
      expect(p.mode).toBe(mode);
    }
  });
});
