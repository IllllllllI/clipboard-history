import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Edit2, Plus, X, Palette } from 'lucide-react';
import { ColorPicker } from './ColorPicker';
import { TagEditorTarget, toTagStyle } from './constants';
import './styles/dialog.shared.css';
import './styles/dialog.editor.css';

interface TagEditorDialogProps {
  dark: boolean;
  target: TagEditorTarget | null;
  onClose: () => void;
  onSubmit: (name: string, color: string | null, target: TagEditorTarget) => Promise<void>;
}

export const TagEditorDialog = React.memo(function TagEditorDialog({
  dark,
  target,
  onClose,
  onSubmit,
}: TagEditorDialogProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!target) return;
    setName(target.initial.name);
    setColor(target.initial.color);
  }, [target]);

  useEffect(() => {
    if (!target || !inputRef.current) return;
    inputRef.current.focus();
  }, [target]);

  const title = useMemo(() => (target?.mode === 'create' ? '新建标签' : '编辑标签'), [target]);
  const Icon = target?.mode === 'create' ? Plus : Edit2;

  const handleSubmit = async () => {
    if (!target || !name.trim()) return;
    await onSubmit(name.trim(), color, target);
  };

  return (
    <AnimatePresence>
      {target && (
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
            className="tag-manager-dialog-content"
          >
            <div className="tag-manager-editor-header">
              <div>
                <h3 className="tag-manager-editor-title">
                  <Icon className="tag-manager-editor-title-icon" />
                  {title}
                </h3>
                <p className="tag-manager-modal-title-desc">
                  {target.mode === 'create' ? '创建新的分类标签。' : '修改名称和颜色，不影响已关联记录。'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="tag-manager-modal-close-btn"
                title="关闭 (Esc)"
              >
                <X className="tag-manager-icon-16" />
              </button>
            </div>

            <div className="tag-manager-editor-form">
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="输入标签名称，例如：工作、灵感、待办"
                className="tag-manager-modal-input"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void handleSubmit();
                  }
                  if (event.key === 'Escape') onClose();
                }}
              />

              <div className="tag-manager-color-picker-container">
                <ColorPicker selectedColor={color} onSelect={setColor} dark={dark} />
              </div>

              <div className="tag-manager-preview-row">
                <span className="tag-manager-preview-label">
                  <Palette className="tag-manager-preview-label-icon" />
                  预览
                </span>
                <div className="tag-manager-preview-chip" style={toTagStyle(color, dark)}>
                  {name.trim() || '标签预览'}
                </div>
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
                  void handleSubmit();
                }}
                disabled={!name.trim()}
                className="tag-manager-dialog-btn-submit"
                title="保存 (Enter)"
              >
                <Check className="tag-manager-icon-14" />
                {target.mode === 'create' ? '创建标签' : '保存修改'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});
