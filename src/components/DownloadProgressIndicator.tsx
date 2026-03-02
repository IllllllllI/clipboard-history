import React, { useEffect } from 'react';
import { Loader2, XCircle, X } from 'lucide-react';
import { DownloadState } from '../types';
import './styles/download-progress-indicator.css';

interface DownloadProgressIndicatorProps {
  downloadState: DownloadState;
  darkMode: boolean;
  onClose: () => void;
}

export const DownloadProgressIndicator = React.memo(function DownloadProgressIndicator({
  downloadState,
  darkMode,
  onClose,
}: DownloadProgressIndicatorProps) {
  const isClipboardBusyError = !!downloadState.error && downloadState.error.includes('剪贴板被占用');

  useEffect(() => {
    if (!downloadState.error || downloadState.isDownloading) return;

    const timer = window.setTimeout(() => {
      onClose();
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [downloadState.error, downloadState.isDownloading, onClose]);

  if (!downloadState.isDownloading && !downloadState.error) {
    return null;
  }

  return (
    <div className="download-progress" data-theme={darkMode ? 'dark' : 'light'}>
      {!downloadState.isDownloading && downloadState.error && (
        <button
          type="button"
          className="download-progress__close-btn"
          onClick={onClose}
          title="关闭通知"
          aria-label="关闭通知"
        >
          <X className="download-progress__close-icon" />
        </button>
      )}

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
              {isClipboardBusyError ? '剪贴板暂时被占用' : '下载失败'}
            </p>
            <p className="download-progress__error-message">
              {downloadState.error}
            </p>
            <p className="download-progress__fallback-note">
              {isClipboardBusyError ? '建议稍后重试复制' : '已回退到复制文本'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
});
