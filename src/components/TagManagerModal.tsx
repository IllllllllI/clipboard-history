import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Tag as TagIcon } from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { backdropVariantsDelayed, tagModalVariants, fadeInVariants, DURATION_FAST } from '../utils/motionPresets';
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
            variants={backdropVariantsDelayed}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="tag-manager-modal-backdrop"
          />

          <motion.div
            variants={tagModalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="tag-manager-modal-shell"
            data-theme={dark ? 'dark' : 'light'}
          >
            <div className="tag-manager-modal-header" data-theme={dark ? 'dark' : 'light'}>
              <div className="tag-manager-modal-header-left">
                <motion.div
                  variants={fadeInVariants}
                  initial="initial"
                  animate="animate"
                  transition={DURATION_FAST}
                  className="tag-manager-modal-header-icon-wrap"
                  data-theme={dark ? 'dark' : 'light'}
                >
                  <TagIcon className="tag-manager-modal-header-icon" />
                </motion.div>
                <div>
                  <h2 className="tag-manager-modal-main-title">标签管理</h2>
                  <div className="tag-manager-modal-subline">
                    <p className="tag-manager-modal-subtitle">统一管理标签与颜色</p>
                    <span className="tag-manager-modal-count-badge" data-theme={dark ? 'dark' : 'light'}>
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
                  data-theme={dark ? 'dark' : 'light'}
                  title="关闭 (Esc)"
                >
                  <X className="tag-manager-modal-header-icon" />
                </button>
              </div>
            </div>

            <div className="tag-manager-modal-body" data-theme={dark ? 'dark' : 'light'}>
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
