import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './styles/globals.css';
import { registerSW } from 'virtual:pwa-register';
import { initTelemetry } from '@/lib/telemetry';

// Initialize global runtime monitoring
initTelemetry();

// Register PWA service worker with reload trigger support
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(
      new CustomEvent('carddex:pwa-update', {
        detail: {
          update: () => {
            updateSW(true);
          },
        },
      })
    );
  },
  onOfflineReady() {
    // eslint-disable-next-line no-console
    console.log('CardDex PWA offline ready.');
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('No #root element found in the DOM.');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
