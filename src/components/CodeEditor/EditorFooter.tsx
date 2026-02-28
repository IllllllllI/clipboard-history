import React from 'react';
import { Save } from 'lucide-react';

interface EditorFooterProps {
  darkMode: boolean;
  lineCount: number;
  charCount: number;
  hasChanges: boolean;
  onClose: () => void;
  onSave: () => void;
}

/** 编辑器底部状态栏 + 操作按钮 */
export const EditorFooter = React.memo(function EditorFooter({
  darkMode,
  lineCount,
  charCount,
  hasChanges,
  onClose,
  onSave,
}: EditorFooterProps) {
  return (
    <div className="code-editor-footer" data-theme={darkMode ? 'dark' : 'light'}>
      {/* 状态信息 */}
      <div className="code-editor-status">
        <span>{lineCount} 行</span>
        <span>{charCount} 字符</span>
        <span className="code-editor-status-tab">Tab: 4 空格</span>
        <span className="code-editor-status-shortcut">Ctrl+S 保存 · Esc 关闭</span>
      </div>

      {/* 操作按钮 */}
      <div className="code-editor-footer-actions">
        <button
          onClick={onClose}
          className="code-editor-btn-ghost"
        >
          放弃修改
        </button>
        <button
          onClick={onSave}
          disabled={!hasChanges}
          className="code-editor-btn-save"
          data-enabled={hasChanges ? 'true' : 'false'}
        >
          <Save className="w-3.5 h-3.5" />
          <span className="code-editor-save-text-desktop">保存修改</span>
          <span className="code-editor-save-text-mobile">保存</span>
        </button>
      </div>
    </div>
  );
});
