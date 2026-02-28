import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Tag as TagIcon, Check } from 'lucide-react';
import { ClipItem, Tag } from '../../types';
import { hexToRgba } from '../../utils/color';
import { usePopoverPosition } from '../../hooks/usePopoverPosition';
import './styles/tag-dropdown.css';

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
        className={`clip-item-tag-dropdown-trigger ${
          open 
            ? 'clip-item-tag-dropdown-trigger-open' 
            : ''
        }`}
        title="添加标签"
      >
        <TagIcon className="clip-item-tag-dropdown-trigger-icon" />
        {selectedCount > 0 && (
          <span className="clip-item-tag-dropdown-trigger-count">
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
              className="clip-item-tag-dropdown-popover"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <div className="clip-item-tag-dropdown-header">
                <span>标签选择</span>
                <span className="clip-item-tag-dropdown-header-badge">{selectedCount}/{tags.length}</span>
              </div>
              <div className="clip-item-tag-dropdown-list custom-scrollbar">
                {tags.length === 0 ? (
                  <div className="clip-item-tag-dropdown-empty">
                    <TagIcon className="clip-item-tag-dropdown-empty-icon" />
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
                        className={`clip-item-tag-dropdown-item ${
                          hasTag
                            ? 'clip-item-tag-dropdown-item-active'
                            : ''
                        }`}
                        style={hasTag ? { backgroundColor: activeBg, color: activeText, borderColor: `${tag.color || baseColor}66` } : {}}
                      >
                        <div className="clip-item-tag-dropdown-item-main">
                          <div
                            className={`clip-item-tag-dropdown-item-dot ${!hasTag ? 'clip-item-tag-dropdown-item-dot-inactive' : ''}`}
                            style={{ backgroundColor: baseColor }}
                          />
                          <span className={`clip-item-tag-dropdown-item-name ${hasTag ? 'clip-item-tag-dropdown-item-name-active' : ''}`}>{tag.name}</span>
                        </div>
                        {hasTag && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.12 }}
                          >
                            <Check className="clip-item-tag-dropdown-item-check" strokeWidth={3} />
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
