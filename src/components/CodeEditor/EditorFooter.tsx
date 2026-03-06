import React from 'react';
import { Save, Lock } from 'lucide-react';
import type { EditorCursorInfo, IndentStyle, IndentSize } from './types';

interface EditorFooterProps {
  darkMode: boolean;
  lineCount: number;
  charCount: number;
  hasChanges: boolean;
  isReadOnly?: boolean;
  cursorInfo: EditorCursorInfo;
  indentStyle: IndentStyle;
  indentSize: IndentSize;
  onToggleIndentStyle: () => void;
  onCycleIndentSize: () => void;
  onClose: () => void;
  onSave: () => void;
}

/** 编辑器底部状态栏 + 操作按钮 */
export const EditorFooter = React.memo(function EditorFooter({
  darkMode,
  lineCount,
  charCount,
  hasChanges,
  isReadOnly = false,
  cursorInfo,
  indentStyle,
  indentSize,
  onToggleIndentStyle,
  onCycleIndentSize,
  onClose,
  onSave,
}: EditorFooterProps) {
  const { line, col, selectedChars, selectedLines } = cursorInfo;

  return (
    <footer className="code-editor-footer" data-theme={darkMode ? 'dark' : 'light'} aria-label="编辑器状态栏">
      {/* 状态信息 */}
      <div className="code-editor-status" role="contentinfo" aria-label="当前光标及选择状态">
        {isReadOnly && (
          <span className="code-editor-status-readonly" title="当前条目受保护（仅可读）" aria-label="只读">`n<Lock className="w-3 h-3" aria-hidden="true" />`n<span aria-hidden="true">只读</span>`n</span>
        )}
        <span className="code-editor-status-cursor" title={`第 ${line} 行，第 ${col} 列`} aria-label={`第 ${line} 行，第 ${col} 列`}>
          Ln {line}, Col {col}
        </span>
        {selectedChars > 0 && (
          <span className="code-editor-status-selection" title={`已选中 ${selectedChars} 个字符`}>
            {selectedLines > 1 ? `${selectedChars} 字符 (${selectedLines} 行)` : `${selectedChars} 字符`}
          </span>
        )}
        <span title={`共 ${lineCount} 行`}>{lineCount} 行</span>
        <span className="code-editor-status-chars" title={`共 ${charCount} 个字符`}>{charCount} 字符</span>
        {!isReadOnly && (
          <>
            <button aria-label={`切换缩进模式，当前状态为${indentStyle === 'spaces' ? '空格' : 'Tab'}`}
              type="button"
              className="code-editor-status-indent"
              onClick={onToggleIndentStyle}
              title={`切换缩进模式（当前: ${indentStyle === 'spaces' ? '空格' : 'Tab'}）`}
            >
              {indentStyle === 'spaces' ? 'Spaces' : 'Tabs'}
            </button>
            <button aria-label={`切换缩进宽度，当前宽度为${indentSize}`}
              type="button"
              className="code-editor-status-indent"
              onClick={onCycleIndentSize}
              title={`切换缩进宽度（当前: ${indentSize}）`}
            >
              {indentSize}
            </button>
          </>
        )}
        <span className="code-editor-status-shortcut" aria-hidden="true">
          {isReadOnly ? 'Esc 关闭' : 'Ctrl+S 保存 · Esc 关闭'}
        </span>
      </div>

      {/* 操作按钮 */}
      <div className="code-editor-footer-actions">
        {isReadOnly ? (
          <button type="button" onClick={onClose} className="code-editor-btn-ghost">
            关闭
          </button>
        ) : (
          <>
            <button type="button" onClick={onClose} className="code-editor-btn-ghost">
              {hasChanges ? '放弃修改' : '关闭'}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!hasChanges}
              className="code-editor-btn-save"
              aria-label="保存修改"
            >
              <Save className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="code-editor-save-text-desktop">保存修改</span>
              <span className="code-editor-save-text-mobile">保存</span>
            </button>
          </>
        )}
      </div>
    </footer>
  );
});

