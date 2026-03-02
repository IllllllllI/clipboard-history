import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettings } from './useSettings';

const { mockSetTheme, mockTauriService } = vi.hoisted(() => ({
  mockSetTheme: vi.fn(),
  mockTauriService: {
    getAppSettings: vi.fn(),
    setAppSettings: vi.fn(),
    setImagePerformanceProfile: vi.fn(),
    setImageAdvancedConfig: vi.fn(),
  },
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    setTheme: mockSetTheme,
  }),
}));

vi.mock('../services/tauri', () => ({
  TauriService: mockTauriService,
}));

describe('useSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockTauriService.getAppSettings.mockResolvedValue(null);
    mockTauriService.setAppSettings.mockResolvedValue(undefined);
    mockTauriService.setImagePerformanceProfile.mockResolvedValue(undefined);
    mockTauriService.setImageAdvancedConfig.mockResolvedValue(undefined);
  });

  it('启动时从后端应用设置回填', async () => {
    mockTauriService.getAppSettings.mockResolvedValue({
      imagePerformanceProfile: 'speed',
      allowPrivateNetwork: true,
      resolveDnsForUrlSafety: false,
      maxDecodedBytes: 64 * 1024 * 1024,
      imageConnectTimeout: 6,
      imageFirstByteTimeoutMs: 9000,
      imageChunkTimeoutMs: 12000,
      imageClipboardRetryMaxTotalMs: 2200,
      imageClipboardRetryMaxDelayMs: 800,
    });

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.settings.imagePerformanceProfile).toBe('speed');
      expect(result.current.settings.allowPrivateNetwork).toBe(true);
      expect(result.current.settings.resolveDnsForUrlSafety).toBe(false);
      expect(result.current.settings.maxDecodedBytes).toBe(64 * 1024 * 1024);
      expect(result.current.settings.imageConnectTimeout).toBe(6);
      expect(result.current.settings.imageFirstByteTimeoutMs).toBe(9000);
      expect(result.current.settings.imageChunkTimeoutMs).toBe(12000);
      expect(result.current.settings.imageClipboardRetryMaxTotalMs).toBe(2200);
      expect(result.current.settings.imageClipboardRetryMaxDelayMs).toBe(800);
    });

    expect(mockTauriService.getAppSettings).toHaveBeenCalledTimes(1);
  });

  it('设置变更后会写入后端并同步图片配置', async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(mockTauriService.getAppSettings).toHaveBeenCalledTimes(1);
    });

    mockTauriService.setAppSettings.mockClear();
    mockTauriService.setImagePerformanceProfile.mockClear();
    mockTauriService.setImageAdvancedConfig.mockClear();

    act(() => {
      result.current.updateSettings({
        imagePerformanceProfile: 'quality',
        allowPrivateNetwork: true,
        resolveDnsForUrlSafety: false,
        maxDecodedBytes: 96 * 1024 * 1024,
        imageConnectTimeout: 7,
        imageFirstByteTimeoutMs: 11000,
        imageChunkTimeoutMs: 14000,
        imageClipboardRetryMaxTotalMs: 2600,
        imageClipboardRetryMaxDelayMs: 700,
      });
    });

    await waitFor(() => {
      expect(mockTauriService.setAppSettings).toHaveBeenCalled();
      expect(mockTauriService.setImagePerformanceProfile).toHaveBeenCalledWith('quality');
      expect(mockTauriService.setImageAdvancedConfig).toHaveBeenCalledWith({
        allow_private_network: true,
        resolve_dns_for_url_safety: false,
        max_decoded_bytes: 96 * 1024 * 1024,
        connect_timeout: 7,
        stream_first_byte_timeout_ms: 11000,
        stream_chunk_timeout_ms: 14000,
        clipboard_retry_max_total_ms: 2600,
        clipboard_retry_max_delay_ms: 700,
      });
    });
  });
});
