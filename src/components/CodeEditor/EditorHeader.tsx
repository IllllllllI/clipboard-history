import React from 'react';
import { X, Copy, Check, Terminal, WrapText, Minus, Plus, Focus, AlignLeft, Loader2 } from 'lucide-react';
import type { LanguageId } from '../../utils/languageDetect';
import { LanguageSelector } from './LanguageSelector';
import { FORMATTABLE_LANGUAGES } from './formatCode';

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
  onFormat: () => void;
  onCopy: () => void;
  onClose: () => void;
  isReadOnly?: boolean;
  isFormatting?: boolean;
  /** 富文本格式选择器（仅 rich 条目传入） */
  formatSelector?: React.ReactNode;
}

/** 
 * 编辑器顶部工具栏
 * 性能优化：通过 React.memo 配合父组件对 formatSelector 的引用稳定化，避免按键输入时的重渲染
 */
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
  onFormat,
  onCopy,
  onClose,
  isReadOnly = false,
  isFormatting = false,
  formatSelector,
}: EditorHeaderProps) {
  return (
    <header className="code-editor-header" data-theme={darkMode ? 'dark' : 'light'}>
      {/* Left: Title + Meta */}
      <div className="code-editor-header-left">
        <div className="code-editor-title-icon" aria-hidden="true">
          <Terminal className="w-4 h-4" />
        </div>
        <div className="code-editor-title-wrap">
          <h2 className="code-editor-title" id="code-editor-title">代码编辑器</h2>
          {isSnippet && (
            <span className="code-editor-badge code-editor-badge-snippet" title="当前内容是一个片段" aria-label="标签：代码片段">
              片段
            </span>
          )}
          {hasChanges && (
            <span className="code-editor-badge code-editor-badge-changed" title="有未保存的修改" aria-label="状态：有未保存的修改">
              已修改
            </span>
          )}
        </div>
      </div>

      {/* Right: Tools */}
      <div className="code-editor-header-tools" role="toolbar" aria-label="编辑器工具栏">
        {/* 富文本格式选择 */}
        {formatSelector}

        {/* 语言选择 */}
        <LanguageSelector currentLang={langId} onChange={onLangChange} darkMode={darkMode} />

        {/* 字号控制 */}
        <div className="code-editor-font" role="group" aria-label="字号控制">
          <button
            type="button"
            onClick={() => onFontSizeChange(-1)}
            className="code-editor-font-btn"
            title="减小字号"
            aria-label="减小字号"
          >
            <Minus className="w-3 h-3" aria-hidden="true" />
          </button>
          <span 
            className="code-editor-font-value" 
            aria-label={"当前字号 " + fontSize}
            aria-live="polite"
            aria-atomic="true"
          >
            {fontSize}
          </span>
          <button
            type="button"
            onClick={() => onFontSizeChange(+1)}
            className="code-editor-font-btn"
            title="增大字号"
            aria-label="增大字号"
          >
            <Plus className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>

        {/* 自动换行 */}
        <button
          type="button"
          onClick={onToggleLineWrapping}
          className="code-editor-btn code-editor-btn-square"
          data-active={lineWrapping ? 'true' : 'false'}
          title={lineWrapping ? '禁用自动换行' : '启用自动换行'}
          aria-label={lineWrapping ? '禁用自动换行' : '启用自动换行'}
          aria-pressed={lineWrapping}
        >
          <WrapText className="w-4 h-4" aria-hidden="true" />
        </button>

        {/* 专注阅读 */}
        <button
          type="button"
          onClick={onToggleFocusMode}
          className="code-editor-btn code-editor-btn-square"
          data-active={focusMode ? 'true' : 'false'}
          title={focusMode ? '退出专注阅读' : '专注阅读（隐藏行号）'}
          aria-label={focusMode ? '退出专注阅读' : '专注阅读'}
          aria-pressed={focusMode}
        >
          <Focus className="w-4 h-4" aria-hidden="true" />
        </button>

        {/* 格式化 */}
        <button
          type="button"
          onClick={onFormat}
          className="code-editor-btn code-editor-btn-square"
          disabled={isReadOnly || isFormatting || !FORMATTABLE_LANGUAGES.has(langId)}
          data-active={isFormatting ? 'true' : 'false'}
          title={
            isReadOnly
              ? '只读模式下不可格式化'
              : isFormatting
                ? '格式化中…'
                : FORMATTABLE_LANGUAGES.has(langId)
                  ? ("格式化 " + langId.toUpperCase())
                  : (langId + " 不支持格式化")
          }
          aria-label={isFormatting ? '正在格式化代码' : '格式化代码'}
        >
          {isFormatting ? (
            <Loader2 className="w-4 h-4 code-editor-spin" aria-hidden="true" />
          ) : (
            <AlignLeft className="w-4 h-4" aria-hidden="true" />
          )}
        </button>

        <div className="code-editor-divider" aria-hidden="true" />

        {/* 复制 */}
        <button
          type="button"
          onClick={onCopy}
          className="code-editor-btn code-editor-btn-copy"
          data-copied={isCopied ? 'true' : 'false'}
          aria-label={isCopied ? '代码已复制' : '复制代码到剪贴板'}
        >
          {isCopied ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
          <span className="code-editor-copy-text" aria-hidden="true">
            {isCopied ? '已复制' : '复制'}
          </span>
        </button>

        {/* 关闭 */}
        <button
          type="button"
          onClick={onClose}
          className="code-editor-btn code-editor-btn-square"
          title="关闭编辑器 (Esc)"
          aria-label="关闭编辑器"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
});
