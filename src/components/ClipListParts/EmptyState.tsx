import React from 'react';
import { motion } from 'motion/react';
import { Database as DatabaseIcon } from 'lucide-react';

export const EmptyState = React.memo(function EmptyState() {
  return (
    <motion.div
      key="empty-state"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center justify-center h-full text-neutral-500"
    >
      <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-2xl bg-white/50 dark:bg-neutral-800/50 backdrop-blur-sm">
        <DatabaseIcon className="w-12 h-12 opacity-20 mb-4" />
        <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">剪贴板空空如也 ✨</p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-2">尝试复制一些文本，或将文件拖拽到这里</p>
      </div>
    </motion.div>
  );
});
