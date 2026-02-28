import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2 } from 'lucide-react';
import { Tag } from '../../types';
import './styles/dialog.shared.css';
import './styles/dialog.delete.css';

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
  useEffect(() => {
    if (!tag) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is interacting with some other focused input outside
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        void onConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tag, onClose, onConfirm]);

  return (
    <AnimatePresence>
      {tag && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            onClick={onClose}
            className="tag-manager-dialog-overlay"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10, x: '-50%' }}
            animate={{ opacity: 1, scale: 1, y: '-50%', x: '-50%', transition: { type: 'spring', damping: 25, stiffness: 400 } }}
            exit={{ opacity: 0, scale: 0.95, y: -10, x: '-50%', transition: { duration: 0.15 } }}
            className="tag-manager-dialog-delete-content"
          >
            <div className="tag-manager-delete-header">
              <div className="tag-manager-delete-icon-container">
                <Trash2 className="tag-manager-icon-16" />
              </div>
              <div className="tag-manager-delete-title-wrap">
                <h3 className="tag-manager-delete-title">删除标签</h3>
                <p className="tag-manager-delete-desc">
                  确认删除标签
                  <span className="tag-manager-delete-tag-name">
                    {tag.name}
                  </span>
                  ？此操作不可撤销。
                </p>
              </div>
            </div>
            <div className="tag-manager-dialog-footer-actions">
              <button
                onClick={onClose}
                className="tag-manager-dialog-btn-cancel"
                title="取消 (Esc)"
              >
                取消
              </button>
              <button
                onClick={() => {
                  void onConfirm();
                }}
                className="tag-manager-dialog-btn-danger"
                title="确认 (Enter)"
              >
                <Trash2 className="tag-manager-icon-14" />
                确认删除
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});
