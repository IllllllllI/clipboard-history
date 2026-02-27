import React from 'react';
import { motion } from 'motion/react';
import { X, Copy, Check, Terminal, WrapText, Minus, Plus } from 'lucide-react';
import type { LanguageId } from '../../utils/languageDetect';
import { LanguageSelector } from './LanguageSelector';

interface EditorHeaderProps {
  darkMode: boolean;
  isSnippet: boolean;
  hasChanges: boolean;
  langId: LanguageId;
  fontSize: number;
  lineWrapping: boolean;
  isCopied: boolean;
  onLangChange: (id: LanguageId) => void;
  onFontSizeChange: (delta: number) => void;
  onToggleLineWrapping: () => void;
  onCopy: () => void;
  onClose: () => void;
}

/** 编辑器顶部工具栏 */
export const EditorHeader = React.memo(function EditorHeader({
  darkMode,
  isSnippet,
  hasChanges,
  langId,
  fontSize,
  lineWrapping,
  isCopied,
  onLangChange,
  onFontSizeChange,
  onToggleLineWrapping,
  onCopy,
  onClose,
}: EditorHeaderProps) {
  return (
    <div
      className={`px-5 py-3 border-b flex items-center justify-between shrink-0 ${
        darkMode ? 'border-neutral-800 bg-[#252526]' : 'border-neutral-100 bg-neutral-50'
      }`}
    >
      {/* Left: Title + Meta */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`p-1.5 rounded-lg ${
            darkMode ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-50 text-indigo-600'
          }`}
        >
          <Terminal className="w-4 h-4" />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold truncate">代码编辑器</h2>
          {isSnippet && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium shrink-0">
              片段
            </span>
          )}
          {hasChanges && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-medium shrink-0">
              已修改
            </span>
          )}
        </div>
      </div>

      {/* Right: Tools */}
      <div className="flex items-center gap-2 shrink-0">
        {/* 语言选择 */}
        <LanguageSelector currentLang={langId} onChange={onLangChange} darkMode={darkMode} />

        {/* 字号控制 */}
        <div
          className={`flex items-center rounded-lg overflow-hidden ${
            darkMode ? 'bg-neutral-800' : 'bg-neutral-100'
          }`}
        >
          <button
            onClick={() => onFontSizeChange(-1)}
            className={`p-1.5 transition-colors ${
              darkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-200'
            }`}
            title="减小字号"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-[10px] font-mono w-6 text-center">{fontSize}</span>
          <button
            onClick={() => onFontSizeChange(+1)}
            className={`p-1.5 transition-colors ${
              darkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-200'
            }`}
            title="增大字号"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* 自动换行 */}
        <button
          onClick={onToggleLineWrapping}
          className={`p-1.5 rounded-lg text-xs transition-colors ${
            lineWrapping
              ? darkMode
                ? 'bg-indigo-600/20 text-indigo-400'
                : 'bg-indigo-50 text-indigo-600'
              : darkMode
                ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400'
                : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-500'
          }`}
          title={lineWrapping ? '禁用自动换行' : '启用自动换行'}
        >
          <WrapText className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-neutral-200 dark:bg-neutral-700 mx-1" />

        {/* 复制 */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onCopy}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            isCopied
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : darkMode
                ? 'hover:bg-neutral-700 bg-neutral-800'
                : 'hover:bg-neutral-200 bg-neutral-100'
          }`}
        >
          {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {isCopied ? '已复制' : '复制'}
        </motion.button>

        {/* 关闭 */}
        <button
          onClick={onClose}
          className={`p-1.5 rounded-lg transition-colors ${
            darkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-200'
          }`}
          title="关闭 (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});
