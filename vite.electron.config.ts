import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * vite.electron.config.ts
 * Used to build the React renderer for Electron packaging.
 * Key differences from vite.config.ts:
 *  - base: './' so paths are relative (required for Electron file:// protocol)
 *  - No VITE_FIREBASE_* env vars needed
 *  - Output goes to dist/ which electron-builder packages
 */
export default defineConfig({
  plugins: [react()],
  base: './',   // CRITICAL for Electron — keeps asset paths relative
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: [],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  define: {
    // No API keys in offline build
    'process.env.API_KEY': JSON.stringify(''),
    'process.env.GEMINI_API_KEY': JSON.stringify(''),
  },
});
