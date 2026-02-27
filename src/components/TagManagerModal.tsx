import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, Edit2, Check, Tag as TagIcon, Palette } from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { Tag } from '../types';

// ============================================================================
// 常量
// ============================================================================

interface TagManagerModalProps {
  show: boolean;
  onClose: () => void;
}

const COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#0284c7', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e',
];

// ============================================================================
// 子组件
// ============================================================================

/** 颜色选择器 */
const ColorPicker = React.memo(function ColorPicker({
  selectedColor,
  onSelect,
  dark,
}: {
  selectedColor: string | null;
  onSelect: (color: string | null) => void;
  dark: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 p-1">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
          selectedColor === null
            ? 'border-indigo-500 scale-110'
            : 'border-transparent hover:scale-105'
        } ${dark ? 'bg-neutral-700' : 'bg-neutral-200'}`}
        title="默认颜色"
      >
        {selectedColor === null && <Check className="w-3 h-3 text-neutral-500" />}
      </button>
      {COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onSelect(c)}
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
            selectedColor === c
              ? 'border-white scale-110 shadow-md ring-1 ring-black/10'
              : 'border-transparent hover:scale-105'
          }`}
          style={{ backgroundColor: c }}
        >
          {selectedColor === c && <Check className="w-3.5 h-3.5 text-white drop-shadow-md" strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
});

/** 单个标签行 */
const TagRow = React.memo(function TagRow({
  tag,
  dark,
  onUpdate,
  onDelete,
}: {
  tag: Tag;
  dark: boolean;
  onUpdate: (id: number, name: string, color: string | null) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(tag.name);
  const [editColor, setEditColor] = useState<string | null>(tag.color);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (editName.trim()) {
      await onUpdate(tag.id, editName.trim(), editColor);
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditName(tag.name);
    setEditColor(tag.color);
    setIsEditing(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`group relative rounded-xl border transition-all ${
        isEditing
          ? `border-indigo-500/50 ring-2 ring-indigo-500/10 shadow-lg z-10 ${dark ? 'bg-neutral-800' : 'bg-white'}`
          : dark
            ? 'bg-neutral-800/50 border-neutral-800 hover:border-neutral-600'
            : 'bg-white border-neutral-100 hover:border-neutral-300'
      }`}
    >
      {isEditing ? (
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className={`flex-1 px-3 py-1.5 rounded-lg text-sm border bg-transparent focus:outline-none transition-colors ${
                dark
                  ? 'border-neutral-700 focus:border-indigo-500 text-white'
                  : 'border-neutral-200 focus:border-indigo-500 text-neutral-900'
              }`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') handleCancel();
              }}
            />
          </div>
          <div className={`rounded-lg p-2 ${dark ? 'bg-neutral-900/50' : 'bg-neutral-50'}`}>
            <ColorPicker selectedColor={editColor} onSelect={setEditColor} dark={dark} />
          </div>
          <div className={`flex justify-end gap-2 pt-1 border-t ${dark ? 'border-neutral-700/50' : 'border-neutral-100'}`}>
            <button
              onClick={handleCancel}
              className={`px-3 py-1 text-xs font-medium transition-colors ${dark ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-500 hover:text-neutral-700'}`}
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1 text-xs font-medium bg-indigo-500 text-white rounded-md hover:bg-indigo-600 shadow-sm transition-all active:scale-95"
            >
              保存修改
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-2.5 h-8 rounded-full shrink-0 ${!tag.color ? (dark ? 'bg-neutral-600' : 'bg-neutral-300') : ''}`}
              style={tag.color ? { backgroundColor: tag.color } : {}}
            />
            <div className="flex flex-col">
              <span className={`font-medium text-sm ${dark ? 'text-neutral-200' : 'text-neutral-800'}`}>{tag.name}</span>
              <span className="text-[10px] text-neutral-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                ID: {tag.id}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0">
            <button
              onClick={() => setIsEditing(true)}
              className={`p-1.5 text-neutral-400 hover:text-indigo-500 rounded-lg transition-colors ${dark ? 'hover:bg-indigo-500/10' : 'hover:bg-indigo-50'}`}
              title="编辑"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (confirm(`确定要删除标签 "${tag.name}" 吗？此操作不可撤销。`)) {
                  onDelete(tag.id);
                }
              }}
              className={`p-1.5 text-neutral-400 hover:text-red-500 rounded-lg transition-colors ${dark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'}`}
              title="删除"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
});

// ============================================================================
// 主组件
// ============================================================================

export const TagManagerModal = React.memo(function TagManagerModal({ show, onClose }: TagManagerModalProps) {
  const { settings, tags, handleCreateTag, handleUpdateTag, handleDeleteTag } = useAppContext();
  const dark = settings.darkMode;

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 每次打开 modal 重置状态
  useEffect(() => {
    if (show) {
      setNewName('');
      setNewColor(null);
      setIsCreating(false);
    }
  }, [show]);

  // focusing input when creating starts
  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  const createTag = async () => {
    if (newName.trim()) {
      await handleCreateTag(newName.trim(), newColor);
      setNewName('');
      setNewColor(null);
      inputRef.current?.focus();
      if (listRef.current) listRef.current.scrollTop = 0;
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={`relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] ${
              dark ? 'bg-neutral-900 text-neutral-200' : 'bg-white text-neutral-800'
            }`}
          >
            {/* Header */}
            <div className={`px-6 py-4 flex items-center justify-between shrink-0 border-b ${dark ? 'border-neutral-800' : 'border-neutral-100'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${dark ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
                  <TagIcon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold tracking-tight">标签管理</h2>
                  <p className="text-xs text-neutral-500 font-medium">管理您的分类标签 ({tags.length})</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className={`p-2 rounded-full transition-colors ${dark ? 'hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'hover:bg-neutral-100 text-neutral-400 hover:text-neutral-900'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Area */}
            <div className={`flex-1 flex flex-col min-h-0 ${dark ? 'bg-black/20' : 'bg-neutral-50/50'}`}>

              {/* Creator Section */}
              <div className={`shrink-0 p-4 m-4 mb-0 rounded-xl border shadow-sm transition-all ${
                isCreating
                  ? (dark ? 'bg-neutral-800 border-indigo-500/30' : 'bg-white border-indigo-200 ring-4 ring-indigo-50')
                  : (dark ? 'bg-neutral-800/50 border-neutral-800 hover:border-neutral-700' : 'bg-white border-white hover:border-indigo-100')
              }`}>
                {!isCreating ? (
                  <button
                    onClick={() => setIsCreating(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-neutral-500 hover:text-indigo-600 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    新建标签
                  </button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">New Tag</span>
                      <button
                        onClick={() => setIsCreating(false)}
                        className={`text-xs transition-colors ${dark ? 'text-neutral-400 hover:text-neutral-300' : 'text-neutral-400 hover:text-neutral-600'}`}
                      >
                        取消
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          ref={inputRef}
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="输入标签名称..."
                          className={`w-full pl-3 pr-10 py-2.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all ${
                            dark ? 'bg-black/20 border-neutral-700 text-white placeholder:text-neutral-600' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                          }`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') createTag();
                            if (e.key === 'Escape') setIsCreating(false);
                          }}
                        />
                        <div className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[10px] text-neutral-500 font-mono ${dark ? 'bg-neutral-700' : 'bg-neutral-200'}`}>
                          ↵
                        </div>
                      </div>
                      <button
                        onClick={createTag}
                        disabled={!newName.trim()}
                        className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-500/20 transition-all active:scale-95 flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        添加
                      </button>
                    </div>

                    <div className={`p-3 rounded-lg ${dark ? 'bg-black/20' : 'bg-neutral-50'}`}>
                      <div className="flex items-center gap-2 mb-2 text-xs text-neutral-500">
                        <Palette className="w-3 h-3" />
                        <span>选择颜色</span>
                      </div>
                      <ColorPicker selectedColor={newColor} onSelect={setNewColor} dark={dark} />
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Tag List */}
              <div
                ref={listRef}
                className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5 custom-scrollbar"
              >
                {tags.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-neutral-400 py-10 opacity-60">
                    <TagIcon className="w-12 h-12 mb-3 stroke-1" />
                    <p className="text-sm font-medium">暂无标签</p>
                    <p className="text-xs">点击上方按钮创建您的第一个标签</p>
                  </div>
                ) : (
                  tags.slice().reverse().map(tag => (
                    <TagRow
                      key={tag.id}
                      tag={tag}
                      dark={dark}
                      onUpdate={handleUpdateTag}
                      onDelete={handleDeleteTag}
                    />
                  ))
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});
