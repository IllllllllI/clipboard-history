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
    <div
      className={`px-5 py-3 border-t shrink-0 flex justify-between items-center ${
        darkMode ? 'border-neutral-800 bg-[#252526]' : 'border-neutral-100 bg-neutral-50'
      }`}
    >
      {/* 状态信息 */}
      <div className="flex items-center gap-4 text-[11px] text-neutral-500 font-mono">
        <span>{lineCount} 行</span>
        <span>{charCount} 字符</span>
        <span>Tab: 4 空格</span>
        <span>Ctrl+S 保存 · Esc 关闭</span>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button
          onClick={onClose}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            darkMode
              ? 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700'
              : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
          }`}
        >
          放弃修改
        </button>
        <button
          onClick={onSave}
          disabled={!hasChanges}
          className={`px-5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
            hasChanges
              ? 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
              : darkMode
                ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
          }`}
        >
          <Save className="w-3.5 h-3.5" />
          保存修改
        </button>
      </div>
    </div>
  );
});
