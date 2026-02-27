import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettings } from './useSettings';

const { mockSetTheme, mockTauriService } = vi.hoisted(() => ({
  mockSetTheme: vi.fn(),
  mockTauriService: {
    getImagePerformanceProfile: vi.fn(),
    setImagePerformanceProfile: vi.fn(),
    getImageAdvancedConfig: vi.fn(),
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
    localStorage.clear();

    mockTauriService.getImagePerformanceProfile.mockResolvedValue('balanced');
    mockTauriService.getImageAdvancedConfig.mockResolvedValue({
      allow_private_network: false,
      resolve_dns_for_url_safety: true,
      max_decoded_bytes: 160 * 1024 * 1024,
    });
    mockTauriService.setImagePerformanceProfile.mockResolvedValue(undefined);
    mockTauriService.setImageAdvancedConfig.mockResolvedValue(undefined);
  });

  it('启动时从后端回填性能档位与高级配置', async () => {
    mockTauriService.getImagePerformanceProfile.mockResolvedValue('speed');
    mockTauriService.getImageAdvancedConfig.mockResolvedValue({
      allow_private_network: true,
      resolve_dns_for_url_safety: false,
      max_decoded_bytes: 64 * 1024 * 1024,
    });

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.settings.imagePerformanceProfile).toBe('speed');
      expect(result.current.settings.allowPrivateNetwork).toBe(true);
      expect(result.current.settings.resolveDnsForUrlSafety).toBe(false);
      expect(result.current.settings.maxDecodedBytes).toBe(64 * 1024 * 1024);
    });

    expect(mockTauriService.getImagePerformanceProfile).toHaveBeenCalledTimes(1);
    expect(mockTauriService.getImageAdvancedConfig).toHaveBeenCalledTimes(1);
  });

  it('设置变更后会下发性能档位与高级配置到后端', async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(mockTauriService.getImagePerformanceProfile).toHaveBeenCalledTimes(1);
      expect(mockTauriService.getImageAdvancedConfig).toHaveBeenCalledTimes(1);
    });

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
      expect(mockTauriService.setImagePerformanceProfile).toHaveBeenCalledWith('quality');
      expect(mockTauriService.setImageAdvancedConfig).toHaveBeenCalledWith({
        allow_private_network: true,
        resolve_dns_for_url_safety: false,
        max_decoded_bytes: 96 * 1024 * 1024,
      });
    });
  });
});
