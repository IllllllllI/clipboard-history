import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { DownloadState } from '../types';
import { toast } from './Toast';
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

  // 将原本组件内维护的错误渲染，转交给全局统筹的 Toast 组件处理，彻底解耦职责
  useEffect(() => {
    if (downloadState.error && !downloadState.isDownloading) {
      const isClipboardBusyError = downloadState.error.includes('剪贴板被占用');
      const title = isClipboardBusyError ? '剪贴板暂时被占用' : '下载失败';
      const fallbackNote = isClipboardBusyError ? '建议稍后重试复制' : '已回退到复制文本';
      
      toast.error(`${title}：${downloadState.error}。${fallbackNote}`, 5000);
      onClose();
    }
  }, [downloadState.error, downloadState.isDownloading, onClose]);

  // 如果没有在下载，组件直接不显示任何内容
  if (!downloadState.isDownloading) {
    return null;
  }

  return (
    <div className="download-progress" data-theme={darkMode ? 'dark' : 'light'}>
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
    </div>
  );
});
