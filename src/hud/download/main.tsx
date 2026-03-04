import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import DownloadHudApp from './DownloadHudApp';
import './download-hud.css';

document.documentElement.setAttribute('data-app-mode', 'download-hud');
document.body.setAttribute('data-app-mode', 'download-hud');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DownloadHudApp />
  </StrictMode>,
);
