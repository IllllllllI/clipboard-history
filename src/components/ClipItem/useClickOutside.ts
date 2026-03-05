import { useEffect, useRef } from 'react';

// ============================================================================
// useClickOutside — 统一的"点击外部关闭"Hook
// ============================================================================

export interface UseClickOutsideOptions {
  /** 监听的指针事件类型，默认 'mousedown' */
  event?: 'mousedown' | 'pointerdown';
  /** 是否在捕获阶段监听，默认 false */
  capture?: boolean;
  /** 是否同时监听 Escape 键关闭，默认 false */
  escapeKey?: boolean;
}

// 默认选项（模块级常量，避免每次调用新建对象）
const DEFAULT_OPTIONS: UseClickOutsideOptions = {};

/**
 * 监听点击外部区域并执行关闭回调。
 *
 * 改进点（相比原实现）：
 * - **性能**：effect 仅依赖 `isOpen`，所有参数均通过 ref 读取，
 *   消除因 refs 数组 / options 对象重建导致的监听器重挂
 * - **内存**：每个 hook 实例仅 1 个 ref 对象（合并为 stableRef），不再分散 2 个 ref
 * - **结构**：handler 不再用闭包捕获 options 值，统一从 ref 读取
 *
 * @param refs    被"保护"的 DOM 元素引用列表（点击其内部不触发回调）
 * @param isOpen  是否启用监听（关闭时自动卸载事件）
 * @param onClose 点击外部时的回调
 * @param options 附加选项
 */
export function useClickOutside(
  refs: React.RefObject<HTMLElement | null>[],
  isOpen: boolean,
  onClose: () => void,
  options: UseClickOutsideOptions = DEFAULT_OPTIONS,
) {
  // 合并所有可变参数到单个 ref，effect 零外部依赖（除 isOpen）
  const stableRef = useRef({ refs, onClose, options });
  stableRef.current.refs = refs;
  stableRef.current.onClose = onClose;
  stableRef.current.options = options;

  useEffect(() => {
    if (!isOpen) return;

    const handlePointer = (e: Event) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      const { refs: currentRefs, onClose: currentOnClose } = stableRef.current;
      if (currentRefs.some((ref) => ref.current?.contains(target))) return;
      currentOnClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stableRef.current.options.escapeKey) {
        stableRef.current.onClose();
      }
    };

    const { event = 'mousedown', capture = false, escapeKey = false } = stableRef.current.options;

    document.addEventListener(event, handlePointer, capture);
    if (escapeKey) document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener(event, handlePointer, capture);
      if (escapeKey) document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);
}
