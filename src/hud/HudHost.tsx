import React, { useEffect, useRef, useState } from 'react';
import { TauriService } from '../services/tauri';
import type { ClipItemHudSnapshot, ImageDownloadProgressEvent, RadialMenuSnapshot } from '../types';
import ClipItemHudApp from './clipitem/ClipItemHudApp';
import RadialMenuApp from './radial-menu/RadialMenuApp';
import DownloadHudApp from './download/DownloadHudApp';

/**
 * HUD 模式枚举。
 *
 * 同一时刻只有一种 HUD 处于激活态（互斥），
 * 'idle' 表示无任何 HUD 活跃，窗口保持隐藏。
 */
type HudMode = 'idle' | 'clipitem' | 'radial' | 'download';

/**
 * 共享 HUD 宿主组件。
 *
 * 在唯一的 `hud-host` WebView2 窗口中运行，通过监听 Tauri 事件
 * 判断当前应该显示哪种 HUD 组件。这种架构将三个独立 WebView2 进程
 * 合并为一个，从 ~150-240MB 降低到 ~50-80MB 内存占用。
 *
 * ## 设计要点
 *
 * 1. **互斥激活**：clipitem / radial / download 三种 HUD 互斥，
 *    高优先级模式（clipitem/radial）可中断低优先级模式（download）。
 * 2. **条件渲染**：仅挂载当前激活的 HUD 子组件，idle 时完全卸载，
 *    大幅减少 GPU 合成层和 React 树内存占用。
 * 3. **首帧快照转发**：mode 切换时将触发切换的事件 payload 通过
 *    `initialSnapshot` prop 传递给子组件，避免子组件挂载后"漏掉"
 *    第一个事件。
 * 4. **就绪信号**：挂载后立即发送统一的 `hud-host-ready` 事件，
 *    主窗口据此判断 HUD 能否接收事件。
 */
export default function HudHost() {
  const [mode, setMode] = useState<HudMode>('idle');

  // 缓存首次触发 mode 切换的 payload，传给子组件作为初始快照
  const clipItemInitialRef = useRef<ClipItemHudSnapshot | null>(null);
  const radialInitialRef = useRef<RadialMenuSnapshot | null>(null);
  const downloadInitialRef = useRef<ImageDownloadProgressEvent | null>(null);

  // ── 监听各 HUD 的激活/隐藏事件来切换模式 ──
  useEffect(() => {
    let mounted = true;

    let unlistenClipItem: (() => void) | null = null;
    let unlistenRadial: (() => void) | null = null;
    let unlistenDownload: (() => void) | null = null;

    // 当 ClipItem HUD 收到快照时激活
    const clipItemPromise = TauriService.listenClipItemHudSnapshot((payload: ClipItemHudSnapshot) => {
      if (!mounted) return;
      clipItemInitialRef.current = payload;
      setMode('clipitem');
      document.documentElement.setAttribute('data-app-mode', 'clipitem-hud');
      document.body.setAttribute('data-app-mode', 'clipitem-hud');
    });
    clipItemPromise.then((d) => { unlistenClipItem = d; }).catch(() => {});

    // 当径向菜单收到快照时激活
    const radialPromise = TauriService.listenRadialMenuSnapshot((payload: RadialMenuSnapshot) => {
      if (!mounted) return;
      radialInitialRef.current = payload;
      setMode('radial');
      document.documentElement.setAttribute('data-app-mode', 'radial-menu');
      document.body.setAttribute('data-app-mode', 'radial-menu');
    });
    radialPromise.then((d) => { unlistenRadial = d; }).catch(() => {});

    // 当下载进度到达时激活（仅当当前不在交互 HUD 模式时）
    const downloadPromise = TauriService.listenImageDownloadProgress((payload) => {
      if (!mounted) return;
      downloadInitialRef.current = payload;
      setMode((prev) => {
        // 交互 HUD 优先级更高，不被下载中断
        if (prev === 'clipitem' || prev === 'radial') return prev;
        if (prev !== 'download') {
          document.documentElement.setAttribute('data-app-mode', 'download-hud');
          document.body.setAttribute('data-app-mode', 'download-hud');
        }
        return 'download';
      });
    });
    downloadPromise.then((d) => { unlistenDownload = d; }).catch(() => {});

    return () => {
      mounted = false;
      if (unlistenClipItem) unlistenClipItem();
      else void clipItemPromise.then((d) => d()).catch(() => {});
      if (unlistenRadial) unlistenRadial();
      else void radialPromise.then((d) => d()).catch(() => {});
      if (unlistenDownload) unlistenDownload();
      else void downloadPromise.then((d) => d()).catch(() => {});
    };
  }, []);

  // ── 统一就绪信号 ──
  useEffect(() => {
    void TauriService.emitHudHostReady();
  }, []);

  // ── 条件渲染：仅挂载当前激活的 HUD 子组件 ──
  // idle 时完全卸载所有子组件，释放 GPU 合成层和 React 树内存。
  switch (mode) {
    case 'clipitem':
      return <ClipItemHudApp initialSnapshot={clipItemInitialRef.current} />;
    case 'radial':
      return <RadialMenuApp initialSnapshot={radialInitialRef.current} />;
    case 'download':
      return <DownloadHudApp initialProgress={downloadInitialRef.current} />;
    default:
      return null;
  }
}
