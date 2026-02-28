import React from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { Tag } from '../../types';
import { toTagStyle } from './constants';

interface TagRowProps {
  tag: Tag;
  dark: boolean;
  onEdit: (tag: Tag) => void;
  onDelete: (tag: Tag) => void;
}

export const TagRow = React.memo(function TagRow({
  tag,
  dark,
  onEdit,
  onDelete,
}: TagRowProps) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ opacity: { duration: 0.12 } }}
      className={`group relative rounded-2xl border transition-colors ${
        dark
          ? 'bg-neutral-800/30 border-neutral-700/60 hover:bg-neutral-800/70 hover:border-neutral-600'
          : 'bg-white border-neutral-200/90 hover:border-indigo-200 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between gap-3 py-2.5 px-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-semibold max-w-[280px]"
            style={toTagStyle(tag.color, dark)}
          >
            <div
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${!tag.color ? (dark ? 'bg-neutral-500' : 'bg-neutral-400') : ''}`}
              style={tag.color ? { backgroundColor: tag.color, boxShadow: `0 0 8px ${tag.color}55` } : {}}
            />
            <span className="truncate">{tag.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0">
          <button
            onClick={() => onEdit(tag)}
            className={`p-1.5 text-neutral-400 hover:text-indigo-500 rounded-md transition-colors ${dark ? 'hover:bg-indigo-500/10' : 'hover:bg-indigo-50'}`}
            title="编辑"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(tag)}
            className={`p-1.5 text-neutral-400 hover:text-red-500 rounded-md transition-colors ${dark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'}`}
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
});
