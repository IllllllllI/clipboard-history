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
    });

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.settings.imagePerformanceProfile).toBe('speed');
      expect(result.current.settings.allowPrivateNetwork).toBe(true);
      expect(result.current.settings.resolveDnsForUrlSafety).toBe(false);
      expect(result.current.settings.maxDecodedBytes).toBe(64 * 1024 * 1024);
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
      });
    });

    await waitFor(() => {
      expect(mockTauriService.setAppSettings).toHaveBeenCalled();
      expect(mockTauriService.setImagePerformanceProfile).toHaveBeenCalledWith('quality');
      expect(mockTauriService.setImageAdvancedConfig).toHaveBeenCalledWith({
        allow_private_network: true,
        resolve_dns_for_url_safety: false,
        max_decoded_bytes: 96 * 1024 * 1024,
      });
    });
  });
});
