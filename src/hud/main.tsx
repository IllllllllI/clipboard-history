import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import HudHost from './HudHost';

// 导入各 HUD 子组件所需的样式
import './clipitem/clipitem-hud.css';
import './download/download-hud.css';
import './radial-menu/RadialMenu.css';

// 统一 HUD 宿主窗口入口
// 所有 HUD（ClipItem / RadialMenu / Download）共享同一个 WebView2 窗口，
// 根据接收到的 Tauri 事件动态渲染对应的 HUD 组件。

document.documentElement.style.background = 'transparent';
document.body.style.background = 'transparent';
document.body.style.margin = '0';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HudHost />
  </StrictMode>,
);
