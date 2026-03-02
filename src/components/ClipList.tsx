import React, { useCallback, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAppContext } from '../contexts/AppContext';
import { KEYBOARD_NAV_SCROLL_EVENT } from '../hooks/useKeyboardNavigation';
import { EmptyState, VirtualizedClipRow } from './ClipListParts';

/**
 * 剪贴板历史列表容器（虚拟滚动）
 *
 * 使用 @tanstack/react-virtual 实现虚拟化，
 * 仅渲染可视区域内的条目，支持 500 条以上列表流畅滚动。
 */
export function ClipList() {
  const { filteredHistory } = useAppContext();
  const parentRef = useRef<HTMLDivElement>(null);
  const pendingMeasureElementsRef = useRef<Set<HTMLDivElement>>(new Set());
  const measureRafRef = useRef<number | null>(null);

  const virtualizer = useVirtualizer({
    count: filteredHistory.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // 预估行高（px），实际高度由 measureElement 动态测量
    overscan: 5,
    getItemKey: (index) => filteredHistory[index].id, // 用稳定 ID 作为键，避免删除项后缓存高度错位
  });

  const flushMeasureQueue = useCallback(() => {
    measureRafRef.current = null;
    pendingMeasureElementsRef.current.forEach((element) => {
      virtualizer.measureElement(element);
    });
    pendingMeasureElementsRef.current.clear();
  }, [virtualizer]);

  const scheduleMeasure = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;

    pendingMeasureElementsRef.current.add(element);

    if (measureRafRef.current !== null) return;
    measureRafRef.current = window.requestAnimationFrame(flushMeasureQueue);
  }, [flushMeasureQueue]);

  useEffect(() => {
    return () => {
      if (measureRafRef.current !== null) {
        window.cancelAnimationFrame(measureRafRef.current);
      }
      measureRafRef.current = null;
      pendingMeasureElementsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const onKeyboardNavScroll = (event: Event) => {
      const customEvent = event as CustomEvent<number>;
      const index = customEvent.detail;
      if (typeof index !== 'number' || filteredHistory.length === 0) return;
      const safeIndex = Math.max(0, Math.min(index, filteredHistory.length - 1));
      virtualizer.scrollToIndex(safeIndex, { align: 'auto' });
    };

    window.addEventListener(KEYBOARD_NAV_SCROLL_EVENT, onKeyboardNavScroll as EventListener);
    return () => {
      window.removeEventListener(KEYBOARD_NAV_SCROLL_EVENT, onKeyboardNavScroll as EventListener);
    };
  }, [filteredHistory.length, virtualizer]);

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto custom-scrollbar relative scroll-smooth px-1 sm:px-2 bg-neutral-50/50 dark:bg-neutral-900/50"
      style={{ overflowAnchor: 'none' }}
    >
      {filteredHistory.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          key="list"
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
          className="pt-2 pb-3"
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = filteredHistory[virtualRow.index];
            return (
              <VirtualizedClipRow
                key={item.id}
                item={item}
                index={virtualRow.index}
                start={virtualRow.start}
                onMeasure={scheduleMeasure}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
