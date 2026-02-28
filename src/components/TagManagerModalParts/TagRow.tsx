import React from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { Tag } from '../../types';
import { toTagStyle } from './constants';
import './styles/list-row.css';

interface TagRowProps {
  tag: Tag;
  dark: boolean;
  onEdit: (tag: Tag) => void;
  onDelete: (tag: Tag) => void;
  index: number;
}

export const TagRow = React.memo(function TagRow({
  tag,
  dark,
  onEdit,
  onDelete,
  index,
}: TagRowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      transition={{
        opacity: { duration: 0.2 },
        default: { type: 'spring', stiffness: 450, damping: 30, delay: index * 0.04 }
      }}
      className="tag-manager-row"
      data-theme={dark ? 'dark' : 'light'}
    >
      <div className="tag-manager-row-inner">
        <div className="tag-manager-row-main">
          <div
            className="tag-manager-row-chip"
            style={toTagStyle(tag.color, dark)}
          >
            <div
              className={`tag-manager-row-dot ${!tag.color ? 'tag-manager-row-dot-default' : ''}`}
              data-theme={dark ? 'dark' : 'light'}
              style={tag.color ? { backgroundColor: tag.color, boxShadow: `0 0 8px ${tag.color}55` } : {}}
            />
            <span className="tag-manager-row-name">{tag.name}</span>
          </div>
        </div>

        <div className="tag-manager-row-actions">
          <button
            onClick={() => onEdit(tag)}
            className="tag-manager-row-action-btn-edit"
            data-theme={dark ? 'dark' : 'light'}
            title="编辑"
          >
            <Edit2 className="tag-manager-icon-14" />
          </button>
          <button
            onClick={() => onDelete(tag)}
            className="tag-manager-row-action-btn-delete"
            data-theme={dark ? 'dark' : 'light'}
            title="删除"
          >
            <Trash2 className="tag-manager-icon-14" />
          </button>
        </div>
      </div>
    </motion.div>
  );
});
