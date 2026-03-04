import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import RadialMenuApp from './RadialMenuApp';

document.documentElement.setAttribute('data-app-mode', 'radial-menu');
document.body.setAttribute('data-app-mode', 'radial-menu');
document.documentElement.style.background = 'transparent';
document.body.style.background = 'transparent';
document.body.style.margin = '0';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RadialMenuApp />
  </StrictMode>,
);
