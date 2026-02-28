import React from 'react';
import { motion } from 'motion/react';
import { X, Copy, Check, Terminal, WrapText, Minus, Plus, Focus } from 'lucide-react';
import type { LanguageId } from '../../utils/languageDetect';
import { LanguageSelector } from './LanguageSelector';

interface EditorHeaderProps {
  darkMode: boolean;
  isSnippet: boolean;
  hasChanges: boolean;
  langId: LanguageId;
  fontSize: number;
  lineWrapping: boolean;
  focusMode: boolean;
  isCopied: boolean;
  onLangChange: (id: LanguageId) => void;
  onFontSizeChange: (delta: number) => void;
  onToggleLineWrapping: () => void;
  onToggleFocusMode: () => void;
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
  focusMode,
  isCopied,
  onLangChange,
  onFontSizeChange,
  onToggleLineWrapping,
  onToggleFocusMode,
  onCopy,
  onClose,
}: EditorHeaderProps) {
  return (
    <div className="code-editor-header" data-theme={darkMode ? 'dark' : 'light'}>
      {/* Left: Title + Meta */}
      <div className="code-editor-header-left">
        <div className="code-editor-title-icon">
          <Terminal className="w-4 h-4" />
        </div>
        <div className="code-editor-title-wrap">
          <h2 className="code-editor-title">代码编辑器</h2>
          {isSnippet && (
            <span className="code-editor-badge code-editor-badge-snippet">
              片段
            </span>
          )}
          {hasChanges && (
            <span className="code-editor-badge code-editor-badge-changed">
              已修改
            </span>
          )}
        </div>
      </div>

      {/* Right: Tools */}
      <div className="code-editor-header-tools">
        {/* 语言选择 */}
        <LanguageSelector currentLang={langId} onChange={onLangChange} darkMode={darkMode} />

        {/* 字号控制 */}
        <div className="code-editor-font">
          <button
            onClick={() => onFontSizeChange(-1)}
            className="code-editor-font-btn"
            title="减小字号"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="code-editor-font-value">{fontSize}</span>
          <button
            onClick={() => onFontSizeChange(+1)}
            className="code-editor-font-btn"
            title="增大字号"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* 自动换行 */}
        <button
          onClick={onToggleLineWrapping}
          className="code-editor-btn code-editor-btn-square"
          data-active={lineWrapping ? 'true' : 'false'}
          title={lineWrapping ? '禁用自动换行' : '启用自动换行'}
        >
          <WrapText className="w-4 h-4" />
        </button>

        {/* 专注阅读 */}
        <button
          onClick={onToggleFocusMode}
          className="code-editor-btn code-editor-btn-square"
          data-active={focusMode ? 'true' : 'false'}
          title={focusMode ? '退出专注阅读' : '专注阅读（隐藏行号）'}
        >
          <Focus className="w-4 h-4" />
        </button>

        <div className="code-editor-divider" />

        {/* 复制 */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onCopy}
          className="code-editor-btn code-editor-btn-copy"
          data-copied={isCopied ? 'true' : 'false'}
        >
          {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          <span className="code-editor-copy-text">{isCopied ? '已复制' : '复制'}</span>
        </motion.button>

        {/* 关闭 */}
        <button
          onClick={onClose}
          className="code-editor-btn code-editor-btn-square"
          title="关闭 (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});
