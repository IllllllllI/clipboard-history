import { useRef, useState, useEffect, useCallback } from 'react';

export interface PopoverPosition {
  position: 'fixed';
  top: number;
  left: number;
  zIndex: number;
  opacity: number;
  visibility: 'visible' | 'hidden';
  pointerEvents: 'auto' | 'none';
  transition: string;
}

const HIDDEN: PopoverPosition = {
  position: 'fixed',
  top: 0,
  left: 0,
  zIndex: 9999,
  opacity: 0,
  visibility: 'hidden',
  pointerEvents: 'none',
  transition: 'none',
};

const PADDING = 4;   // 与视口边缘的安全间距
const GAP = 4;        // 弹出层与锚点的间距

/**
 * 通用 Portal Popover 定位 Hook
 *
 * 逻辑：优先在锚点上方显示，空间不足时改为下方；左侧不超出视口。
 * 打开后监听 resize/scroll 实时更新位置。
 */
export function usePopoverPosition(
  anchorRef: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<PopoverPosition>(HIDDEN);

  const computePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const el = popoverRef.current;
    if (!anchor || !el) return;

    const anchorRect = anchor.getBoundingClientRect();
    const popH = el.offsetHeight;
    const popW = el.offsetWidth;

    // 纵向：优先向上
    const topPos = anchorRect.top - popH - GAP;
    const finalTop = topPos < PADDING ? anchorRect.bottom + GAP : topPos;

    // 横向：不超出视口
    const maxLeft = window.innerWidth - popW - PADDING;
    const finalLeft = Math.max(PADDING, Math.min(anchorRect.left, maxLeft));

    setStyle({
      position: 'fixed',
      top: finalTop,
      left: finalLeft,
      zIndex: 9999,
      opacity: 1,
      visibility: 'visible',
      pointerEvents: 'auto',
      transition: 'opacity 100ms ease',
    });
  }, [anchorRef]);

  // 首次打开：先隐藏渲染以获取尺寸，再一帧后计算最终位置
  useEffect(() => {
    if (!isOpen) {
      setStyle(HIDDEN);
      return;
    }

    // 先以隐藏状态放到视口内让浏览器布局（visibility:hidden 不影响页面交互）
    setStyle(prev => ({ ...prev, visibility: 'hidden', opacity: 0, pointerEvents: 'none' }));

    const frameId = requestAnimationFrame(computePosition);
    return () => cancelAnimationFrame(frameId);
  }, [isOpen, computePosition]);

  // 打开期间响应窗口变化
  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener('resize', computePosition);
    window.addEventListener('scroll', computePosition, true); // capture 捕获内部滚动
    return () => {
      window.removeEventListener('resize', computePosition);
      window.removeEventListener('scroll', computePosition, true);
    };
  }, [isOpen, computePosition]);

  return { popoverRef, style } as const;
}
