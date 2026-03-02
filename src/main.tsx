import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import DownloadHudApp from './DownloadHudApp.tsx';
import ClipItemHudApp from './ClipItemHudApp.tsx';
import './index.css';
import './styles/download-hud.css';
import './styles/clipitem-hud.css';

const url = new URL(window.location.href);
const isDownloadHudMode = url.searchParams.get('mode') === 'download-hud';
const isClipItemHudMode = url.searchParams.get('mode') === 'clipitem-hud';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDownloadHudMode ? <DownloadHudApp /> : isClipItemHudMode ? <ClipItemHudApp /> : <App />}
  </StrictMode>,
);
