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
    <footer className="code-editor-footer" data-theme={darkMode ? 'dark' : 'light'}>
      {/* 状态信息 */}
      <div className="code-editor-status">
        {isReadOnly && (
          <span className="code-editor-status-readonly">
            <Lock className="w-3 h-3" />
            只读
          </span>
        )}
        <span className="code-editor-status-cursor">
          {line}:{col}
        </span>
        {selectedChars > 0 && (
          <span className="code-editor-status-selection">
            {selectedLines > 1 ? `${selectedChars} 字符 (${selectedLines} 行)` : `${selectedChars} 字符`}
          </span>
        )}
        <span>{lineCount} 行</span>
        <span className="code-editor-status-chars">{charCount} 字符</span>
        {!isReadOnly && (
          <>
            <button
              className="code-editor-status-indent"
              onClick={onToggleIndentStyle}
              title={`切换缩进模式（当前: ${indentStyle === 'spaces' ? '空格' : 'Tab'}）`}
            >
              {indentStyle === 'spaces' ? 'Spaces' : 'Tabs'}
            </button>
            <button
              className="code-editor-status-indent"
              onClick={onCycleIndentSize}
              title={`切换缩进宽度（当前: ${indentSize}）`}
            >
              {indentSize}
            </button>
          </>
        )}
        <span className="code-editor-status-shortcut">
          {isReadOnly ? 'Esc 关闭' : 'Ctrl+S 保存 · Esc 关闭'}
        </span>
      </div>

      {/* 操作按钮 */}
      <div className="code-editor-footer-actions">
        {isReadOnly ? (
          <button onClick={onClose} className="code-editor-btn-ghost">关闭</button>
        ) : (
          <>
            <button onClick={onClose} className="code-editor-btn-ghost">
              {hasChanges ? '放弃修改' : '关闭'}
            </button>
            <button
              onClick={onSave}
              disabled={!hasChanges}
              className="code-editor-btn-save"
            >
              <Save className="w-3.5 h-3.5" />
              <span className="code-editor-save-text-desktop">保存修改</span>
              <span className="code-editor-save-text-mobile">保存</span>
            </button>
          </>
        )}
      </div>
    </footer>
  );
});
