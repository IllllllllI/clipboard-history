import React from 'react';
import { FolderOpen } from 'lucide-react';
import type { PathSelectorProps } from './types';

const secondaryBtnClass = (dark: boolean) =>
  `px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${dark ? 'bg-neutral-800 hover:bg-neutral-700' : 'bg-neutral-100 hover:bg-neutral-200'}`;

const inputBoxClass = (dark: boolean) =>
  `px-3 py-2 rounded-lg text-sm border ${dark ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-200 text-neutral-900'}`;

export const PathSelector = React.memo(function PathSelector({
  dark,
  title,
  description,
  displayPath,
  statusText,
  loading,
  showReset,
  onOpen,
  onSelect,
  onReset,
}: PathSelectorProps) {
  return (
    <div className="space-y-2">
      <p className="font-medium text-sm">{title}</p>
      <div className="flex gap-2">
        <div
          onClick={onOpen}
          title={displayPath}
          className={`flex-1 truncate flex items-center gap-1.5 ${
            displayPath && displayPath !== '加载中...' ? 'cursor-pointer hover:opacity-80' : ''
          } ${inputBoxClass(dark)}`}
        >
          <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
          <span className="truncate">{displayPath}</span>
        </div>
        <button
          disabled={loading}
          onClick={onSelect}
          className={`${secondaryBtnClass(dark)} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {loading ? '移动中...' : '选择'}
        </button>
        {showReset && (
          <button
            disabled={loading}
            onClick={onReset}
            className={`${secondaryBtnClass(dark)} text-red-500 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            重置
          </button>
        )}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">{description}</p>
        {statusText && <p className="text-xs text-neutral-500">{statusText}</p>}
      </div>
    </div>
  );
});
