import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2 } from 'lucide-react';
import { Tag } from '../../types';

interface TagDeleteDialogProps {
  dark: boolean;
  tag: Tag | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export const TagDeleteDialog = React.memo(function TagDeleteDialog({
  dark,
  tag,
  onClose,
  onConfirm,
}: TagDeleteDialogProps) {
  return (
    <AnimatePresence>
      {tag && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 z-30"
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] max-w-sm rounded-2xl border p-5 z-40 shadow-2xl ${
              dark ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-neutral-200'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 p-2 rounded-lg ${dark ? 'bg-red-500/15 text-red-300' : 'bg-red-50 text-red-500'}`}>
                <Trash2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">删除标签</h3>
                <p className={`text-xs mt-1 leading-relaxed ${dark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                  确认删除标签
                  <span className={`mx-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold ${dark ? 'bg-neutral-800 text-neutral-300' : 'bg-neutral-100 text-neutral-700'}`}>
                    {tag.name}
                  </span>
                  ？此操作不可撤销。
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={onClose}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${dark ? 'text-neutral-300 bg-neutral-800 hover:bg-neutral-700' : 'text-neutral-600 bg-neutral-100 hover:bg-neutral-200'}`}
              >
                取消
              </button>
              <button
                onClick={() => {
                  void onConfirm();
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                确认删除
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});
