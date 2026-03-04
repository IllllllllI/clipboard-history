import { useState, useRef, useCallback, useEffect } from 'react';
import { ImageType } from '../../types';
import { normalizeFilePath } from '../../utils';
import { TauriService } from '../../services/tauri';

const URL_OPENING_DELAY_MS = 180;
const URL_SUCCESS_RESET_DELAY_MS = 1000;
const URL_ERROR_RESET_DELAY_MS = 1400;

export type UrlOpenState = 'idle' | 'opening' | 'success' | 'error';

function getUrlOpenStatusTitle(state: UrlOpenState, imageType: ImageType): string {
  if (state === 'opening') return '正在打开...';
  if (state === 'success') return '已打开';
  if (state === 'error') return '打开失败';
  return imageType === ImageType.LocalFile ? '双击打开文件' : '双击打开链接';
}

export function buildOpenTargetTitle(prefix: string, value: string, statusTitle: string): string {
  return `${prefix}${value}\n${statusTitle}`;
}

export interface UrlOpenController {
  urlOpenState: UrlOpenState;
  openStatusTitle: string;
  handleUrlDoubleClick: (e: React.MouseEvent) => void;
}

/**
 * 管理 URL/文件打开的异步状态流：idle → opening → success/error → idle
 */
export function useUrlOpenState(imageType: ImageType, trimmedText: string): UrlOpenController {
  const [urlOpenState, setUrlOpenState] = useState<UrlOpenState>('idle');
  const urlOpeningDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlStateResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearUrlStateTimers = useCallback(() => {
    if (urlOpeningDelayTimerRef.current) {
      clearTimeout(urlOpeningDelayTimerRef.current);
      urlOpeningDelayTimerRef.current = null;
    }
    if (urlStateResetTimerRef.current) {
      clearTimeout(urlStateResetTimerRef.current);
      urlStateResetTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearUrlStateTimers(), [clearUrlStateTimers]);

  const openUrlWithStatus = useCallback(async () => {
    const scheduleUrlStateReset = (state: UrlOpenState, delayMs: number) => {
      setUrlOpenState(state);
      urlStateResetTimerRef.current = setTimeout(() => {
        setUrlOpenState('idle');
        urlStateResetTimerRef.current = null;
      }, delayMs);
    };

    clearUrlStateTimers();
    urlOpeningDelayTimerRef.current = setTimeout(() => {
      setUrlOpenState('opening');
      urlOpeningDelayTimerRef.current = null;
    }, URL_OPENING_DELAY_MS);

    try {
      if (imageType === ImageType.LocalFile) {
        await TauriService.openFile(normalizeFilePath(trimmedText));
      } else {
        await TauriService.openPath(trimmedText);
      }
      clearUrlStateTimers();
      scheduleUrlStateReset('success', URL_SUCCESS_RESET_DELAY_MS);
    } catch (error) {
      clearUrlStateTimers();
      scheduleUrlStateReset('error', URL_ERROR_RESET_DELAY_MS);
      console.warn('Open url failed:', trimmedText, error);
    }
  }, [clearUrlStateTimers, imageType, trimmedText]);

  const handleUrlDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      void openUrlWithStatus();
    },
    [openUrlWithStatus],
  );

  const openStatusTitle = getUrlOpenStatusTitle(urlOpenState, imageType);

  return { urlOpenState, openStatusTitle, handleUrlDoubleClick };
}
