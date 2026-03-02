import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Tag as TagIcon, Check } from 'lucide-react';
import { ClipItem, Tag } from '../../types';
import { hexToRgba } from '../../utils/color';
import { usePopoverPosition } from '../../hooks/usePopoverPosition';
import './styles/tag-dropdown.css';

let lastUsedTagId: number | null = null;
let iconQuickHintShown = false;
const ICON_QUICK_HINT_DELAY_MS = 550;

interface TagDropdownProps {
  item: ClipItem;
  tags: Tag[];
  darkMode: boolean;
  onAddTag: (itemId: number, tagId: number) => Promise<void>;
  onRemoveTag: (itemId: number, tagId: number) => Promise<void>;
  triggerClassName?: string;
  triggerContent?: React.ReactNode;
  triggerTitle?: string;
  showSelectedCount?: boolean;
  triggerVariant?: 'default' | 'icon';
  triggerSelected?: boolean;
}

export const TagDropdown = React.memo(function TagDropdown({
  item,
  tags,
  darkMode,
  onAddTag,
  onRemoveTag,
  triggerClassName,
  triggerContent,
  triggerTitle,
  showSelectedCount = true,
  triggerVariant = 'default',
  triggerSelected,
}: TagDropdownProps) {
  const [open, setOpen] = useState(false);
  const [showQuickHint, setShowQuickHint] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const quickHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { popoverRef, style } = usePopoverPosition(btnRef, open);

  const itemTagIdSet = useMemo(
    () => new Set(item.tags?.map((tag) => tag.id) ?? []),
    [item.tags]
  );

  const toggleTagById = useCallback(
    async (tagId: number) => {
      const hasTag = itemTagIdSet.has(tagId);
      if (hasTag) {
        await onRemoveTag(item.id, tagId);
      } else {
        await onAddTag(item.id, tagId);
      }
      lastUsedTagId = tagId;
    },
    [item.id, itemTagIdSet, onAddTag, onRemoveTag],
  );

  const handleToggleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowQuickHint(false);
    if (e.altKey) {
      setOpen(false);
      const fallbackTagId = tags[0]?.id;
      const quickTagId = lastUsedTagId ?? fallbackTagId;
      if (quickTagId !== undefined) {
        void toggleTagById(quickTagId);
      }
      return;
    }
    setOpen((value) => !value);
  }, [tags, toggleTagById]);

  const revealQuickHint = useCallback(() => {
    if (triggerVariant !== 'icon' || iconQuickHintShown) return;
    if (quickHintTimerRef.current) {
      clearTimeout(quickHintTimerRef.current);
    }
    quickHintTimerRef.current = setTimeout(() => {
      iconQuickHintShown = true;
      setShowQuickHint(true);
      quickHintTimerRef.current = null;
    }, ICON_QUICK_HINT_DELAY_MS);
  }, [triggerVariant]);

  const hideQuickHint = useCallback(() => {
    if (quickHintTimerRef.current) {
      clearTimeout(quickHintTimerRef.current);
      quickHintTimerRef.current = null;
    }
    setShowQuickHint(false);
  }, []);

  useEffect(() => {
    return () => {
      if (quickHintTimerRef.current) {
        clearTimeout(quickHintTimerRef.current);
        quickHintTimerRef.current = null;
      }
    };
  }, []);

  const handleToggleTag = useCallback(
    async (e: React.MouseEvent, tagId: number, hasTag: boolean) => {
      e.stopPropagation();
      if (hasTag) {
        await onRemoveTag(item.id, tagId);
        lastUsedTagId = tagId;
        return;
      }
      await onAddTag(item.id, tagId);
      lastUsedTagId = tagId;
    },
    [item.id, onAddTag, onRemoveTag]
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;

      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        btnRef.current &&
        !btnRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [open, popoverRef]);

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.96, y: -6, filter: 'blur(2px)' },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: {
        type: 'spring' as const,
        stiffness: 420,
        damping: 32,
        mass: 0.6,
        staggerChildren: 0.02,
        delayChildren: 0.02,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.97,
      y: -4,
      filter: 'blur(1px)',
      transition: {
        duration: 0.14,
        ease: 'easeInOut' as const,
        when: 'afterChildren' as const,
        staggerChildren: 0.015,
        staggerDirection: -1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 4 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.14, ease: 'easeOut' as const },
    },
    exit: {
      opacity: 0,
      y: 3,
      transition: { duration: 0.1, ease: 'easeIn' as const },
    },
  };

  const selectedCount = itemTagIdSet.size;
  const triggerLabel = triggerTitle ?? '添加标签（Alt+点击快速切换最近标签）';

  return (
    <>
      <button
        ref={btnRef}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={handleToggleOpen}
        onMouseEnter={revealQuickHint}
        onFocus={revealQuickHint}
        onMouseLeave={hideQuickHint}
        onBlur={hideQuickHint}
        className={[
          'clip-item-tag-dropdown-trigger',
          triggerClassName ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-open={open ? 'true' : 'false'}
        data-theme={darkMode ? 'dark' : 'light'}
        data-variant={triggerVariant}
        data-selected={triggerSelected === undefined ? undefined : triggerSelected ? 'true' : 'false'}
        aria-expanded={open}
        aria-label={triggerLabel}
        title={triggerVariant === 'icon' ? undefined : triggerLabel}
      >
        {triggerContent ?? <TagIcon className="clip-item-tag-dropdown-trigger-icon" />}
        {showSelectedCount && selectedCount > 0 && (
          <span
            className="clip-item-tag-dropdown-trigger-count"
            data-theme={darkMode ? 'dark' : 'light'}
          >
            {selectedCount}
          </span>
        )}
        <AnimatePresence>
          {showQuickHint && (
            <motion.span
              className="clip-item-tag-dropdown-quick-hint"
              data-theme={darkMode ? 'dark' : 'light'}
              initial={{ opacity: 0, x: -4, y: '-50%' }}
              animate={{ opacity: 1, x: 0, y: '-50%' }}
              exit={{ opacity: 0, x: -4, y: '-50%' }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
            >
              点击管理标签 · Alt+点击快速切换
            </motion.span>
          )}
        </AnimatePresence>
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
              data-theme={darkMode ? 'dark' : 'light'}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <div className="clip-item-tag-dropdown-header" data-theme={darkMode ? 'dark' : 'light'}>
                <span>标签选择</span>
                <span
                  className="clip-item-tag-dropdown-header-badge"
                  data-theme={darkMode ? 'dark' : 'light'}
                >
                  {selectedCount}/{tags.length}
                </span>
              </div>
              <div className="clip-item-tag-dropdown-list custom-scrollbar">
                {tags.length === 0 ? (
                  <div className="clip-item-tag-dropdown-empty" data-theme={darkMode ? 'dark' : 'light'}>
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
                        className="clip-item-tag-dropdown-item"
                        data-active={hasTag ? 'true' : 'false'}
                        data-theme={darkMode ? 'dark' : 'light'}
                        style={hasTag ? { backgroundColor: activeBg, color: activeText, borderColor: `${tag.color || baseColor}66` } : {}}
                      >
                        <div className="clip-item-tag-dropdown-item-main">
                          <div
                            className="clip-item-tag-dropdown-item-dot"
                            data-inactive={!hasTag ? 'true' : 'false'}
                            style={{ backgroundColor: baseColor }}
                          />
                          <span className="clip-item-tag-dropdown-item-name" data-active={hasTag ? 'true' : 'false'}>{tag.name}</span>
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

export default TagDropdown;
