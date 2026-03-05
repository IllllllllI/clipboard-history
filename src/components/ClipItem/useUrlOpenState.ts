import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { ImageType } from '../../types';
import { normalizeFilePath } from '../../utils';
import { TauriService } from '../../services/tauri';

// ─── 常量 ────────────────────────────────────────────────────────────────────
/** 延迟展示 "正在打开" 反馈，避免快速操作闪烁 */
const OPENING_FEEDBACK_DELAY_MS = 180;
/** 成功状态展示时长 */
const SUCCESS_DISPLAY_MS = 1000;
/** 错误状态展示时长 */
const ERROR_DISPLAY_MS = 1400;

// ─── 类型 ────────────────────────────────────────────────────────────────────
export type OpenPhase = 'idle' | 'opening' | 'success' | 'error';

export interface UrlOpenController {
  openPhase: OpenPhase;
  statusLabel: string;
  handleDoubleClick: (e: React.MouseEvent) => void;
}

// ─── 纯函数 ──────────────────────────────────────────────────────────────────
const ACTIVE_PHASE_LABELS: Record<Exclude<OpenPhase, 'idle'>, string> = {
  opening: '正在打开...',
  success: '已打开',
  error: '打开失败',
};

function getStatusLabel(phase: OpenPhase, imageType: ImageType): string {
  if (phase !== 'idle') return ACTIVE_PHASE_LABELS[phase];
  return imageType === ImageType.LocalFile ? '双击打开文件' : '双击打开链接';
}

export function buildOpenTargetTitle(prefix: string, value: string, statusLabel: string): string {
  return `${prefix}${value}\n${statusLabel}`;
}

// ─── Timer 管理（纯函数，零 React 开销） ─────────────────────────────────────
interface Timers {
  feedback: ReturnType<typeof setTimeout> | null;
  reset: ReturnType<typeof setTimeout> | null;
}

function clearTimers(t: Timers): void {
  if (t.feedback !== null) { clearTimeout(t.feedback); t.feedback = null; }
  if (t.reset !== null) { clearTimeout(t.reset); t.reset = null; }
}

// ─── Hook ────────────────────────────────────────────────────────────────────
/**
 * 管理 URL / 本地文件打开的异步状态流：idle → opening → success | error → idle
 *
 * 改进点（相比原实现）：
 * - **竞态安全**：generation 计数器丢弃过期异步回调的状态更新
 * - **内存**：两个 timer 合并为单个 ref 对象；清理逻辑提取为纯函数，无 useCallback 开销
 * - **性能**：statusLabel 使用 useMemo 避免无关渲染的重复计算
 * - **结构**：消除回调内部嵌套函数，timer 管理与状态逻辑解耦
 */
export function useUrlOpenState(imageType: ImageType, trimmedText: string): UrlOpenController {
  const [phase, setPhase] = useState<OpenPhase>('idle');
  const timersRef = useRef<Timers>({ feedback: null, reset: null });
  /** 递增计数器，用于使过期异步结果短路 */
  const genRef = useRef(0);

  // 卸载时清理所有 timer
  useEffect(() => () => clearTimers(timersRef.current), []);

  const openResource = useCallback(async () => {
    const gen = ++genRef.current;
    const timers = timersRef.current;
    clearTimers(timers);

    // 仅在操作耗时 > OPENING_FEEDBACK_DELAY_MS 时才显示 "正在打开"
    timers.feedback = setTimeout(() => {
      if (gen === genRef.current) setPhase('opening');
      timers.feedback = null;
    }, OPENING_FEEDBACK_DELAY_MS);

    try {
      if (imageType === ImageType.LocalFile) {
        await TauriService.openFile(normalizeFilePath(trimmedText));
      } else {
        await TauriService.openPath(trimmedText);
      }
      // 丢弃过期结果
      if (gen !== genRef.current) return;
      clearTimers(timers);
      setPhase('success');
      timers.reset = setTimeout(() => {
        if (gen === genRef.current) setPhase('idle');
        timers.reset = null;
      }, SUCCESS_DISPLAY_MS);
    } catch (error) {
      if (gen !== genRef.current) return;
      clearTimers(timers);
      setPhase('error');
      timers.reset = setTimeout(() => {
        if (gen === genRef.current) setPhase('idle');
        timers.reset = null;
      }, ERROR_DISPLAY_MS);
      console.warn('Failed to open resource:', trimmedText, error);
    }
  }, [imageType, trimmedText]);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      void openResource();
    },
    [openResource],
  );

  const statusLabel = useMemo(() => getStatusLabel(phase, imageType), [phase, imageType]);

  return { openPhase: phase, statusLabel, handleDoubleClick };
}
