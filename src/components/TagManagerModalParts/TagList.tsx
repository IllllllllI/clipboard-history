import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Tag as TagIcon } from 'lucide-react';
import { Tag } from '../../types';
import { TagRow } from './TagRow';

interface TagListProps {
  dark: boolean;
  tags: Tag[];
  onEdit: (tag: Tag) => void;
  onDelete: (tag: Tag) => void;
}

export const TagList = React.memo(function TagList({
  dark,
  tags,
  onEdit,
  onDelete,
}: TagListProps) {
  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2 custom-scrollbar">
      <AnimatePresence mode="popLayout" initial={false}>
        {tags.length === 0 ? (
          <motion.div
            key="empty-state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center h-full w-full text-neutral-400 py-12"
          >
            <div className={`p-4 rounded-full mb-4 ${dark ? 'bg-neutral-800' : 'bg-neutral-100'}`}>
              <TagIcon className="w-10 h-10 opacity-50" />
            </div>
            <p className="text-sm font-medium">暂无标签</p>
            <p className="text-xs opacity-70 mt-1">点击上方“新建标签”创建第一个标签</p>
          </motion.div>
        ) : (
          tags
            .slice()
            .reverse()
            .map((tag) => (
              <div key={tag.id}>
                <TagRow tag={tag} dark={dark} onEdit={onEdit} onDelete={onDelete} />
              </div>
            ))
        )}
      </AnimatePresence>
    </div>
  );
});
