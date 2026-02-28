import React, { useMemo } from 'react';
import { Trash2, Copy, Check, Pin, ExternalLink, FolderOpen, Edit3, Star } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ClipItem, Tag } from '../../types';
import { decodeFileList } from '../../utils';
import { TauriService } from '../../services/tauri';
import { TagDropdown } from './TagDropdown';
import './styles/action-buttons.css';

interface ActionButtonsProps {
  item: ClipItem;
  isSelected: boolean;
  isFiles: boolean;
  isImage: boolean;
  darkMode: boolean;
  copiedId: number | null;
  tags: Tag[];
  onTogglePin: (item: ClipItem) => void;
  onToggleFavorite: (item: ClipItem) => void;
  onCopy: (item: ClipItem) => void;
  onRemove: (id: number) => void;
  onEdit: (item: ClipItem) => void;
  onAddTag: (itemId: number, tagId: number) => Promise<void>;
  onRemoveTag: (itemId: number, tagId: number) => Promise<void>;
}

/** 操作按钮栏 */
export const ActionButtons = React.memo(function ActionButtons({
  item,
  isSelected,
  isFiles,
  isImage,
  darkMode,
  copiedId,
  tags,
  onTogglePin,
  onToggleFavorite,
  onCopy,
  onRemove,
  onEdit,
  onAddTag,
  onRemoveTag,
}: ActionButtonsProps) {
  const files = useMemo(() => (isFiles ? decodeFileList(item.text) : []), [isFiles, item.text]);
  const firstFile = files[0] ?? null;
  const showSingleFileActions = isFiles && files.length === 1;

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
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              <Check className="clip-item-action-icon clip-item-action-icon-copy-ok" />
            </motion.div>
          ) : (
            <motion.div
              key="copy"
              initial={{ opacity: 0, scale: 0.5, rotate: 45 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              <Copy className="clip-item-action-icon" />
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* 文件列表专属操作 */}
      {showSingleFileActions && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (firstFile) TauriService.openFile(firstFile);
            }}
            className="clip-item-action-btn"
            title="打开文件"
          >
            <ExternalLink className="clip-item-action-icon" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (firstFile) TauriService.openFileLocation(firstFile);
            }}
            className="clip-item-action-btn"
            title="打开文件位置"
          >
            <FolderOpen className="clip-item-action-icon" />
          </button>
        </>
      )}

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

      {/* 标签 */}
      <TagDropdown
        item={item}
        tags={tags}
        darkMode={darkMode}
        onAddTag={onAddTag}
        onRemoveTag={onRemoveTag}
      />

      {/* 收藏 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(item);
        }}
        className="clip-item-action-btn"
        data-active={item.is_favorite ? 'true' : 'false'}
        data-variant="favorite"
        aria-pressed={Boolean(item.is_favorite)}
        title={item.is_favorite ? '取消收藏' : '收藏'}
      >
        <Star className="clip-item-action-icon" data-filled={item.is_favorite ? 'true' : 'false'} />
      </button>

      {/* 置顶 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(item);
        }}
        className="clip-item-action-btn"
        data-active={item.is_pinned ? 'true' : 'false'}
        data-variant="pinned"
        aria-pressed={Boolean(item.is_pinned)}
        title={item.is_pinned ? '取消置顶' : '置顶'}
      >
        <Pin className="clip-item-action-icon" data-filled={item.is_pinned ? 'true' : 'false'} />
      </button>

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
