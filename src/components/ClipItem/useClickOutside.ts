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

/**
 * 监听点击外部区域并执行关闭回调。
 *
 * @param refs     被"保护"的 DOM 元素引用列表（点击其内部不触发回调）
 * @param isOpen   是否启用监听（关闭时自动卸载事件）
 * @param onClose  点击外部时的回调
 * @param options  附加选项
 */
export function useClickOutside(
  refs: React.RefObject<HTMLElement | null>[],
  isOpen: boolean,
  onClose: () => void,
  options: UseClickOutsideOptions = {},
) {
  const { event = 'mousedown', capture = false, escapeKey = false } = options;

  // 用 ref 持有最新回调 & refs 列表，避免因引用变化重挂监听器
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const refsRef = useRef(refs);
  refsRef.current = refs;

  useEffect(() => {
    if (!isOpen) return;

    const handlePointer = (e: Event) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (refsRef.current.some((ref) => ref.current?.contains(target))) return;
      onCloseRef.current();
    };

    const handleKeyDown = escapeKey
      ? (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); }
      : null;

    document.addEventListener(event, handlePointer, capture);
    if (handleKeyDown) document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener(event, handlePointer, capture);
      if (handleKeyDown) document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, event, capture, escapeKey]);
}
