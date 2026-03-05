import { useEffect, useRef, useState } from 'react';
import { TauriService } from '../services/tauri';
import type { ClipItemHudSnapshot, ImageDownloadProgressEvent, RadialMenuSnapshot } from '../types';
import { subscribeTauriEvent } from './subscribe';
import ClipItemHudApp from './clipitem/ClipItemHudApp';
import RadialMenuApp from './radial-menu/RadialMenuApp';
import DownloadHudApp from './download/DownloadHudApp';

/**
 * HUD 模式枚举。
 * 同一时刻只有一种 HUD 处于激活态（互斥），'idle' 表示无任何活跃。
 */
type HudMode = 'idle' | 'clipitem' | 'radial' | 'download';

/** 交互式 HUD 模式集合，优先级高于 download，不可被打断 */
const INTERACTIVE_MODES: ReadonlySet<HudMode> = new Set(['clipitem', 'radial']);

/** HudMode → CSS data-app-mode 属性值映射 */
const APP_MODE_ATTR: Record<Exclude<HudMode, 'idle'>, string> = {
  clipitem: 'clipitem-hud',
  radial:   'radial-menu',
  download: 'download-hud',
};

/** 同时设置 html 和 body 的 data-app-mode 属性 */
function setAppMode(mode: string): void {
  document.documentElement.setAttribute('data-app-mode', mode);
  document.body.setAttribute('data-app-mode', mode);
}

/**
 * 共享 HUD 宿主组件。
 *
 * 在唯一的 `hud-host` WebView2 窗口中运行，通过 Tauri 事件
 * 动态渲染对应的 HUD 子组件。将三个独立 WebView2 进程合并为一个，
 * 从 ~150-240MB 降至 ~50-80MB 内存占用。
 *
 * 设计要点：
 * 1. **互斥激活** — clipitem / radial / download 三种 HUD 互斥，
 *    交互式模式（clipitem / radial）优先级高于下载模式。
 * 2. **条件渲染** — 仅挂载当前激活的子组件，idle 时完全卸载。
 * 3. **首帧快照** — 切换事件的首个 payload 通过 ref → prop 传递，
 *    确保子组件挂载后不会"漏掉"触发事件。
 * 4. **就绪信号** — 挂载后发送 hud-host-ready，主窗口据此判断可用性。
 */
export default function HudHost() {
  const [mode, setMode] = useState<HudMode>('idle');
  const clipItemInitialRef  = useRef<ClipItemHudSnapshot | null>(null);
  const radialInitialRef    = useRef<RadialMenuSnapshot | null>(null);
  const downloadInitialRef  = useRef<ImageDownloadProgressEvent | null>(null);

  // ── 监听各 HUD 的激活事件来切换模式 ──
  useEffect(() => {
    const cleanups = [
      // ClipItem HUD 收到快照 → 激活
      subscribeTauriEvent(TauriService.listenClipItemHudSnapshot, (payload: ClipItemHudSnapshot) => {
        clipItemInitialRef.current = payload;
        setMode('clipitem');
        setAppMode(APP_MODE_ATTR.clipitem);
      }),
      // 径向菜单收到快照 → 激活
      subscribeTauriEvent(TauriService.listenRadialMenuSnapshot, (payload: RadialMenuSnapshot) => {
        radialInitialRef.current = payload;
        setMode('radial');
        setAppMode(APP_MODE_ATTR.radial);
      }),
      // 下载进度到达 → 仅在非交互模式下激活
      subscribeTauriEvent(TauriService.listenImageDownloadProgress, (payload: ImageDownloadProgressEvent) => {
        downloadInitialRef.current = payload;
        setMode((prev) => {
          if (INTERACTIVE_MODES.has(prev)) return prev;
          if (prev !== 'download') setAppMode(APP_MODE_ATTR.download);
          return 'download';
        });
      }),
    ];
    return () => cleanups.forEach((fn) => fn());
  }, []);

  // ── 就绪信号 ──
  useEffect(() => { void TauriService.emitHudHostReady(); }, []);

  // ── 条件渲染：仅挂载当前激活的子组件，idle 时完全卸载 ──
  switch (mode) {
    case 'clipitem': return <ClipItemHudApp initialSnapshot={clipItemInitialRef.current} />;
    case 'radial':   return <RadialMenuApp initialSnapshot={radialInitialRef.current} />;
    case 'download': return <DownloadHudApp initialProgress={downloadInitialRef.current} />;
    default:         return null;
  }
}
