const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER CONSOLE ${level}] ${message} (${sourceId}:${line})`);
  });

  win.webContents.on('did-fail-load', (event, code, desc, url) => {
    console.error(`[DID FAIL LOAD] ${code}: ${desc} for ${url}`);
  });

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  setTimeout(() => {
    console.log('Test completed after 5s.');
    app.quit();
  }, 5000);
});
