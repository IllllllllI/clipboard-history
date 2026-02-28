import React from 'react';
import { Loader2, XCircle } from 'lucide-react';
import { DownloadState } from '../types';
import './styles/download-progress-indicator.css';

interface DownloadProgressIndicatorProps {
  downloadState: DownloadState;
  darkMode: boolean;
}

export const DownloadProgressIndicator = React.memo(function DownloadProgressIndicator({
  downloadState,
  darkMode,
}: DownloadProgressIndicatorProps) {
  if (!downloadState.isDownloading && !downloadState.error) {
    return null;
  }

  return (
    <div className="download-progress" data-theme={darkMode ? 'dark' : 'light'}>
      {downloadState.isDownloading && (
        <div className="download-progress__row">
          <Loader2 className="download-progress__spinner" />
          <div className="download-progress__body">
            <p className="download-progress__title">
              正在下载图片...
            </p>
            {downloadState.progress > 0 && (
              <div className="download-progress__meter-wrap">
                <div className="download-progress__meter-row">
                  <div className="download-progress__meter-bg">
                    <div
                      className="download-progress__meter-fill"
                      style={{ width: `${downloadState.progress}%` }}
                    />
                  </div>
                  <p className="download-progress__percent">
                    {downloadState.progress}%
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {downloadState.error && (
        <div className="download-progress__row download-progress__row--error">
          <XCircle className="download-progress__error-icon" />
          <div className="download-progress__body">
            <p className="download-progress__error-title">
              下载失败
            </p>
            <p className="download-progress__error-message">
              {downloadState.error}
            </p>
            <p className="download-progress__fallback-note">
              已回退到复制文本
            </p>
          </div>
        </div>
      )}
    </div>
  );
});
