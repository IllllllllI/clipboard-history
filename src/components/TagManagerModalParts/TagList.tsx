import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Tag as TagIcon } from 'lucide-react';
import { Tag } from '../../types';
import { TagRow } from './TagRow';
import './styles/list-row.css';

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
    <div className="tag-manager-list custom-scrollbar" data-theme={dark ? 'dark' : 'light'}>
      <AnimatePresence mode="popLayout" initial={false}>
        {tags.length === 0 ? (
          <motion.div
            key="empty-state"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="tag-manager-empty-state"
          >
            <motion.div 
              className="tag-manager-empty-state-icon-bg"
              data-theme={dark ? 'dark' : 'light'}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <TagIcon className="tag-manager-empty-icon" />
            </motion.div>
            <p className="tag-manager-empty-title">暂无标签</p>
            <p className="tag-manager-empty-desc">点击上方“新建标签”创建第一个标签</p>
          </motion.div>
        ) : (
          tags
            .slice()
            .reverse()
            .map((tag, index) => (
              <motion.div 
                key={tag.id}
                layout="position"
                transition={{
                  layout: { type: "spring", bounce: 0.15, duration: 0.5 }
                }}
              >
                <TagRow
                  tag={tag}
                  dark={dark}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  index={index}
                />
              </motion.div>
            ))
        )}
      </AnimatePresence>
    </div>
  );
});
