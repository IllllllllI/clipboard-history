import React from 'react';
import { motion } from 'motion/react';
import { Database as DatabaseIcon } from 'lucide-react';

export const EmptyState = React.memo(function EmptyState() {
  return (
    <motion.div
      key="empty-state"
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center h-full min-h-[260px] px-4 py-8 text-neutral-500"
    >
      <div className="w-full max-w-md flex flex-col items-center justify-center px-8 py-10 border border-dashed border-neutral-300/90 dark:border-neutral-700 rounded-2xl bg-white/70 dark:bg-neutral-800/55 shadow-sm backdrop-blur-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-700/60">
          <DatabaseIcon className="w-6 h-6 opacity-45" />
        </div>
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 text-center">剪贴板空空如也 ✨</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2 text-center leading-5">尝试复制一些文本，或将文件拖拽到这里</p>
      </div>
    </motion.div>
  );
});
