import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

// Register service worker with immediate updates
// autoUpdate via registerType in vite.config.js handles silent SW activation.
// Only force-update when a waiting SW is detected (onNeedRefresh).
registerSW({
  immediate: true,
  onNeedRefresh() {
    // A new service worker is waiting — activate it immediately.
    // The browser will use it on the *next* navigation; no reload needed now.
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