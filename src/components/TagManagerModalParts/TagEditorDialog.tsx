import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Edit2, Plus, X, Palette } from 'lucide-react';
import { ColorPicker } from './ColorPicker';
import { TagEditorTarget, toTagStyle } from './constants';

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
            className="absolute inset-0 bg-black/40 z-30"
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[94%] max-w-md rounded-2xl border p-5 z-40 shadow-2xl ${
              dark ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-neutral-200'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold inline-flex items-center gap-2">
                  <Icon className="w-4 h-4 text-indigo-500" />
                  {title}
                </h3>
                <p className={`text-xs mt-1 ${dark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                  {target.mode === 'create' ? '创建新的分类标签。' : '修改名称和颜色，不影响已关联记录。'}
                </p>
              </div>
              <button
                onClick={onClose}
                className={`p-1.5 rounded-md transition-colors ${dark ? 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700'}`}
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="输入标签名称，例如：工作、灵感、待办"
                className={`w-full px-3 py-2 rounded-lg text-sm border bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${
                  dark
                    ? 'border-neutral-700 text-white focus:border-indigo-500'
                    : 'border-neutral-200 text-neutral-900 focus:border-indigo-500'
                }`}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void handleSubmit();
                  }
                  if (event.key === 'Escape') onClose();
                }}
              />

              <div className={`rounded-xl p-3 ${dark ? 'bg-neutral-800/60 ring-1 ring-white/5' : 'bg-neutral-50 ring-1 ring-black/5'}`}>
                <ColorPicker selectedColor={color} onSelect={setColor} dark={dark} />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500 inline-flex items-center gap-1.5 shrink-0">
                  <Palette className="w-3.5 h-3.5" />
                  预览
                </span>
                <div className="inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-semibold" style={toTagStyle(color, dark)}>
                  {name.trim() || '标签预览'}
                </div>
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
                  void handleSubmit();
                }}
                disabled={!name.trim()}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                {target.mode === 'create' ? '创建标签' : '保存修改'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});
