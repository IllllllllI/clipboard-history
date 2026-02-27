import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    getPosition: vi.fn(),
    moveOffScreen: vi.fn(),
    setPosition: vi.fn(),
    showWindow: vi.fn(),
    hideWindow: vi.fn(),
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
    vi.clearAllMocks();
    mockTauriService.writeClipboard.mockResolvedValue(undefined);
    mockTauriService.clickAndPaste.mockResolvedValue(undefined);
    mockTauriService.copyFileToClipboard.mockResolvedValue(undefined);
    mockTauriService.getPosition.mockResolvedValue(null);
    mockTauriService.moveOffScreen.mockResolvedValue(undefined);
    mockTauriService.setPosition.mockResolvedValue(undefined);
    mockTauriService.showWindow.mockResolvedValue(undefined);
    mockTauriService.hideWindow.mockResolvedValue(undefined);
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

  it('文件列表拖拽不走 copyFileToClipboard，只走模拟按键粘贴链路', async () => {
    const ctx = renderWithProbe();

    await act(async () => {
      await ctx.handleDragStart(
        {} as React.DragEvent,
        '[FILES]\nC:\\A\\one.png\nC:\\B\\two.jpg',
        vi.fn().mockResolvedValue(undefined),
      );
      await ctx.handleDragEnd();
    });

    expect(mockTauriService.copyFileToClipboard).not.toHaveBeenCalled();
    expect(mockTauriService.writeClipboard).toHaveBeenCalledWith('C:\\A\\one.png\nC:\\B\\two.jpg');
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
});
