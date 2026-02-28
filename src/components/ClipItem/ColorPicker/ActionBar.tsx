import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import './styles/color-picker.css';

interface ActionBarProps {
  hex: string;
  onConfirm: (color: string) => void;
  onCopy: (color: string) => void;
}

/** 底部操作栏：复制 & 确认 */
export function ActionBar({ hex, onConfirm, onCopy }: ActionBarProps) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="clip-item-color-picker-actionbar">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCopy(hex);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="clip-item-color-picker-action-btn clip-item-color-picker-action-copy"
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
              className="flex items-center gap-1.5 clip-item-color-picker-action-copy-ok"
            >
              <Check className="clip-item-color-picker-action-icon" /> 已复制
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
              <Copy className="clip-item-color-picker-action-icon" /> 复制
            </motion.div>
          )}
        </AnimatePresence>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onConfirm(hex);
        }}
        className="clip-item-color-picker-action-btn clip-item-color-picker-action-confirm"
        title="确认并保存当前条目颜色"
      >
        <Check className="clip-item-color-picker-action-icon" /> 确认
      </button>
    </div>
  );
}
