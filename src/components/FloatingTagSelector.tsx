/**
 * 现代水平流式标签选择器
 *
 * 采用现代化的水平铺开(flex-wrap)布局，悬浮显示为卡片/胶囊风格。
 * 针对鼠标交互进行了优化：增大了点击热区，强化了悬停状态和鼠标反馈，
 * 同时依然保持基础的键盘导航功能。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Tag as TagIcon, Check, X, Search, Plus } from 'lucide-react';
import type { ClipItem, Tag as AppTag } from '../types';
import { useAppContext } from '../contexts/AppContext';

import './styles/floating-tag-selector.css';

/* ── 动画 variants ── */

const OVERLAY_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15, ease: 'easeOut' as const } },
  exit: { opacity: 0, transition: { duration: 0.1, ease: 'easeIn' as const } },
};

const PANEL_VARIANTS = {
  hidden: { opacity: 0, scale: 0.96, y: 15 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 350,
      damping: 25,
      mass: 0.6,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: -5,
    transition: { duration: 0.1, ease: 'easeIn' as const },
  },
};

const TAG_ITEM_VARIANTS = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.15, ease: 'easeOut' as const },
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    transition: { duration: 0.1, ease: 'easeIn' as const },
  },
};

/* ── 类型 ── */

interface FloatingTagSelectorProps {
  item: ClipItem;
  tags: AppTag[];
  darkMode: boolean;
  onAddTag: (itemId: number, tagId: number) => Promise<void>;
  onRemoveTag: (itemId: number, tagId: number) => Promise<void>;
  onClose: () => void;
}

/* ── 组件 ── */

export const FloatingTagSelector = React.memo(function FloatingTagSelector({
  item,
  tags,
  darkMode,
  onAddTag,
  onRemoveTag,
  onClose,
}: FloatingTagSelectorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const theme = darkMode ? 'dark' : 'light';

  const { handleCreateTag } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [pendingCreateTag, setPendingCreateTag] = useState<string | null>(null);

  /* 使用本地状态实现乐观更新，使界面瞬间同步 */
  const [localTagIds, setLocalTagIds] = useState<Set<number>>(
    () => new Set(item.tags?.map((t) => t.id) ?? [])
  );

  // 当外部 item 同步过来时，更新本地快照
  useEffect(() => {
    setLocalTagIds(new Set(item.tags?.map((t) => t.id) ?? []));
  }, [item.tags]);

  const toggleTag = useCallback(
    async (tagId: number, forceAdd?: boolean) => {
      const isAdding = forceAdd !== undefined ? forceAdd : !localTagIds.has(tagId);
      if (forceAdd !== undefined && localTagIds.has(tagId) === forceAdd) return;
      
      // 1. 乐观更新当前界面状态瞬间反馈
      setLocalTagIds((prev) => {
        const next = new Set(prev);
        if (isAdding) next.add(tagId);
        else next.delete(tagId);
        return next;
      });

      // 2. 真实提交给后端，触发全局列表同步
      try {
        if (isAdding) {
          await onAddTag(item.id, tagId);
        } else {
          await onRemoveTag(item.id, tagId);
        }
      } catch (e) {
        console.error("Failed to toggle tag", e);
        // 如果后端失败，则回滚当前界面
        setLocalTagIds(new Set(item.tags?.map((t) => t.id) ?? []));
      }
    },
    [item.id, item.tags, localTagIds, onAddTag, onRemoveTag],
  );

  // 同步新创建的标签到本地选择
  useEffect(() => {
    if (pendingCreateTag) {
      const lowerQuery = pendingCreateTag.toLowerCase();
      const newlyCreated = tags.find(t => t.name.toLowerCase() === lowerQuery);
      if (newlyCreated) {
        void toggleTag(newlyCreated.id, true);
        setPendingCreateTag(null);
      }
    }
  }, [tags, pendingCreateTag, toggleTag]);

  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return tags;
    const lowerQuery = searchQuery.trim().toLowerCase();
    return tags.filter((t) => t.name.toLowerCase().includes(lowerQuery));
  }, [tags, searchQuery]);

  // 重置 buttonRefs 大小，避免内存泄漏
  useEffect(() => {
    buttonRefs.current = buttonRefs.current.slice(0, filteredTags.length + 1);
  }, [filteredTags]);

  const exactMatchExists = useMemo(() => {
    const lowerQ = searchQuery.trim().toLowerCase();
    return lowerQ !== '' && tags.some((t) => t.name.toLowerCase() === lowerQ);
  }, [tags, searchQuery]);

  // 内部退出机制：先触发动画，再销毁
  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleCreateAndAdd = useCallback(async () => {
    const newName = searchQuery.trim();
    if (!newName) return;
    if (exactMatchExists) {
      // 若存在精确匹配，敲回车时切换该标签而非新建
      const exact = tags.find((t) => t.name.toLowerCase() === newName.toLowerCase());
      if (exact) void toggleTag(exact.id);
      setSearchQuery('');
      return;
    }

    setPendingCreateTag(newName);
    try {
      await handleCreateTag(newName, null);
      setSearchQuery('');
    } catch (e) {
      console.error('Failed to create tag', e);
      setPendingCreateTag(null);
    }
  }, [searchQuery, exactMatchExists, handleCreateTag, tags, toggleTag]);

  // 自动聚焦
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, []);

  // Escape 关闭绑定
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [handleClose]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) handleClose();
    },
    [handleClose],
  );

  const selectedCount = localTagIds.size;
  const previewText = useMemo(() => {
    const text = item.text ?? '';
    return text.length > 50 ? text.slice(0, 50) + '…' : text;
  }, [item.text]);

  return createPortal(
    <AnimatePresence onExitComplete={onClose}>
      {isOpen && (
        <motion.div
          key="fts-overlay"
          className="fts-overlay-modern"
          data-theme={theme}
          variants={OVERLAY_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={handleOverlayClick}
          role="dialog"
          aria-modal="true"
          aria-labelledby="fts-context-hint"
        >
          <motion.div
            className="fts-panel-modern"
            data-theme={theme}
            variants={PANEL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {/* ── 顶部 Header / 搜索栏 ── */}
            <div className="fts-header-modern">
              <div className="fts-search-box-modern">
                <Search size={20} className="fts-search-icon-modern" aria-hidden="true" />
                <input
                  ref={inputRef}
                  className="fts-search-input-modern"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateAndAdd();
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      buttonRefs.current[0]?.focus();
                    }
                  }}
                  placeholder="搜索或新建标签..."
                  aria-label="搜索或新建标签"
                />
                <div className="fts-header-actions">
                  {selectedCount > 0 && (
                    <span className="fts-selected-badge-modern" aria-live="polite">已选 {selectedCount}</span>
                  )}
                  <button className="fts-close-btn-modern" onClick={handleClose} aria-label="关闭选择器">
                    <X size={18} strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>

            {/* ── 上下文提示 ── */}
            {previewText && (
              <div id="fts-context-hint" className="fts-context-hint-modern">
                 为项 <span className="fts-context-text">"{previewText}"</span> 编辑标签
              </div>
            )}

            {/* ── 水平流式列表区 ── */}
            <div 
              className="fts-cloud-wrapper" 
              role="group" 
              aria-label="标签列表"
            >
              {/* 新建标签大按钮（若搜索词不存在时显示） */}
              {searchQuery.trim() !== '' && !exactMatchExists && (
                <motion.button
                  layout
                  className="fts-create-chip-modern"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCreateAndAdd();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleCreateAndAdd();
                    }
                  }}
                >
                  <Plus size={16} aria-hidden="true" />
                  <span>新建 "{searchQuery.trim()}"</span>
                </motion.button>
              )}

              {/* 标签云 */}
              <AnimatePresence>
                {filteredTags.map((tag, index) => {
                  const hasTag = localTagIds.has(tag.id);
                  const baseColor = tag.color || (darkMode ? '#737373' : '#a3a3a3');
                  
                  // 使用 CSS 原生 color-mix 提供平滑的带有透明度的颜色方案
                  // 此方式不依赖外部 JS 的颜色解析工具，内存及执行效率更优
                  const bgColor = hasTag
                    ? baseColor
                    : darkMode ? 'rgba(255, 255, 255, 0.05)' : 'white';
                  
                  const borderColor = hasTag ? baseColor : `color-mix(in srgb, ${baseColor} 40%, transparent)`;
                  const textColor = hasTag ? '#fff' : 'inherit';

                  return (
                    <motion.button
                      layout
                      key={tag.id}
                      ref={(el) => { buttonRefs.current[index] = el; }}
                      className="fts-tag-chip-modern"
                      data-selected={hasTag}
                      variants={TAG_ITEM_VARIANTS}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      role="checkbox"
                      aria-checked={hasTag}
                      aria-label={`标签 ${tag.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleTag(tag.id);
                      }}
                      onKeyDown={(e) => {
                        // 支持基础十字方向键导航
                        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const nextIdx = (index + 1) % filteredTags.length;
                          buttonRefs.current[nextIdx]?.focus();
                        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                          e.preventDefault();
                          const prevIdx = (index - 1 + filteredTags.length) % filteredTags.length;
                          buttonRefs.current[prevIdx]?.focus();
                        } else if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          void toggleTag(tag.id);
                        }
                      }}
                      style={{
                        backgroundColor: bgColor,
                        borderColor: borderColor,
                        color: textColor,
                      }}
                    >
                      {!hasTag && (
                        <span className="fts-tag-chip-dot" style={{ backgroundColor: baseColor }} aria-hidden="true" />
                      )}
                      <span className="fts-tag-chip-name">{tag.name}</span>
                      {hasTag && (
                        <span className="fts-tag-chip-check" aria-hidden="true">
                           <Check size={14} strokeWidth={3} />
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </AnimatePresence>

              {filteredTags.length === 0 && !searchQuery.trim() && (
                <div className="fts-empty-modern" role="status">
                  <TagIcon size={32} className="fts-empty-icon-modern" strokeWidth={1.5} aria-hidden="true" />
                  <span className="fts-empty-text-modern">没有标签，输入名称可以快速创建</span>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
});
