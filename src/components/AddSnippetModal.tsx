import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';

interface AddSnippetModalProps {
  show: boolean;
  onClose: () => void;
}

export function AddSnippetModal({ show, onClose }: AddSnippetModalProps) {
  const { settings, handleSaveSnippet } = useAppContext();
  const [newSnippet, setNewSnippet] = useState('');

  const handleSave = () => {
    if (newSnippet.trim()) {
      handleSaveSnippet(newSnippet);
      setNewSnippet('');
      onClose();
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
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className={`relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border ${settings.darkMode ? 'bg-neutral-900 border-neutral-800 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'}`}
          >
            <div className={`px-6 py-4 border-b flex items-center justify-between ${settings.darkMode ? 'border-neutral-800' : 'border-neutral-100'}`}>
              <h2 className="text-lg font-semibold">添加新片段</h2>
              <button onClick={onClose} className={`p-1.5 rounded-md transition-colors ${settings.darkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <textarea
                autoFocus
                placeholder="输入或粘贴片段内容..."
                value={newSnippet}
                onChange={(e) => setNewSnippet(e.target.value)}
                className={`w-full h-32 p-4 rounded-xl border text-sm transition-all outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none ${
                  settings.darkMode
                    ? 'bg-neutral-800 border-neutral-700 text-neutral-200 placeholder:text-neutral-500'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-900 placeholder:text-neutral-400'
                }`}
              />
              <button
                onClick={handleSave}
                className="w-full py-2.5 bg-indigo-500 text-white rounded-xl font-semibold hover:bg-indigo-600 transition-colors"
              >
                保存片段
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
