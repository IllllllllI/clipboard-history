import { useEffect, useState } from 'react';
import { Loader2, XCircle, CheckCircle2 } from '../icons';
import { TauriService } from '../../services/tauri';
import { subscribeTauriEvent } from '../subscribe';
import type { ImageDownloadProgressEvent } from '../../types';

// ── 状态定义 ──

type HudStatus = 'idle' | 'downloading' | 'completed' | 'failed' | 'cancelled';

interface HudState {
  status: HudStatus;
  progress: number;
  message?: string;
}

const IDLE_STATE: HudState = { status: 'idle', progress: 0 };
const AUTO_RESET_DELAY_MS = 1200;

// ── 状态映射 ──

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 将后端进度事件映射为 HUD 显示状态（消除初始化与事件处理的逻辑重复） */
function progressToState(p: ImageDownloadProgressEvent): HudState {
  const progress = clamp(p.progress ?? 0, 0, 100);
  switch (p.status) {
    case 'downloading': return { status: 'downloading', progress };
    case 'completed':   return { status: 'completed', progress: 100, message: '下载完成' };
    case 'failed':      return { status: 'failed', progress, message: p.error_message || '下载失败' };
    case 'cancelled':   return { status: 'cancelled', progress: 0, message: '已取消' };
    default:            return IDLE_STATE;
  }
}

/** 终态：completed / failed / cancelled → 触发自动重置 */
function isTerminalStatus(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

const STATUS_TITLE: Record<Exclude<HudStatus, 'idle'>, string> = {
  downloading: '下载图片中',
  completed:   '下载完成',
  failed:      '下载失败',
  cancelled:   '已取消',
};

// ── 组件 ──

export default function DownloadHudApp({ initialProgress }: { initialProgress?: ImageDownloadProgressEvent | null }) {
  const [state, setState] = useState<HudState>(() =>
    initialProgress ? progressToState(initialProgress) : IDLE_STATE,
  );
  const [visible, setVisible] = useState(initialProgress ? true : false);

  useEffect(() => {
    let autoResetTimer: number | null = null;
    let hideTimer: number | null = null;

    const cleanup = subscribeTauriEvent(TauriService.listenImageDownloadProgress, (payload: ImageDownloadProgressEvent) => {
      const newState = progressToState(payload);
      setState(newState);
      setVisible(true);

      if (hideTimer) clearTimeout(hideTimer);
      if (autoResetTimer) clearTimeout(autoResetTimer);

      if (isTerminalStatus(payload.status)) {
        // 先触发隐藏动画
        hideTimer = window.setTimeout(() => setVisible(false), AUTO_RESET_DELAY_MS);
        // 等待动画结束后完全回归 IDLE 状态 (动画耗时约 400ms)
        autoResetTimer = window.setTimeout(() => setState(IDLE_STATE), AUTO_RESET_DELAY_MS + 400);
      }
    });

    return () => {
      cleanup();
      if (hideTimer) clearTimeout(hideTimer);
      if (autoResetTimer) clearTimeout(autoResetTimer);
    };
  }, []);

  if (state.status === 'idle') {
    return <div className="hud-root" aria-hidden="true" />;
  }

  return (
    <div className="hud-root" role="alert" aria-live="polite">
      <div className="hud-card" data-status={state.status} data-state={visible ? 'visible' : 'hidden'}>
        <div className="hud-icon-wrap" aria-hidden="true">
          {state.status === 'downloading' && <Loader2 className="hud-icon hud-spin" />}
          {state.status === 'completed' && <CheckCircle2 className="hud-icon" />}
          {(state.status === 'failed' || state.status === 'cancelled') && <XCircle className="hud-icon" />}
        </div>

        <div className="hud-body">
          <p className="hud-title">{STATUS_TITLE[state.status as Exclude<HudStatus, 'idle'>]}</p>

          <div className="hud-meter-bg" aria-hidden="true">
            <div className="hud-meter-fill" style={{ width: `${state.progress}%` }} />
          </div>

          <p className="hud-subtitle">
            {state.status === 'downloading' ? `${state.progress}%` : (state.message ?? '')}
          </p>
        </div>
      </div>
    </div>
  );
}
