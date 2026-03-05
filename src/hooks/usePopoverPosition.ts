import { useRef, useState, useLayoutEffect, useEffect, useCallback } from 'react';

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

/** 不可见状态（关闭 / 测量中） */
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

/** 纯函数：根据锚点矩形与弹出层尺寸计算最终坐标 */
function resolveCoords(
  anchor: DOMRect,
  popW: number,
  popH: number,
): { top: number; left: number } {
  const above = anchor.top - popH - GAP;
  return {
    top: above >= PADDING ? above : anchor.bottom + GAP,
    left: Math.max(PADDING, Math.min(anchor.left, window.innerWidth - popW - PADDING)),
  };
}

/**
 * 通用 Portal Popover 定位 Hook
 *
 * - 优先在锚点上方显示，空间不足时改为下方；横向不超出视口。
 * - 使用 useLayoutEffect 同步定位，避免首次弹出闪烁。
 * - 打开期间以 rAF 节流响应 resize / scroll。
 */
export function usePopoverPosition(
  anchorRef: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0); // 0 = 无待执行帧
  const [style, setStyle] = useState<PopoverPosition>(HIDDEN);

  /** 同步测量并更新定位（幂等：坐标不变不触发 re-render） */
  const recompute = useCallback(() => {
    const anchor = anchorRef.current;
    const el = popoverRef.current;
    if (!anchor || !el) return;

    const { top, left } = resolveCoords(
      anchor.getBoundingClientRect(),
      el.offsetWidth,
      el.offsetHeight,
    );

    setStyle((prev) =>
      prev.top === top && prev.left === left && prev.opacity === 1
        ? prev
        : {
            position: 'fixed',
            top,
            left,
            zIndex: 9999,
            opacity: 1,
            visibility: 'visible',
            pointerEvents: 'auto',
            transition: 'opacity 100ms ease',
          },
    );
  }, [anchorRef]);

  // ── 初始定位：同步于 DOM 提交后、浏览器绘制前 ──
  useLayoutEffect(() => {
    if (!isOpen) {
      setStyle(HIDDEN);
      return;
    }
    // Portal DOM 已提交，同步测量并定位——浏览器首帧即渲染正确位置
    recompute();
  }, [isOpen, recompute]);

  // ── 打开期间响应 resize / scroll ──
  useEffect(() => {
    if (!isOpen) return;

    const onViewportChange = () => {
      if (rafRef.current) return; // 已有待执行帧
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        recompute();
      });
    };

    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, { capture: true, passive: true });

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, { capture: true });
    };
  }, [isOpen, recompute]);

  return { popoverRef, style } as const;
}
