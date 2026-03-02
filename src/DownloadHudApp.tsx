import React, { useEffect, useState } from 'react';
import { Loader2, XCircle, CheckCircle2 } from 'lucide-react';
import { TauriService } from './services/tauri';
import type { ImageDownloadProgressEvent } from './types';

type HudState = {
  status: 'idle' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  message?: string;
};

export default function DownloadHudApp() {
  const [state, setState] = useState<HudState>({ status: 'idle', progress: 0 });

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    let autoResetTimer: number | null = null;

    void TauriService.listenImageDownloadProgress((payload: ImageDownloadProgressEvent) => {
      if (disposed) return;

      if (payload.status === 'downloading') {
        setState({
          status: 'downloading',
          progress: Math.max(0, Math.min(100, payload.progress ?? 0)),
        });
        return;
      }

      if (payload.status === 'completed') {
        setState({ status: 'completed', progress: 100, message: '下载完成' });
      } else if (payload.status === 'failed') {
        setState({
          status: 'failed',
          progress: Math.max(0, Math.min(100, payload.progress ?? 0)),
          message: payload.error_message || '下载失败',
        });
      } else if (payload.status === 'cancelled') {
        setState({ status: 'cancelled', progress: 0, message: '已取消' });
      }

      if (autoResetTimer) window.clearTimeout(autoResetTimer);
      autoResetTimer = window.setTimeout(() => {
        setState({ status: 'idle', progress: 0 });
      }, 1200);
    }).then((dispose) => {
      unlisten = dispose;
    }).catch(() => {
      // ignore
    });

    return () => {
      disposed = true;
      if (unlisten) unlisten();
      if (autoResetTimer) window.clearTimeout(autoResetTimer);
    };
  }, []);

  if (state.status === 'idle') {
    return <div className="hud-root" />;
  }

  return (
    <div className="hud-root">
      <div className="hud-card" data-status={state.status}>
        <div className="hud-icon-wrap">
          {state.status === 'downloading' && <Loader2 className="hud-icon hud-spin" />}
          {state.status === 'completed' && <CheckCircle2 className="hud-icon" />}
          {(state.status === 'failed' || state.status === 'cancelled') && <XCircle className="hud-icon" />}
        </div>

        <div className="hud-body">
          <p className="hud-title">
            {state.status === 'downloading' && '下载图片中'}
            {state.status === 'completed' && '下载完成'}
            {state.status === 'failed' && '下载失败'}
            {state.status === 'cancelled' && '已取消'}
          </p>

          <div className="hud-meter-bg">
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
