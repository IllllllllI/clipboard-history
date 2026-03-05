/**
 * 统一动画预设系统
 *
 * 提供可直接用于 motion/react 组件的 Variants、Transition 和动画 props 工厂。
 * 设计目标：
 * - 消除组件中散落的硬编码 initial/animate/exit 对象
 * - 提供语义化 API：backdrop、modal、dialog、popover、collapse 等
 * - 「safe / fancy」两档预设 + prefers-reduced-motion 友好
 * - 所有对象均为冻结单例，不会在每次渲染时创建新引用
 */

import type { Transition, Variants } from 'motion/react';

// ============================================================================
// 类型
// ============================================================================

export type AnimationMode = 'safe' | 'fancy';

export interface SpringConfig {
  type: 'spring';
  stiffness: number;
  damping: number;
}

export interface DurationConfig {
  duration: number;
  ease?: string | number[];
}

/** 可直接展开到 <motion.div {...props}> 的完整动画 props */
export interface MotionAnimationProps {
  initial: Record<string, unknown>;
  animate: Record<string, unknown>;
  exit: Record<string, unknown>;
  transition?: Transition;
}

// ============================================================================
// 基础 Spring / Duration 预设（冻结单例）
// ============================================================================

/** 通用 UI spring（按钮、图标反馈） */
export const SPRING_UI = Object.freeze({ type: 'spring' as const, stiffness: 400, damping: 28 });

/** Dialog / modal spring */
export const SPRING_DIALOG = Object.freeze({ type: 'spring' as const, stiffness: 400, damping: 25 });

/** 列表项 spring */
export const SPRING_LIST = Object.freeze({ type: 'spring' as const, stiffness: 350, damping: 25 });

/** 图标切换 spring（偏快偏弹） */
export const SPRING_ICON = Object.freeze({ type: 'spring' as const, stiffness: 500, damping: 30 });

/** Popover spring */
export const SPRING_POPOVER = Object.freeze({ type: 'spring' as const, stiffness: 360, damping: 24 });

/** Layout spring（列表重排） */
export const SPRING_LAYOUT = Object.freeze({ type: 'spring' as const, bounce: 0.15, duration: 0.5 });

/** 快速过渡 */
export const DURATION_FAST = Object.freeze({ duration: 0.15 });

/** 普通过渡 */
export const DURATION_NORMAL = Object.freeze({ duration: 0.2 });

/** 慢速过渡 */
export const DURATION_SLOW = Object.freeze({ duration: 0.24, ease: 'easeOut' });

/** Popover 入场自定义 easing */
export const DURATION_POPOVER = Object.freeze({
  duration: 0.18,
  ease: [0.23, 1, 0.32, 1] as [number, number, number, number],
});

// ============================================================================
// Variants 工厂 — 语义化动画预设
// ============================================================================

/**
 * 遮罩层淡入 / 淡出
 * 用于: AddSnippetModal, SettingsModal, CodeEditorModal, LargeImagePreview, TagManager…
 */
export const backdropVariants: Variants = Object.freeze({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
});

/** 带自定义 exit transition 的遮罩 */
export const backdropVariantsDelayed: Variants = Object.freeze({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0, transition: { delay: 0.08, duration: 0.16 } },
});

/**
 * 标准 Modal 弹入
 * 用于: AddSnippetModal, SettingsModal, CodeEditorModal
 * { opacity:0, scale:0.95, y:10 } → { opacity:1, scale:1, y:0 }
 */
export const modalVariants: Variants = Object.freeze({
  initial: { opacity: 0, scale: 0.95, y: 10 },
  animate: { opacity: 1, scale: 1,    y: 0  },
  exit:    { opacity: 0, scale: 0.95, y: 10 },
});

/**
 * TagManager 特殊 Modal（带 spring 入场、easeIn 出场）
 */
export const tagModalVariants: Variants = Object.freeze({
  initial: { opacity: 0, scale: 0.96, y: 10 },
  animate: {
    opacity: 1, scale: 1, y: 0,
    transition: { type: 'spring', damping: 25, stiffness: 350 },
  },
  exit: {
    opacity: 0, scale: 0.98, y: 5,
    transition: { duration: 0.14, ease: 'easeIn' },
  },
});

/**
 * 居中 Dialog 弹入（含 translate(-50%, -50%) 定位的子对话框）
 * 用于: TagEditorDialog, TagDeleteDialog
 */
export const dialogCenteredVariants: Variants = Object.freeze({
  initial: { opacity: 0, scale: 0.95, y: 10,      x: '-50%' },
  animate: {
    opacity: 1, scale: 1, y: '-50%', x: '-50%',
    transition: { type: 'spring', damping: 25, stiffness: 400 },
  },
  exit: {
    opacity: 0, scale: 0.95, y: -10, x: '-50%',
    transition: { duration: 0.15 },
  },
});

/** Dialog 遮罩（快速退出） */
export const dialogOverlayVariants: Variants = Object.freeze({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0, transition: { duration: 0.12 } },
});

/**
 * Popover 弹出层
 * 用于: ColorPickerPopover
 */
export const popoverVariants: Variants = Object.freeze({
  initial: { opacity: 0, scale: 0.92, y: -8 },
  animate: { opacity: 1, scale: 1,    y: 0  },
  exit:    { opacity: 0, scale: 0.92, y: -8 },
});

/**
 * 折叠/展开动画
 * 用于: HistoryColors, ClipItemTagList (outer shell)
 */
export const collapseVariants: Variants = Object.freeze({
  initial: { height: 0,      opacity: 0 },
  animate: { height: 'auto', opacity: 1 },
  exit:    { height: 0,      opacity: 0 },
});

/**
 * 内容缩放反馈（复制成功勾选等）
 * 用于: ColorContentBlock, AnimatedCopyIcon
 */
export const scaleFeedbackVariants: Variants = Object.freeze({
  initial: { opacity: 0, scale: 0.5 },
  animate: { opacity: 1, scale: 1   },
  exit:    { opacity: 0, scale: 0.5 },
});

/**
 * 空状态入场
 * 用于: EmptyState
 */
export const emptyStateVariants: Variants = Object.freeze({
  initial: { opacity: 0, y: 8,  scale: 0.98 },
  animate: { opacity: 1, y: 0,  scale: 1    },
  exit:    { opacity: 0, y: -8, scale: 0.98 },
});

/**
 * 列表项入场（通用）
 * 用于: TagList empty state, TagRow
 */
export const listItemVariants: Variants = Object.freeze({
  initial: { opacity: 0, scale: 0.95, y: 10 },
  animate: { opacity: 1, scale: 1,    y: 0  },
  exit:    { opacity: 0, scale: 0.9           },
});

/**
 * 标签胶囊弹入
 * 用于: ClipItemTagList pill
 */
export const tagPillVariants: Variants = Object.freeze({
  initial: { opacity: 0, scale: 0.8, filter: 'blur(2px)' },
  animate: { opacity: 1, scale: 1,   filter: 'blur(0px)' },
  exit:    { opacity: 0, scale: 0.8                       },
});

/**
 * 图标切换（含旋转）
 * 用于: AnimatedCopyIcon
 */
export const iconSwapInVariants: Variants = Object.freeze({
  initial: { opacity: 0, scale: 0.5, rotate: -45 },
  animate: { opacity: 1, scale: 1,   rotate: 0   },
  exit:    { opacity: 0, scale: 0.5               },
});

export const iconSwapOutVariants: Variants = Object.freeze({
  initial: { opacity: 0, scale: 0.5, rotate: 45 },
  animate: { opacity: 1, scale: 1,   rotate: 0  },
  exit:    { opacity: 0, scale: 0.5              },
});

/**
 * 简单淡入（header icon 等）
 */
export const fadeInVariants: Variants = Object.freeze({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
});

/**
 * Check 标记弹入（选色器中选中反馈）
 */
export const checkMarkVariants: Variants = Object.freeze({
  initial: { scale: 0, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
});

// ============================================================================
// 列表 stagger 延迟辅助
// ============================================================================

/**
 * 为列表项生成带 stagger 延迟的 transition。
 * @param index 项目索引
 * @param staggerStep 间隔秒数，默认 0.04
 */
export function staggeredListTransition(
  index: number,
  staggerStep = 0.04,
): Transition {
  return {
    opacity: { duration: 0.2 },
    default: { type: 'spring', stiffness: 450, damping: 30, delay: index * staggerStep },
  } as Transition;
}

// ============================================================================
// 完整预设（兼容旧 API）
// ============================================================================

interface DurationPreset {
  fast: number;
  normal: number;
  slow: number;
}

interface SpringPreset {
  stiffness: number;
  damping: number;
}

export interface MotionPreset {
  mode: AnimationMode;
  duration: DurationPreset;
  spring: {
    ui: SpringPreset;
    dialog: SpringPreset;
    popover: SpringPreset;
    list: SpringPreset;
    icon: SpringPreset;
  };
  stagger: number;
}

const SAFE_PRESET: MotionPreset = Object.freeze({
  mode: 'safe',
  duration: { fast: 0.12, normal: 0.18, slow: 0.24 },
  spring: {
    ui:      { stiffness: 400, damping: 28 },
    dialog:  { stiffness: 400, damping: 25 },
    popover: { stiffness: 360, damping: 24 },
    list:    { stiffness: 350, damping: 25 },
    icon:    { stiffness: 500, damping: 30 },
  },
  stagger: 0.02,
}) as MotionPreset;

const FANCY_PRESET: MotionPreset = Object.freeze({
  mode: 'fancy',
  duration: { fast: 0.16, normal: 0.24, slow: 0.34 },
  spring: {
    ui:      { stiffness: 320, damping: 22 },
    dialog:  { stiffness: 350, damping: 22 },
    popover: { stiffness: 340, damping: 20 },
    list:    { stiffness: 300, damping: 22 },
    icon:    { stiffness: 450, damping: 26 },
  },
  stagger: 0.04,
}) as MotionPreset;

export function getMotionPreset(mode: AnimationMode): MotionPreset {
  return mode === 'safe' ? SAFE_PRESET : FANCY_PRESET;
}
