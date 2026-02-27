import React from 'react';
import { Trash2, Copy, Check, Pin, ExternalLink, FolderOpen, Edit3, Star } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ClipItem, Tag } from '../../types';
import { decodeFileList } from '../../utils';
import { TauriService } from '../../services/tauri';
import { TagDropdown } from './TagDropdown';

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
      className={`flex items-center gap-0.5 mt-auto ${
        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      } transition-opacity duration-150`}
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
            className="p-1.5 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 transition-all duration-150 active:scale-95"
            title="打开文件"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const files = decodeFileList(item.text);
              if (files.length > 0) TauriService.openFileLocation(files[0]);
            }}
            className="p-1.5 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 transition-all duration-150 active:scale-95"
            title="打开文件位置"
          >
            <FolderOpen className="w-3.5 h-3.5" />
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
          className="p-1.5 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 transition-all duration-150 active:scale-95"
          title="编辑内容"
        >
          <Edit3 className="w-3.5 h-3.5" />
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
        className={`p-1.5 rounded-xl transition-all duration-150 active:scale-95 ${
          item.is_favorite
            ? 'text-amber-500 bg-amber-50 dark:bg-amber-500/10'
            : 'hover:bg-black/10 dark:hover:bg-white/10'
        }`}
        title={item.is_favorite ? '取消收藏' : '收藏'}
      >
        <Star className={`w-3.5 h-3.5 ${item.is_favorite ? 'fill-current' : ''}`} />
      </button>

      {/* 置顶 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(item);
        }}
        className={`p-1.5 rounded-xl transition-all duration-150 active:scale-95 ${
          item.is_pinned
            ? 'text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
            : 'hover:bg-black/10 dark:hover:bg-white/10'
        }`}
        title={item.is_pinned ? '取消置顶' : '置顶'}
      >
        <Pin className={`w-3.5 h-3.5 ${item.is_pinned ? 'fill-current' : ''}`} />
      </button>

      {/* 复制 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCopy(item);
        }}
        className="p-1.5 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 transition-all duration-150 active:scale-95"
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
              <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-300" />
            </motion.div>
          ) : (
            <motion.div
              key="copy"
              initial={{ opacity: 0, scale: 0.6, y: 2 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6, y: -2 }}
              transition={{ duration: 0.15 }}
            >
              <Copy className="w-3.5 h-3.5" />
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* 删除 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(item.id);
        }}
        className="p-1.5 rounded-xl hover:bg-red-500/10 hover:text-red-500 transition-all duration-150 active:scale-95"
        title="删除"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});
