import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Tag as TagIcon, Check } from 'lucide-react';
import { ClipItem, Tag } from '../../types';
import { hexToRgba } from '../../utils/color';
import { usePopoverPosition } from '../../hooks/usePopoverPosition';

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

  const itemTagIdSet = useMemo(
    () => new Set(item.tags?.map((tag) => tag.id) ?? []),
    [item.tags]
  );

  const handleToggleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((value) => !value);
  }, []);

  const handleToggleTag = useCallback(
    async (e: React.MouseEvent, tagId: number, hasTag: boolean) => {
      e.stopPropagation();
      if (hasTag) {
        await onRemoveTag(item.id, tagId);
        return;
      }
      await onAddTag(item.id, tagId);
    },
    [item.id, onAddTag, onRemoveTag]
  );

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

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.14,
        staggerChildren: 0.02,
        delayChildren: 0.02,
      },
    },
    exit: {
      opacity: 0,
      transition: { duration: 0.12, ease: 'easeIn' as const },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: 0.12 },
    },
  };

  const selectedCount = itemTagIdSet.size;

  return (
    <>
      <button
        ref={btnRef}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={handleToggleOpen}
        className={`inline-flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-colors duration-200 ${
          open 
            ? 'bg-indigo-500/10 text-indigo-500 dark:bg-indigo-500/20 dark:text-indigo-400' 
            : 'hover:bg-black/10 dark:hover:bg-white/10 text-neutral-500'
        }`}
        title="添加标签"
      >
        <TagIcon className="w-3.5 h-3.5" />
        {selectedCount > 0 && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-500 dark:text-indigo-300">
            {selectedCount}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <AnimatePresence mode="wait">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              ref={popoverRef}
              style={style}
              className="w-60 bg-white/95 dark:bg-neutral-800/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-neutral-200/60 dark:border-neutral-700/60 p-2.5 overflow-hidden z-50 ring-1 ring-black/5 dark:ring-white/5"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <div className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 mb-2.5 px-2 pt-1 flex justify-between items-center uppercase tracking-wider">
                <span>标签选择</span>
                <span className="bg-neutral-100 dark:bg-neutral-700 px-1.5 py-0.5 rounded-md text-[9px] opacity-80">{selectedCount}/{tags.length}</span>
              </div>
              <div className="max-h-56 overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-1">
                {tags.length === 0 ? (
                  <div className="text-xs text-neutral-400 text-center py-4 flex flex-col items-center gap-2">
                    <TagIcon className="w-6 h-6 opacity-30" />
                    <span>暂无标签，请先创建</span>
                  </div>
                ) : (
                  tags.map((tag) => {
                    const hasTag = itemTagIdSet.has(tag.id);
                    const baseColor = tag.color || (darkMode ? '#737373' : '#a3a3a3');
                    const activeBg = tag.color
                      ? hexToRgba(tag.color, darkMode ? 0.2 : 0.15)
                      : darkMode
                        ? 'rgba(255,255,255,0.1)'
                        : 'rgba(0,0,0,0.05)';
                    const activeText = tag.color || 'inherit';

                    return (
                      <motion.button
                        key={tag.id}
                        variants={itemVariants}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          void handleToggleTag(e, tag.id, hasTag);
                        }}
                        className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs border transition-all duration-200 ${
                          hasTag
                            ? 'shadow-sm border-transparent'
                            : 'border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-700/50 text-neutral-700 dark:text-neutral-300'
                        }`}
                        style={hasTag ? { backgroundColor: activeBg, color: activeText, borderColor: `${tag.color || baseColor}66` } : {}}
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <div
                            className={`w-2.5 h-2.5 rounded-full shadow-sm shrink-0 transition-all duration-300 ${!hasTag ? 'opacity-40 scale-75' : 'scale-100'}`}
                            style={{ backgroundColor: baseColor }}
                          />
                          <span className={`truncate ${hasTag ? 'font-semibold' : ''}`}>{tag.name}</span>
                        </div>
                        {hasTag && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.12 }}
                          >
                            <Check className="w-3.5 h-3.5" strokeWidth={3} />
                          </motion.div>
                        )}
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
