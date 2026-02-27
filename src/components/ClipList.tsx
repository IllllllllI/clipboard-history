import React, { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion } from 'motion/react';
import { Database as DatabaseIcon } from 'lucide-react';
import { ClipItemComponent } from './ClipItem';
import { useAppContext } from '../contexts/AppContext';
import { KEYBOARD_NAV_SCROLL_EVENT } from '../hooks/useKeyboardNavigation';

/**
 * 剪贴板历史列表容器（虚拟滚动）
 *
 * 使用 @tanstack/react-virtual 实现虚拟化，
 * 仅渲染可视区域内的条目，支持 500 条以上列表流畅滚动。
 */
export function ClipList() {
  const { filteredHistory } = useAppContext();
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: filteredHistory.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // 预估行高（px），实际高度由 measureElement 动态测量
    overscan: 5,
    getItemKey: (index) => filteredHistory[index].id, // 用稳定 ID 作为键，避免删除项后缓存高度错位
  });

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
      className="flex-1 overflow-y-auto custom-scrollbar relative bg-neutral-50/50 dark:bg-neutral-900/50"
    >
      {filteredHistory.length === 0 ? (
        <motion.div
          key="empty-state"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col items-center justify-center h-full text-neutral-500"
        >
          <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-2xl bg-white/50 dark:bg-neutral-800/50 backdrop-blur-sm">
            <DatabaseIcon className="w-12 h-12 opacity-20 mb-4" />
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">剪贴板空空如也 ✨</p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-2">尝试复制一些文本，或将文件拖拽到这里</p>
          </div>
        </motion.div>
      ) : (
        <div
          key="list"
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
          className="py-3"
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = filteredHistory[virtualRow.index];
            return (
              <div
                key={item.id}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <ClipItemComponent item={item} index={virtualRow.index} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
