import React from 'react';
import { Trash2, Copy, Check, Edit3 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ClipItem } from '../../../types';
import './styles/action-buttons.css';

const COPY_ICON_SPRING = { type: 'spring' as const, stiffness: 500, damping: 30 };

interface ActionButtonsProps {
  item: ClipItem;
  isSelected: boolean;
  isFiles: boolean;
  isImage: boolean;
  darkMode: boolean;
  copiedId: number | null;
  onCopy: (item: ClipItem) => void;
  onRemove: (id: number) => void;
  onEdit: (item: ClipItem) => void;
}

/** 操作按钮栏 */
export const ActionButtons = React.memo(function ActionButtons({
  item,
  isSelected,
  isFiles,
  isImage,
  darkMode,
  copiedId,
  onCopy,
  onRemove,
  onEdit,
}: ActionButtonsProps) {
  const actionsClass = [
    'clip-item-actions',
    isSelected ? 'clip-item-actions-visible' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      className={actionsClass}
      data-theme={darkMode ? 'dark' : 'light'}
    >
      {/* 复制 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCopy(item);
        }}
        className="clip-item-action-btn"
        title="复制"
      >
        <AnimatePresence mode="wait" initial={false}>
          {copiedId === item.id ? (
            <motion.div
              key="copied"
              initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={COPY_ICON_SPRING}
            >
              <Check className="clip-item-action-icon clip-item-action-icon-copy-ok" />
            </motion.div>
          ) : (
            <motion.div
              key="copy"
              initial={{ opacity: 0, scale: 0.5, rotate: 45 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={COPY_ICON_SPRING}
            >
              <Copy className="clip-item-action-icon" />
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* 文本编辑 */}
      {!isFiles && !isImage && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(item);
          }}
          className="clip-item-action-btn"
          title="编辑内容"
        >
          <Edit3 className="clip-item-action-icon" />
        </button>
      )}

      {/* 删除 */}
      <button
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(item.id);
        }}
        className="clip-item-action-btn clip-item-action-btn-delete"
        title="删除"
      >
        <Trash2 className="clip-item-action-icon" />
      </button>
    </div>
  );
});
