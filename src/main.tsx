import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './styles/globals.css';
import { registerSW } from 'virtual:pwa-register';

// Register PWA service worker
registerSW({ immediate: true });

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('No #root element found in the DOM.');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
