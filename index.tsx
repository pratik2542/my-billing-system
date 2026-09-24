import React from 'react';
import ReactDOM from 'react-dom/client';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// ─── Runtime detection ────────────────────────────────────────────────────────
// If running inside Electron (window.electronAPI exists from preload.ts),
// mount the offline SQLite-backed app. Otherwise mount the cloud Firebase app.
const IS_ELECTRON = typeof window !== 'undefined' && !!(window as any).electronAPI;

async function mountApp() {
  if (IS_ELECTRON) {
    // Offline desktop mode — lazy import to keep cloud bundle clean
    const { OfflineApp } = await import('./OfflineApp');
    root.render(
      <React.StrictMode>
        <OfflineApp />
      </React.StrictMode>
    );
  } else {
    // Cloud web mode — original Firebase-connected app
    const { default: App } = await import('./App');
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
}

mountApp().catch(console.error);