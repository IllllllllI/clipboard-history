import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import DownloadHudApp from './hud/download/DownloadHudApp';
import ClipItemHudApp from './hud/clipitem/ClipItemHudApp';
import RadialMenuApp from './hud/radial-menu/RadialMenuApp';
import './index.css';
import './hud/download/download-hud.css';
import './hud/clipitem/clipitem-hud.css';

const url = new URL(window.location.href);
const appMode = url.searchParams.get('mode');
const isDownloadHudMode = appMode === 'download-hud';
const isClipItemHudMode = appMode === 'clipitem-hud';
const isRadialMenuMode = appMode === 'radial-menu';

if (isDownloadHudMode) {
  document.documentElement.setAttribute('data-app-mode', 'download-hud');
  document.body.setAttribute('data-app-mode', 'download-hud');
} else if (isClipItemHudMode) {
  document.documentElement.setAttribute('data-app-mode', 'clipitem-hud');
  document.body.setAttribute('data-app-mode', 'clipitem-hud');
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  document.body.style.margin = '0';
} else if (isRadialMenuMode) {
  document.documentElement.setAttribute('data-app-mode', 'radial-menu');
  document.body.setAttribute('data-app-mode', 'radial-menu');
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  document.body.style.margin = '0';
} else {
  document.documentElement.setAttribute('data-app-mode', 'main');
  document.body.setAttribute('data-app-mode', 'main');
}

function RootApp() {
  if (isDownloadHudMode) return <DownloadHudApp />;
  if (isClipItemHudMode) return <ClipItemHudApp />;
  if (isRadialMenuMode) return <RadialMenuApp />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
);
