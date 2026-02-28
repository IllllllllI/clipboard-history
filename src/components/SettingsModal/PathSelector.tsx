import React from 'react';
import { FolderOpen } from 'lucide-react';
import type { PathSelectorProps } from './types';

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
  const clickable = displayPath && displayPath !== '加载中...';

  return (
    <div className="sm-path-selector">
      <p className="sm-path-selector__title">{title}</p>
      <div className="sm-path-selector__row">
        <div
          onClick={onOpen}
          title={displayPath}
          className="sm-path-selector__box"
          data-clickable={clickable ? 'true' : 'false'}
          data-theme={dark ? 'dark' : 'light'}
        >
          <FolderOpen className="sm-path-selector__icon" />
          <span className="sm-path-selector__path">{displayPath}</span>
        </div>
        <button
          disabled={loading}
          onClick={onSelect}
          className="sm-path-selector__btn"
          data-theme={dark ? 'dark' : 'light'}
          data-disabled={loading ? 'true' : 'false'}
        >
          {loading ? '移动中...' : '选择'}
        </button>
        {showReset && (
          <button
            disabled={loading}
            onClick={onReset}
            className="sm-path-selector__btn"
            data-theme={dark ? 'dark' : 'light'}
            data-disabled={loading ? 'true' : 'false'}
            data-variant="danger"
          >
            重置
          </button>
        )}
      </div>
      <div className="sm-path-selector__meta">
        <p className="sm-panel__muted">{description}</p>
        {statusText && <p className="sm-panel__muted">{statusText}</p>}
      </div>
    </div>
  );
});
