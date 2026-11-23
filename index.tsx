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

// ─── Global Electron Dialog Safety Interceptor ─────────────────────────────────
// Chromium's window.alert and window.confirm steal OS focus on Windows in Electron
// and drop pointer input events after being dismissed. We safely intercept them here.
if (typeof window !== 'undefined') {
  window.alert = (msg?: any) => {
    console.warn('[Global window.alert redirected]:', msg);
    window.dispatchEvent(new CustomEvent('app-global-toast', { detail: { message: String(msg ?? ''), type: 'info' } }));
  };

  if ((window as any).electronAPI?.confirmSync) {
    window.confirm = (msg?: string) => {
      try {
        return Boolean((window as any).electronAPI.confirmSync(String(msg || '')));
      } catch (e) {
        console.warn('confirmSync error fallback:', e);
        return true;
      }
    };
  }
}

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