import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../constants';
import type { ClipItem } from '../types';
import { useClipboard } from './useClipboard';

const { mockTauriService } = vi.hoisted(() => ({
  mockTauriService: {
    copyFilesToClipboard: vi.fn(),
    copyFileToClipboard: vi.fn(),
    writeImageBase64: vi.fn(),
    downloadAndCopyImage: vi.fn(),
    writeClipboard: vi.fn(),
    copySvgFromFile: vi.fn(),
    copyLocalImage: vi.fn(),
    copyImageFromFile: vi.fn(),
    createImageDownloadRequestId: vi.fn(() => 'req-test'),
  },
}));

vi.mock('../services/tauri', () => ({
  isTauri: true,
  TauriService: mockTauriService,
}));

describe('useClipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('复制 [FILES] 条目时应调用批量文件复制接口', async () => {
    mockTauriService.copyFilesToClipboard.mockResolvedValue(undefined);

    const settings = { ...DEFAULT_SETTINGS, autoCapture: false };
    const onCaptured = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() => useClipboard(settings, onCaptured, onError));

    const item: ClipItem = {
      id: 1,
      text: '[FILES]\nC:\\A\\1.png\nC:\\B\\2.jpg',
      timestamp: Date.now(),
      is_pinned: 0,
      is_snippet: 0,
      is_favorite: 0,
      tags: [],
      picked_color: null,
    };

    await act(async () => {
      await result.current.copyToClipboard(item);
    });

    expect(mockTauriService.copyFilesToClipboard).toHaveBeenCalledTimes(1);
    expect(mockTauriService.copyFilesToClipboard).toHaveBeenCalledWith([
      'C:\\A\\1.png',
      'C:\\B\\2.jpg',
    ]);
    expect(mockTauriService.copyFileToClipboard).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('复制变体 [FILES] 前缀（CRLF/BOM/小写）时也应调用批量文件复制接口', async () => {
    mockTauriService.copyFilesToClipboard.mockResolvedValue(undefined);

    const settings = { ...DEFAULT_SETTINGS, autoCapture: false };
    const onCaptured = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() => useClipboard(settings, onCaptured, onError));

    const item: ClipItem = {
      id: 2,
      text: '\uFEFF   [files]\r\nC:\\A\\1.png\r\nC:\\B\\2.jpg\r\n',
      timestamp: Date.now(),
      is_pinned: 0,
      is_snippet: 0,
      is_favorite: 0,
      tags: [],
      picked_color: null,
    };

    await act(async () => {
      await result.current.copyToClipboard(item);
    });

    expect(mockTauriService.copyFilesToClipboard).toHaveBeenCalledTimes(1);
    expect(mockTauriService.copyFilesToClipboard).toHaveBeenCalledWith([
      'C:\\A\\1.png',
      'C:\\B\\2.jpg',
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('复制 UI 展示态 [FILES] ↵ payload 时应调用批量文件复制接口', async () => {
    mockTauriService.copyFilesToClipboard.mockResolvedValue(undefined);

    const settings = { ...DEFAULT_SETTINGS, autoCapture: false };
    const onCaptured = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() => useClipboard(settings, onCaptured, onError));

    const item: ClipItem = {
      id: 3,
      text: '[FILES] ↵ C:\\A\\x.png ↵ C:\\B\\y.jpg',
      timestamp: Date.now(),
      is_pinned: 0,
      is_snippet: 0,
      is_favorite: 0,
      tags: [],
      picked_color: null,
    };

    await act(async () => {
      await result.current.copyToClipboard(item);
    });

    expect(mockTauriService.copyFilesToClipboard).toHaveBeenCalledTimes(1);
    expect(mockTauriService.copyFilesToClipboard).toHaveBeenCalledWith([
      'C:\\A\\x.png',
      'C:\\B\\y.jpg',
    ]);
    expect(onError).not.toHaveBeenCalled();
  });
});
