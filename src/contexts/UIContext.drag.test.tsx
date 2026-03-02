import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../constants';
import { AppSettings } from '../types';
import { UIProvider, useUIContext } from './UIContext';

const { mockTauriService } = vi.hoisted(() => ({
  mockTauriService: {
    writeClipboard: vi.fn(),
    clickAndPaste: vi.fn(),
    copyFileToClipboard: vi.fn(),
    copyLocalImage: vi.fn(),
    copyBase64Image: vi.fn(),
    downloadAndCopyImage: vi.fn(),
    listenImageDownloadProgress: vi.fn(),
    cancelImageDownload: vi.fn(),
    createImageDownloadRequestId: vi.fn(),
    getPosition: vi.fn(),
    moveOffScreen: vi.fn(),
    setPosition: vi.fn(),
    showWindow: vi.fn(),
    hideWindow: vi.fn(),
    showDownloadHud: vi.fn(),
    hideDownloadHud: vi.fn(),
    positionDownloadHudNearCursor: vi.fn(),
    pasteText: vi.fn(),
  },
}));

vi.mock('../services/tauri', () => ({
  isTauri: true,
  TauriService: mockTauriService,
}));

describe('UIContext drag flow', () => {
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    hideOnDrag: false,
    hideAfterDrag: false,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockTauriService.writeClipboard.mockResolvedValue(undefined);
    mockTauriService.clickAndPaste.mockResolvedValue(undefined);
    mockTauriService.copyFileToClipboard.mockResolvedValue(undefined);
    mockTauriService.cancelImageDownload.mockResolvedValue(true);
    mockTauriService.createImageDownloadRequestId.mockReturnValue('req-test-1');
    mockTauriService.listenImageDownloadProgress.mockImplementation(async () => () => {});
    mockTauriService.getPosition.mockResolvedValue(null);
    mockTauriService.moveOffScreen.mockResolvedValue(undefined);
    mockTauriService.setPosition.mockResolvedValue(undefined);
    mockTauriService.showWindow.mockResolvedValue(undefined);
    mockTauriService.hideWindow.mockResolvedValue(undefined);
    mockTauriService.showDownloadHud.mockResolvedValue(undefined);
    mockTauriService.hideDownloadHud.mockResolvedValue(undefined);
    mockTauriService.positionDownloadHudNearCursor.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    vi.useRealTimers();
  });

  function renderWithProbe() {
    let ctx: ReturnType<typeof useUIContext> | null = null;

    function Probe() {
      ctx = useUIContext();
      return null;
    }

    render(
      <UIProvider settings={settings}>
        <Probe />
      </UIProvider>,
    );

    if (!ctx) {
      throw new Error('UIContext 未初始化');
    }

    return ctx;
  }

  it('文件列表拖拽应复用注入 copyToClipboard 策略并走模拟按键粘贴链路', async () => {
    const ctx = renderWithProbe();
    const mockCopyToClipboard = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      await ctx.handleDragStart(
        {} as React.DragEvent,
        '[FILES]\nC:\\A\\one.png\nC:\\B\\two.jpg',
        mockCopyToClipboard,
      );
      await ctx.handleDragEnd();
    });

    expect(mockTauriService.copyFileToClipboard).not.toHaveBeenCalled();
    expect(mockCopyToClipboard).toHaveBeenCalledWith(expect.objectContaining({
      text: '[FILES]\nC:\\A\\one.png\nC:\\B\\two.jpg',
    }));
    expect(mockTauriService.clickAndPaste).toHaveBeenCalledTimes(1);
  });

  it('普通文件路径拖拽不走 copyFileToClipboard，只走模拟按键粘贴链路', async () => {
    const ctx = renderWithProbe();

    await act(async () => {
      await ctx.handleDragStart(
        {} as React.DragEvent,
        'C:\\Temp\\demo.txt',
        vi.fn().mockResolvedValue(undefined),
      );
      await ctx.handleDragEnd();
    });

    expect(mockTauriService.copyFileToClipboard).not.toHaveBeenCalled();
    expect(mockTauriService.writeClipboard).toHaveBeenCalledWith('C:\\Temp\\demo.txt');
    expect(mockTauriService.clickAndPaste).toHaveBeenCalledTimes(1);
  });

  it('下载进度事件 failed + E_CANCELLED 应按取消处理，不展示错误', async () => {
    let progressHandler: ((payload: {
      request_id: string;
      progress: number;
      downloaded_bytes: number;
      total_bytes: number | null;
      status: 'downloading' | 'completed' | 'cancelled' | 'failed';
      error_code?: string;
      stage?: string;
      error_message?: string;
    }) => void) | null = null;

    mockTauriService.listenImageDownloadProgress.mockImplementation(async (handler: typeof progressHandler) => {
      progressHandler = handler;
      return () => {};
    });

    let resolveDownload: (() => void) | null = null;
    mockTauriService.downloadAndCopyImage.mockImplementation(
      () => new Promise<void>((resolve) => { resolveDownload = resolve; }),
    );

    const ctx = renderWithProbe();

    await act(async () => {
      await ctx.handleDragStart(
        {} as React.DragEvent,
        'https://example.com/demo.png',
        vi.fn().mockResolvedValue(undefined),
      );
    });

    await act(async () => {
      const dragEndPromise = ctx.handleDragEnd();
      await Promise.resolve();
      if (!progressHandler) {
        throw new Error('进度监听器未注册');
      }

      progressHandler({
        request_id: 'req-test-1',
        progress: 20,
        downloaded_bytes: 1024,
        total_bytes: 4096,
        status: 'failed',
        error_code: 'E_CANCELLED',
        stage: 'unknown',
        error_message: '操作已取消',
      });

      if (!resolveDownload) {
        throw new Error('下载 Promise 未就绪');
      }
      resolveDownload();
      await dragEndPromise;
      await vi.runAllTimersAsync();
    });

    expect(ctx.downloadState.error).toBeNull();
    expect(ctx.downloadState.isDownloading).toBe(false);
  });

  it('无拖拽活跃请求时也应响应下载进度事件并显示下载提示', async () => {
    let progressHandler: ((payload: {
      request_id: string;
      progress: number;
      downloaded_bytes: number;
      total_bytes: number | null;
      status: 'downloading' | 'completed' | 'cancelled' | 'failed';
      error_code?: string;
      stage?: string;
      error_message?: string;
    }) => void) | null = null;

    mockTauriService.listenImageDownloadProgress.mockImplementation(async (handler: typeof progressHandler) => {
      progressHandler = handler;
      return () => {};
    });

    let latestState = { isDownloading: false, progress: 0, error: null as string | null };
    function Probe() {
      const ctx = useUIContext();
      latestState = ctx.downloadState;
      return null;
    }

    render(
      <UIProvider settings={settings}>
        <Probe />
      </UIProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      if (!progressHandler) {
        throw new Error('进度监听器未注册');
      }

      progressHandler({
        request_id: 'req-copy-button-1',
        progress: 35,
        downloaded_bytes: 1536,
        total_bytes: 4096,
        status: 'downloading',
      });
    });

    expect(latestState.isDownloading).toBe(true);
    expect(latestState.progress).toBe(35);
    expect(latestState.error).toBeNull();

    await act(async () => {
      if (!progressHandler) return;
      progressHandler({
        request_id: 'req-copy-button-1',
        progress: 100,
        downloaded_bytes: 4096,
        total_bytes: 4096,
        status: 'completed',
      });
    });

    expect(latestState.isDownloading).toBe(false);
  });

  it('开启 prefetchImageOnDragStart 时，拖拽开始预取且拖拽结束不重复下载', async () => {
    const prefetchSettings: AppSettings = {
      ...settings,
      prefetchImageOnDragStart: true,
    };

    let progressHandler: ((payload: {
      request_id: string;
      progress: number;
      downloaded_bytes: number;
      total_bytes: number | null;
      status: 'downloading' | 'completed' | 'cancelled' | 'failed';
      error_code?: string;
      stage?: string;
      error_message?: string;
    }) => void) | null = null;

    mockTauriService.listenImageDownloadProgress.mockImplementation(async (handler: typeof progressHandler) => {
      progressHandler = handler;
      return () => {};
    });

    mockTauriService.downloadAndCopyImage.mockImplementation(async (_url: string, requestId: string) => {
      progressHandler?.({
        request_id: requestId,
        progress: 15,
        downloaded_bytes: 512,
        total_bytes: 4096,
        status: 'downloading',
      });

      progressHandler?.({
        request_id: requestId,
        progress: 100,
        downloaded_bytes: 4096,
        total_bytes: 4096,
        status: 'completed',
      });
    });

    let ctx: ReturnType<typeof useUIContext> | null = null;
    function Probe() {
      ctx = useUIContext();
      return null;
    }

    render(
      <UIProvider settings={prefetchSettings}>
        <Probe />
      </UIProvider>,
    );

    if (!ctx) throw new Error('UIContext 未初始化');

    await act(async () => {
      await ctx!.handleDragStart(
        {} as React.DragEvent,
        'https://example.com/prefetch.png',
        vi.fn().mockResolvedValue(undefined),
      );
    });

    await act(async () => {
      await ctx!.handleDragEnd();
      await vi.runAllTimersAsync();
    });

    expect(mockTauriService.downloadAndCopyImage).toHaveBeenCalledTimes(1);
    expect(mockTauriService.clickAndPaste).toHaveBeenCalledTimes(1);
    expect(ctx!.downloadState.error).toBeNull();
  });

  it('预取已完成后释放鼠标不应显示下载 HUD', async () => {
    const prefetchSettings: AppSettings = {
      ...settings,
      hideOnDrag: true,
      showDragDownloadHud: true,
      prefetchImageOnDragStart: true,
    };

    let progressHandler: ((payload: {
      request_id: string;
      progress: number;
      downloaded_bytes: number;
      total_bytes: number | null;
      status: 'downloading' | 'completed' | 'cancelled' | 'failed';
      error_code?: string;
      stage?: string;
      error_message?: string;
    }) => void) | null = null;

    mockTauriService.listenImageDownloadProgress.mockImplementation(async (handler: typeof progressHandler) => {
      progressHandler = handler;
      return () => {};
    });

    mockTauriService.downloadAndCopyImage.mockImplementation(async (_url: string, requestId: string) => {
      progressHandler?.({
        request_id: requestId,
        progress: 100,
        downloaded_bytes: 4096,
        total_bytes: 4096,
        status: 'completed',
      });
    });

    let ctx: ReturnType<typeof useUIContext> | null = null;
    function Probe() {
      ctx = useUIContext();
      return null;
    }

    render(
      <UIProvider settings={prefetchSettings}>
        <Probe />
      </UIProvider>,
    );

    if (!ctx) throw new Error('UIContext 未初始化');

    await act(async () => {
      await ctx!.handleDragStart(
        {} as React.DragEvent,
        'https://example.com/prefetch-completed.png',
        vi.fn().mockResolvedValue(undefined),
      );
    });

    await act(async () => {
      await ctx!.handleDragEnd();
      await vi.runAllTimersAsync();
    });

    expect(mockTauriService.downloadAndCopyImage).toHaveBeenCalledTimes(1);
    expect(mockTauriService.showDownloadHud).not.toHaveBeenCalled();
    expect(mockTauriService.clickAndPaste).toHaveBeenCalledTimes(1);
  });

  it('预取失败时仅回退一次文本复制，不触发二次下载', async () => {
    const prefetchSettings: AppSettings = {
      ...settings,
      prefetchImageOnDragStart: true,
    };

    let rejectDownload: ((reason?: unknown) => void) | null = null;
    mockTauriService.downloadAndCopyImage.mockImplementation(
      () => new Promise<void>((_resolve, reject) => { rejectDownload = reject; }),
    );

    let ctx: ReturnType<typeof useUIContext> | null = null;
    function Probe() {
      ctx = useUIContext();
      return null;
    }

    render(
      <UIProvider settings={prefetchSettings}>
        <Probe />
      </UIProvider>,
    );

    if (!ctx) throw new Error('UIContext 未初始化');

    await act(async () => {
      await ctx!.handleDragStart(
        {} as React.DragEvent,
        'https://example.com/prefetch-failed.png',
        vi.fn().mockResolvedValue(undefined),
      );
    });

    await act(async () => {
      const dragEndPromise = ctx!.handleDragEnd();
      await Promise.resolve();

      if (!rejectDownload) {
        throw new Error('预取下载 Promise 未就绪');
      }

      rejectDownload({
        code: 'E_NET_REQUEST',
        stage: 'download',
        message: '网络波动',
      });

      await dragEndPromise;
      await vi.runAllTimersAsync();
    });

    expect(mockTauriService.downloadAndCopyImage).toHaveBeenCalledTimes(1);
    expect(mockTauriService.writeClipboard).toHaveBeenCalledTimes(1);
    expect(mockTauriService.writeClipboard).toHaveBeenCalledWith('https://example.com/prefetch-failed.png');
    expect(mockTauriService.clickAndPaste).toHaveBeenCalledTimes(1);
    expect(ctx!.downloadState.error).toContain('图片下载失败');
  });
});
