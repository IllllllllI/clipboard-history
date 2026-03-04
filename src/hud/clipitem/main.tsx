import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import ClipItemHudApp from './ClipItemHudApp';
import './clipitem-hud.css';

document.documentElement.setAttribute('data-app-mode', 'clipitem-hud');
document.body.setAttribute('data-app-mode', 'clipitem-hud');
document.documentElement.style.background = 'transparent';
document.body.style.background = 'transparent';
document.body.style.margin = '0';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClipItemHudApp />
  </StrictMode>,
);
