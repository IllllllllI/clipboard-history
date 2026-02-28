import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Tag as TagIcon } from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { Tag } from '../types';
import { TagList } from './TagManagerModalParts/TagList';
import { TagEditorDialog } from './TagManagerModalParts/TagEditorDialog';
import { TagDeleteDialog } from './TagManagerModalParts/TagDeleteDialog';
import { TagEditorTarget, getTagInitialValue } from './TagManagerModalParts/constants';

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { delay: 0.08, duration: 0.16 } }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-neutral-900/40 border-0 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.16 } }}
            exit={{ opacity: 0, transition: { duration: 0.14, ease: 'easeIn' } }}
            className={`relative w-full max-w-2xl h-[620px] max-h-[88vh] rounded-2xl shadow-2xl flex flex-col ${
              dark ? 'bg-neutral-900 text-neutral-200 ring-1 ring-white/10' : 'bg-white text-neutral-800 ring-1 ring-black/5'
            }`}
          >
            <div className={`px-6 py-5 flex items-center justify-between shrink-0 rounded-t-2xl ${dark ? 'bg-neutral-800/50 border-b border-neutral-800' : 'bg-neutral-50/70 border-b border-neutral-100'}`}>
              <div className="flex items-center gap-3">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.16 }}
                  className={`p-2.5 rounded-xl shadow-inner ${dark ? 'bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/30' : 'bg-indigo-100 text-indigo-600 ring-1 ring-indigo-200'}`}
                >
                  <TagIcon className="w-5 h-5" />
                </motion.div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight">标签管理</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-neutral-500 font-medium">统一管理标签与颜色</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${dark ? 'bg-neutral-700 text-neutral-300' : 'bg-neutral-200 text-neutral-600'}`}>
                      共 {tags.length} 个
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={openCreateEditor}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新建标签
                </button>
                <button
                  onClick={onClose}
                  className={`p-2 rounded-full transition-colors ${dark ? 'hover:bg-neutral-700 text-neutral-400 hover:text-white' : 'hover:bg-neutral-200 text-neutral-400 hover:text-neutral-900'}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className={`flex-1 flex flex-col min-h-0 overflow-hidden rounded-b-2xl ${dark ? 'bg-neutral-900/50' : 'bg-white'}`}>
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
