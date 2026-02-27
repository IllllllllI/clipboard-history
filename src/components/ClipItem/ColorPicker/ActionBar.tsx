import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ActionBarProps {
  hex: string;
  onConfirm: (color: string) => void;
  onCopy: (color: string) => void;
}

/** 底部操作栏：复制 & 确认 */
export function ActionBar({ hex, onConfirm, onCopy }: ActionBarProps) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="px-3 py-2.5 flex items-center gap-2 border-t border-neutral-100 dark:border-neutral-700/80 bg-neutral-50/80 dark:bg-neutral-900/80">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCopy(hex);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium py-1.5 rounded-xl transition-all duration-150 text-neutral-500 dark:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-100 relative overflow-hidden"
        title="复制并新增条目"
      >
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.div
              key="check"
              initial={{ opacity: 0, scale: 0.5, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: -10 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-300"
            >
              <Check className="w-3.5 h-3.5" /> 已复制
            </motion.div>
          ) : (
            <motion.div
              key="copy"
              initial={{ opacity: 0, scale: 0.5, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: -10 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" /> 复制
            </motion.div>
          )}
        </AnimatePresence>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onConfirm(hex);
        }}
        className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium py-1.5 rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 transition-all duration-150 shadow-sm shadow-indigo-500/15"
        title="确认并保存当前条目颜色"
      >
        <Check className="w-3.5 h-3.5" /> 确认
      </button>
    </div>
  );
}
