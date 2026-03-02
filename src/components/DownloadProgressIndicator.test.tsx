import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { DownloadProgressIndicator } from './DownloadProgressIndicator';
import type { DownloadState } from '../types';

describe('DownloadProgressIndicator', () => {
  const onClose = vi.fn();

  it('剪贴板占用错误应展示重试引导文案', () => {
    const busyState: DownloadState = {
      isDownloading: false,
      progress: 0,
      error: '剪贴板被占用，请稍后重试: OpenClipboard 失败',
    };

    render(
      <DownloadProgressIndicator
        downloadState={busyState}
        darkMode={false}
        onClose={onClose}
      />,
    );

    expect(screen.getByText('剪贴板暂时被占用')).toBeTruthy();
    expect(screen.getByText('建议稍后重试复制')).toBeTruthy();
  });

  it('普通错误应保持原有回退文案', () => {
    const failedState: DownloadState = {
      isDownloading: false,
      progress: 0,
      error: '图片下载失败: 远端返回 500',
    };

    render(
      <DownloadProgressIndicator
        downloadState={failedState}
        darkMode={false}
        onClose={onClose}
      />,
    );

    expect(screen.getByText('下载失败')).toBeTruthy();
    expect(screen.getByText('已回退到复制文本')).toBeTruthy();
  });
});
