/**
 * HUD 模块统一入口
 *
 * 本项目采用 Tauri 多窗口架构，除主窗口外还有三个 HUD 浮窗：
 *
 * | 窗口 label      | 子模块          | 说明                   |
 * |-----------------|----------------|------------------------|
 * | clipitem-hud    | ./clipitem     | 条目线性快捷操作 HUD    |
 * | download-hud    | ./download     | 图片下载进度浮窗        |
 * | radial-menu     | ./radial-menu  | 径向菜单 HUD           |
 *
 * 所有 HUD 窗口共享同一个 SPA 入口（index.html），
 * 通过 URL `?mode=xxx` 参数在 main.tsx 中路由到对应 App 组件。
 */

// ── ClipItem HUD ──
export { ClipItemHudApp } from './clipitem';
export { useClipItemHudController } from './clipitem';

// ── Download HUD ──
export { DownloadHudApp } from './download';

// ── Radial Menu HUD ──
export { RadialMenuApp } from './radial-menu';
