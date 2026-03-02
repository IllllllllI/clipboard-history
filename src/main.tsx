import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import DownloadHudApp from './DownloadHudApp.tsx';
import './index.css';
import './styles/download-hud.css';

const url = new URL(window.location.href);
const isDownloadHudMode = url.searchParams.get('mode') === 'download-hud';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDownloadHudMode ? <DownloadHudApp /> : <App />}
  </StrictMode>,
);
