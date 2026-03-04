/**
 * HUD 模块统一入口
 *
 * 所有 HUD 共享同一个 WebView2 宿主窗口 `hud-host`，
 * 由 `HudHost` 组件根据 Tauri 事件动态渲染对应的 HUD 子组件：
 *
 * | 子模块          | 说明                   |
 * |----------------|------------------------|
 * | ./clipitem     | 条目线性快捷操作 HUD    |
 * | ./download     | 图片下载进度浮窗        |
 * | ./radial-menu  | 径向菜单 HUD           |
 *
 * 入口：hud.html → src/hud/main.tsx → HudHost
 */

// ── ClipItem HUD ──
export { ClipItemHudApp } from './clipitem';
export { useClipItemHudController } from './clipitem';

// ── Download HUD ──
export { DownloadHudApp } from './download';

// ── Radial Menu HUD ──
export { RadialMenuApp } from './radial-menu';
