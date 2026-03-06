import React, { useCallback, useEffect, useRef } from 'react';
import { useVirtualizer, VirtualItem } from '@tanstack/react-virtual';
import { useAppContext } from '../contexts/AppContext';
import { KEYBOARD_NAV_SCROLL_EVENT } from '../hooks/useKeyboardNavigation';
import { ClipItemProvider } from './ClipItem';
import { EmptyState, VirtualizedClipRow } from './ClipListParts';

/**
 * 剪贴板历史列表容器（虚拟滚动）
 *
 * 使用 @tanstack/react-virtual 实现虚拟化，
 * 仅渲染可视区域内的条目，支持高频更新与大数据量流畅滚动。
 */
export function ClipList() {
  const { filteredHistory, selectedIndex, copiedId, searchQuery } = useAppContext();
  const parentRef = useRef<HTMLDivElement>(null);

  const getItemKey = useCallback(
    (index: number) => filteredHistory[index]?.id ?? index,
    [filteredHistory]
  );

  const virtualizer = useVirtualizer({
    count: filteredHistory.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // 预估行高（px），实际高度由 measureElement 动态测量
    overscan: 3,
    getItemKey,
  });

  // 监听独立外置的键盘滚动事件，使用 ref 确保持有最新的 virtualizer 引用，避免频繁重绑事件
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  useEffect(() => {
    const onKeyboardNavScroll = (event: Event) => {
      const customEvent = event as CustomEvent<number>;
      const index = customEvent.detail;
      if (typeof index !== 'number' || filteredHistory.length === 0) return;
      
      const safeIndex = Math.max(0, Math.min(index, filteredHistory.length - 1));
      // align: 'auto' 使得只在不在可视区时才发生滚动
      virtualizerRef.current.scrollToIndex(safeIndex, { align: 'auto' });
    };

    window.addEventListener(KEYBOARD_NAV_SCROLL_EVENT, onKeyboardNavScroll);
    return () => {
      window.removeEventListener(KEYBOARD_NAV_SCROLL_EVENT, onKeyboardNavScroll);
    };
  }, [filteredHistory.length]);

  return (
    <ClipItemProvider>
      <div
        ref={parentRef}
        // 注意：移除了 scroll-smooth。因为 CSS 原生的 scroll-smooth 会严重干扰虚拟列表动态高度的计算与跳转
        className="flex-1 overflow-y-auto custom-scrollbar relative px-1 sm:px-2 bg-neutral-50/50 dark:bg-neutral-900/50"
        style={{ overflowAnchor: 'none' }}
      >
        {filteredHistory.length === 0 ? (
          <EmptyState />
        ) : (
          <div
            key="list"
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
            className="pt-2 pb-3"
          >
            {virtualizer.getVirtualItems().map((virtualRow: VirtualItem) => {
              const item = filteredHistory[virtualRow.index];
              return (
                <VirtualizedClipRow
                  key={virtualRow.key}
                  item={item}
                  index={virtualRow.index}
                  start={virtualRow.start}
                  isSelected={selectedIndex === virtualRow.index}
                  isCopied={copiedId === item.id}
                  searchQuery={searchQuery}
                  // 直接交给库的原生 measureElement 接管 ref 回调，省去内部手动 RAF 的性能开销与延迟
                  onMeasure={virtualizer.measureElement}
                />
              );
            })}
          </div>
        )}
      </div>
    </ClipItemProvider>
  );
}

