import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Tag as TagIcon } from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { Tag } from '../types';
import { TagList } from './TagManagerModalParts/TagList';
import { TagEditorDialog } from './TagManagerModalParts/TagEditorDialog';
import { TagDeleteDialog } from './TagManagerModalParts/TagDeleteDialog';
import { TagEditorTarget, getTagInitialValue } from './TagManagerModalParts/constants';
import './TagManagerModalParts/styles/modal.css';

interface TagManagerModalProps {
  show: boolean;
  onClose: () => void;
}

export const TagManagerModal = React.memo(function TagManagerModal({ show, onClose }: TagManagerModalProps) {
  const { settings, tags, handleCreateTag, handleUpdateTag, handleDeleteTag } = useAppContext();
  const dark = settings.darkMode;

  const [editorTarget, setEditorTarget] = useState<TagEditorTarget | null>(null);
  const [pendingDeleteTag, setPendingDeleteTag] = useState<Tag | null>(null);

  useEffect(() => {
    if (!show) return;
    setEditorTarget(null);
    setPendingDeleteTag(null);
  }, [show]);

  useEffect(() => {
    if (!show) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Only close main modal if sub-dialogs are not open
        if (!editorTarget && !pendingDeleteTag) {
          e.preventDefault();
          onClose();
        }
      }

      // Alt+N to create new tag
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if (!editorTarget && !pendingDeleteTag) {
          setEditorTarget({
            mode: 'create',
            initial: { name: '', color: null },
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [show, editorTarget, pendingDeleteTag, onClose]);

  const openCreateEditor = () => {
    setEditorTarget({
      mode: 'create',
      initial: { name: '', color: null },
    });
  };

  const openEditEditor = (tag: Tag) => {
    setEditorTarget({
      id: tag.id,
      mode: 'edit',
      initial: getTagInitialValue(tag),
    });
  };

  const closeEditor = () => {
    setEditorTarget(null);
  };

  const handleSubmitEditor = async (name: string, color: string | null, target: TagEditorTarget) => {
    if (target.mode === 'create') {
      await handleCreateTag(name, color);
      closeEditor();
      return;
    }

    if (target.id == null) return;
    await handleUpdateTag(target.id, name, color);
    closeEditor();
  };

  const requestDelete = (tag: Tag) => {
    setPendingDeleteTag(tag);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteTag) return;
    await handleDeleteTag(pendingDeleteTag.id);
    if (editorTarget?.mode === 'edit' && editorTarget.id === pendingDeleteTag.id) {
      closeEditor();
    }
    setPendingDeleteTag(null);
  };

  return (
    <AnimatePresence initial={false}>
      {show && (
        <div className="tag-manager-modal-root">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { delay: 0.08, duration: 0.16 } }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="tag-manager-modal-backdrop"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 25, stiffness: 350 } }}
            exit={{ opacity: 0, scale: 0.98, y: 5, transition: { duration: 0.14, ease: 'easeIn' } }}
            className={`tag-manager-modal-shell ${dark ? 'tag-manager-modal-shell-dark' : ''}`}
          >
            <div className="tag-manager-modal-header">
              <div className="tag-manager-modal-header-left">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.16 }}
                  className="tag-manager-modal-header-icon-wrap"
                >
                  <TagIcon className="tag-manager-modal-header-icon" />
                </motion.div>
                <div>
                  <h2 className="tag-manager-modal-main-title">标签管理</h2>
                  <div className="tag-manager-modal-subline">
                    <p className="tag-manager-modal-subtitle">统一管理标签与颜色</p>
                    <span className="tag-manager-modal-count-badge">
                      共 {tags.length} 个
                    </span>
                  </div>
                </div>
              </div>
              <div className="tag-manager-modal-header-actions">
                <button
                  onClick={openCreateEditor}
                  className="tag-manager-modal-create-btn"
                  title="新建标签 (Alt + N)"
                >
                  <Plus className="tag-manager-icon-14" />
                  新建标签
                  <span className="tag-manager-shortcut-kbd">Alt+N</span>
                </button>
                <button
                  onClick={onClose}
                  className="tag-manager-modal-close-round"
                  title="关闭 (Esc)"
                >
                  <X className="tag-manager-modal-header-icon" />
                </button>
              </div>
            </div>

            <div className="tag-manager-modal-body">
              <TagList
                dark={dark}
                tags={tags}
                onEdit={openEditEditor}
                onDelete={requestDelete}
              />
            </div>

            <TagEditorDialog
              dark={dark}
              target={editorTarget}
              onClose={closeEditor}
              onSubmit={handleSubmitEditor}
            />

            <TagDeleteDialog
              dark={dark}
              tag={pendingDeleteTag}
              onClose={() => setPendingDeleteTag(null)}
              onConfirm={handleConfirmDelete}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});
