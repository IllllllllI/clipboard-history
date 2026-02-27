import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Tag as TagIcon, Check } from 'lucide-react';
import { ClipItem, Tag } from '../../types';
import { hexToRgba } from '../../utils/color';
import { usePopoverPosition } from '../../hooks/usePopoverPosition';

/** 标签选择下拉菜单（Portal 实现） */
export const TagDropdown = React.memo(function TagDropdown({
  item,
  tags,
  darkMode,
  onAddTag,
  onRemoveTag,
}: {
  item: ClipItem;
  tags: Tag[];
  darkMode: boolean;
  onAddTag: (itemId: number, tagId: number) => Promise<void>;
  onRemoveTag: (itemId: number, tagId: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const { popoverRef, style } = usePopoverPosition(btnRef, open);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, popoverRef]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-all active:scale-90"
        title="添加标签"
      >
        <TagIcon className="w-3.5 h-3.5" />
      </button>

      {open &&
        createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -5 }}
              transition={{ duration: 0.1 }}
              ref={popoverRef}
              style={style}
              className="w-48 bg-white dark:bg-neutral-800 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-700 p-2 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-[10px] font-medium text-neutral-500 mb-1.5 px-1 flex justify-between items-center">
                <span>选择标签</span>
                <span className="text-[9px] opacity-60">{tags.length}</span>
              </div>
              <div className="max-h-36 overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
                {tags.length === 0 ? (
                  <div className="text-xs text-neutral-400 text-center py-2">暂无标签，请先创建</div>
                ) : (
                  tags.map((tag) => {
                    const hasTag = item.tags?.some((t) => t.id === tag.id);
                    const baseColor = tag.color || (darkMode ? '#525252' : '#a3a3a3');
                    const activeBg = tag.color
                      ? hexToRgba(tag.color, 0.15)
                      : darkMode
                        ? 'rgba(255,255,255,0.1)'
                        : 'rgba(0,0,0,0.05)';
                    const activeText = tag.color || 'inherit';

                    return (
                      <motion.button
                        key={tag.id}
                        whileHover={{ scale: 1.02, x: 2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hasTag) {
                            onRemoveTag(item.id, tag.id);
                          } else {
                            onAddTag(item.id, tag.id);
                          }
                        }}
                        className={`flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors ${
                          hasTag
                            ? ''
                            : 'hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                        }`}
                        style={hasTag ? { backgroundColor: activeBg, color: activeText } : {}}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-2 h-2 rounded-full ${!hasTag ? 'opacity-50' : ''}`}
                            style={{ backgroundColor: baseColor }}
                          />
                          <span className={hasTag ? 'font-medium' : ''}>{tag.name}</span>
                        </div>
                        {hasTag && <Check className="w-3 h-3" />}
                      </motion.button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
});
