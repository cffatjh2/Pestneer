import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/variables.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/pages.css';
import './styles/report.css';
import './styles/responsive.css';
import './styles/auth.css';
import './styles/landing.css';

import App from './App';

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  window.location.reload();
});

window.addEventListener('error', (event) => {
  if (event.message && (event.message.includes('Failed to fetch dynamically imported module') || event.message.includes('Importing a module script failed'))) {
    const key = 'last_chunk_reload';
    const last = sessionStorage.getItem(key);
    const now = Date.now();
    if (!last || now - Number(last) > 10000) {
      sessionStorage.setItem(key, String(now));
      window.location.reload();
    }
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((registration) => {
      void registration.update();
      if (registration.waiting) {
        registration.waiting.postMessage('SKIP_WAITING');
      }
      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (installingWorker) {
          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              installingWorker.postMessage('SKIP_WAITING');
            }
          });
        }
      });
    });
  });
}
