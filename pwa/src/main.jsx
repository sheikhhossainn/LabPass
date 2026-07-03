import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

// Register service worker with immediate updates.
// autoUpdate via registerType in vite.config.js handles silent SW activation,
// but the *currently open* page keeps running old JS until it reloads — so we
// force that reload once a new SW takes control, and poll periodically so
// long-lived PWA sessions (pinned to home screen) still pick up new releases.
let reloadingForUpdate = false;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (reloadingForUpdate) return;
  reloadingForUpdate = true;
  window.location.reload();
});

const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    // Re-check for a new service worker every hour while the app stays open.
    setInterval(() => registration.update(), 60 * 60 * 1000);
  },
  onNeedRefresh() {
    // A new service worker is waiting — activate it now; the
    // controllerchange listener above reloads the page to match.
    updateSW(true);
  },
  onOfflineReady() {
    // App is cached and ready for offline use.
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);