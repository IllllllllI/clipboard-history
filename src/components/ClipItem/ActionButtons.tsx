import React from 'react';
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
  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      className={`clip-item-actions ${isSelected ? 'clip-item-actions-visible' : ''}`}
    >
      {/* 文件列表专属操作 */}
      {isFiles && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const files = decodeFileList(item.text);
              if (files.length > 0) TauriService.openFile(files[0]);
            }}
            className={`clip-item-action-btn ${darkMode ? 'clip-item-action-btn-dark' : ''}`}
            title="打开文件"
          >
            <ExternalLink className="clip-item-action-icon" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const files = decodeFileList(item.text);
              if (files.length > 0) TauriService.openFileLocation(files[0]);
            }}
            className={`clip-item-action-btn ${darkMode ? 'clip-item-action-btn-dark' : ''}`}
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
          className={`clip-item-action-btn ${darkMode ? 'clip-item-action-btn-dark' : ''}`}
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
        className={`clip-item-action-btn ${
          item.is_favorite
            ? `clip-item-action-btn-favorite ${darkMode ? 'clip-item-action-btn-favorite-dark' : ''}`
            : darkMode
              ? 'clip-item-action-btn-dark'
              : ''
        }`}
        title={item.is_favorite ? '取消收藏' : '收藏'}
      >
        <Star className={`clip-item-action-icon ${item.is_favorite ? 'clip-item-action-icon-fill' : ''}`} />
      </button>

      {/* 置顶 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(item);
        }}
        className={`clip-item-action-btn ${
          item.is_pinned
            ? `clip-item-action-btn-pinned ${darkMode ? 'clip-item-action-btn-pinned-dark' : ''}`
            : darkMode
              ? 'clip-item-action-btn-dark'
              : ''
        }`}
        title={item.is_pinned ? '取消置顶' : '置顶'}
      >
        <Pin className={`clip-item-action-icon ${item.is_pinned ? 'clip-item-action-icon-fill' : ''}`} />
      </button>

      {/* 复制 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCopy(item);
        }}
        className={`clip-item-action-btn ${darkMode ? 'clip-item-action-btn-dark' : ''}`}
        title="复制"
      >
        <AnimatePresence mode="wait" initial={false}>
          {copiedId === item.id ? (
            <motion.div
              key="copied"
              initial={{ opacity: 0, scale: 0.6, y: 2 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6, y: -2 }}
              transition={{ duration: 0.15 }}
            >
              <Check className={`clip-item-action-icon clip-item-action-icon-copy-ok ${darkMode ? 'clip-item-action-icon-copy-ok-dark' : ''}`} />
            </motion.div>
          ) : (
            <motion.div
              key="copy"
              initial={{ opacity: 0, scale: 0.6, y: 2 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6, y: -2 }}
              transition={{ duration: 0.15 }}
            >
              <Copy className="clip-item-action-icon" />
            </motion.div>
          )}
        </AnimatePresence>
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
