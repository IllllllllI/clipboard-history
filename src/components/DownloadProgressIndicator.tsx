import React from 'react';
import { Loader2, XCircle } from 'lucide-react';
import { DownloadState } from '../types';

interface DownloadProgressIndicatorProps {
  downloadState: DownloadState;
}

export const DownloadProgressIndicator = React.memo(function DownloadProgressIndicator({
  downloadState,
}: DownloadProgressIndicatorProps) {
  if (!downloadState.isDownloading && !downloadState.error) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-neutral-800 rounded-lg shadow-lg p-4 min-w-[280px] max-w-[400px] border border-neutral-200 dark:border-neutral-700">
      {downloadState.isDownloading && (
        <div className="flex items-center space-x-3">
          <Loader2 className="animate-spin h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              正在下载图片...
            </p>
            {downloadState.progress > 0 && (
              <div className="mt-2">
                <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
                  <div
                    className="bg-indigo-600 dark:bg-indigo-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${downloadState.progress}%` }}
                  />
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  {downloadState.progress}%
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {downloadState.error && (
        <div className="flex items-start space-x-3">
          <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900 dark:text-red-100">
              下载失败
            </p>
            <p className="text-xs text-red-700 dark:text-red-300 mt-1">
              {downloadState.error}
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
              已回退到复制文本
            </p>
          </div>
        </div>
      )}
    </div>
  );
});
