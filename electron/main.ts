import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';

// ─── Local modules ────────────────────────────────────────────────────────────
import {
  initDatabase, closeDatabase,
  productsDb, customersDb, invoicesDb, settingsDb, activityDb, errorDb, configDb,
  usersDb, LocalUser
} from './database';
import { checkLicenseOnStartup, validateLicense, writeLicenseToDisk, getHardwareFingerprint } from './license';
import { loadFeatures, saveFeatures, getFeaturesFilePath, resetFeaturesCache } from './features';
import { startBackupScheduler, stopBackupScheduler, createBackup, listBackups, restoreFromBackupFile, importFromCloudExport, getBackupDirectory } from './backup';
import { startOllama, stopOllama, chatCompletion, getAiStatus, listLocalModels } from './ai';

// ─── Dev mode detection ───────────────────────────────────────────────────────
const isDev = !app.isPackaged;

// ─── Anti-Tamper & Anti-Debugging Guards (Production) ─────────────────────────
if (!isDev) {
  // 1. Detect debugger attachment command line flags
  const dangerousArgs = [
    '--inspect',
    '--inspect-brk',
    '--remote-debugging-port',
    '--remote-debugging-pipe',
    '--allow-insecure-localhost',
    '--disable-web-security'
  ];
  for (const arg of process.argv) {
    if (dangerousArgs.some(flag => arg.startsWith(flag))) {
      console.error('[Security] Unauthorized debugging flag detected. Terminating.');
      process.exit(1);
    }
  }

  // 2. Single instance lock (prevents side-channel attachment)
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  }
}

let mainWindow: BrowserWindow | null = null;

// ─── In-memory session (cleared on app exit) ──────────────────────────────────
let currentSession: LocalUser | null = null;
let licenseAdminEmail: string | undefined = undefined;

// Helper to block DevTools and inspection shortcuts in production
function applyProductionWindowGuards(win: BrowserWindow): void {
  if (isDev) return;

  // Immediately close DevTools if opened programmatically or via hack
  win.webContents.on('devtools-opened', () => {
    win.webContents.closeDevTools();
  });

  // Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
  win.webContents.on('before-input-event', (event, input) => {
    if (
      input.key === 'F12' ||
      (input.control && input.shift && (input.key.toLowerCase() === 'i' || input.key.toLowerCase() === 'j')) ||
      (input.control && input.key.toLowerCase() === 'u')
    ) {
      event.preventDefault();
    }
  });

  // Open safe external protocols in system default apps/browsers, deny unauthorized popups
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:') || url.startsWith('mailto:') || url.startsWith('whatsapp:')) {
      shell.openExternal(url).catch(console.error);
    }
    return { action: 'deny' };
  });
}

function getAppIconPath(): string {
  const candidates = [
    path.join(__dirname, '../dist/icon.ico'),
    path.join(__dirname, '../public/icon.ico'),
    path.join(__dirname, '../build-resources/icon.ico'),
    path.join(process.resourcesPath, 'icon.ico')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(__dirname, '../public/icon.ico');
}

// ─── Create Main Window ───────────────────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Universal Billing System',
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,   // Must be true for security
      nodeIntegration: false,    // Must be false for security
      sandbox: false,            // Needed for better-sqlite3 native module access in main
      devTools: isDev,           // Disable devTools completely in production
    },
    backgroundColor: '#ffffff',
    show: false, // Show after ready-to-show to prevent flicker
  });

  applyProductionWindowGuards(mainWindow);

  // Load app
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── License Gate ─────────────────────────────────────────────────────────────
function createLicenseWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 600,
    height: 500,
    resizable: false,
    title: 'Activate Billing System',
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: isDev,
    },
    backgroundColor: '#0f172a',
  });

  applyProductionWindowGuards(win);

  if (isDev) {
    win.loadURL('http://localhost:3000/#/activate');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/activate' });
  }

  return win;
}

// ─── App Startup ──────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // 1. Init database
  initDatabase();

  // 2. Load features
  let features = loadFeatures();

  // 3. Check license
  const licenseResult = checkLicenseOnStartup();

  if (!licenseResult.valid) {
    // Show license activation window
    const licWin = createLicenseWindow();
    // Wait for successful activation before opening main window
    ipcMain.once('license:activated', () => {
      licWin.close();
      const freshFeatures = loadFeatures();
      createWindow();
      startServices(freshFeatures);
    });
  } else {
    licenseAdminEmail = licenseResult.adminEmail;
    if (licenseResult.features) {
      const featList = licenseResult.features;
      saveFeatures({
        ...features,
        enableAnalytics: featList.includes('analytics'),
        enableAiAnalyst: featList.includes('ai'),
        ollamaModel: features.ollamaModel || 'qwen2.5:7b',
        enablePaymentTracking: featList.includes('payments'),
        enableProductsMenu: featList.includes('products'),
        enableCustomersMenu: featList.includes('customers'),
        enableGst: featList.includes('gst'),
        enableCsvImport: featList.includes('csv'),
        enableAuditTrail: featList.includes('audit'),
        enableCloudImport: featList.includes('cloudimport'),
        customerName: licenseResult.customerName || features.customerName || 'Customer',
      });
      features = loadFeatures();
    }
    createWindow();
    startServices(features);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

async function startServices(features: any): Promise<void> {
  // 4. Start backup scheduler
  startBackupScheduler();

  // 5. Start Ollama if AI is enabled
  if (features.enableAiAnalyst) {
    startOllama().then(result => {
      if (!result.started) {
        console.warn('[Main] Ollama not started:', result.error);
      }
    });
  }

  // 6. Setup auto-updater
  if (features.autoUpdates === 'silent' || features.autoUpdates === 'manual') {
    setupAutoUpdater(features.autoUpdates);
  }
}

// ─── Auto Updater Setup (Safe fallback for offline mode) ──────────────────────
let autoUpdaterInstance: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const updaterModule = require('electron-updater');
  autoUpdaterInstance = updaterModule.autoUpdater || updaterModule;
} catch {
  // Running in offline mode without auto-updater bundled
}

function setupAutoUpdater(mode: 'silent' | 'manual'): void {
  if (!autoUpdaterInstance) return;
  try {
    autoUpdaterInstance.checkForUpdatesAndNotify().catch(() => {/* no update server yet */});

    autoUpdaterInstance.on('update-available', (info: any) => {
      mainWindow?.webContents.send('update-available', info);
      if (mode === 'silent') {
        autoUpdaterInstance.downloadUpdate();
      }
    });

    autoUpdaterInstance.on('update-downloaded', (info: any) => {
      mainWindow?.webContents.send('update-downloaded', info);
      if (mode === 'silent') {
        autoUpdaterInstance.quitAndInstall();
      }
    });
  } catch (e) {
    console.warn('[AutoUpdater] Failed to initialize:', e);
  }
}

// ─── App Exit ─────────────────────────────────────────────────────────────────
app.on('before-quit', () => {
  stopBackupScheduler();
  stopOllama();
  closeDatabase();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─────────────────────────────────────────────────────────────────────────────
// IPC HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

// ── App Info ─────────────────────────────────────────────────────────────────
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getFeatures', () => loadFeatures());
ipcMain.handle('app:getFingerprint', () => getHardwareFingerprint());

// ── License ──────────────────────────────────────────────────────────────────
ipcMain.handle('license:install', async (_, key: string, featuresData?: string) => {
  const result = validateLicense(key);
  if (result.valid) {
    licenseAdminEmail = result.adminEmail;
    writeLicenseToDisk(key);
    if (featuresData) {
      fs.writeFileSync(getFeaturesFilePath(), featuresData, 'utf-8');
      resetFeaturesCache();
    } else if (result.features) {
      const featList = result.features;
      saveFeatures({
        enableAnalytics: featList.includes('analytics'),
        enableAiAnalyst: featList.includes('ai'),
        ollamaModel: 'qwen2.5:7b',
        enablePaymentTracking: featList.includes('payments'),
        enableProductsMenu: featList.includes('products'),
        enableCustomersMenu: featList.includes('customers'),
        enableGst: featList.includes('gst'),
        enableCsvImport: featList.includes('csv'),
        enableAuditTrail: featList.includes('audit'),
        enableCloudImport: featList.includes('cloudimport'),
        autoUpdates: 'manual',
        maxInvoicesPerMonth: -1,
        customerName: result.customerName || 'Customer',
        installedAt: Date.now(),
        featureVersion: 1,
      });
    }
    ipcMain.emit('license:activated');
  }
  return result;
});

ipcMain.handle('license:status', () => checkLicenseOnStartup());

// ── Products ─────────────────────────────────────────────────────────────────
ipcMain.handle('db:products:getAll', () => productsDb.getAll());
ipcMain.handle('db:products:upsert', (_, product) => productsDb.upsert(product));
ipcMain.handle('db:products:delete', (_, id: string) => productsDb.delete(id));

// ── Customers ─────────────────────────────────────────────────────────────────
ipcMain.handle('db:customers:getAll', () => customersDb.getAll());
ipcMain.handle('db:customers:upsert', (_, customer) => customersDb.upsert(customer));
ipcMain.handle('db:customers:delete', (_, id: string) => customersDb.delete(id));

// ── Invoices ──────────────────────────────────────────────────────────────────
ipcMain.handle('db:invoices:getAll', () => invoicesDb.getAll());
ipcMain.handle('db:invoices:upsert', (_, invoice) => invoicesDb.upsert(invoice));
ipcMain.handle('db:invoices:delete', (_, id: string) => invoicesDb.delete(id));

// ── Settings ──────────────────────────────────────────────────────────────────
ipcMain.handle('db:settings:get', () => settingsDb.get());
ipcMain.handle('db:settings:save', (_, settings) => settingsDb.set(settings));

// ── Activity & Error Logs ─────────────────────────────────────────────────────
ipcMain.handle('db:activity:log', (_, entry) => activityDb.log(entry));
ipcMain.handle('db:error:log', (_, entry) => errorDb.log(entry));
ipcMain.handle('db:activity:get', (_, limit) => activityDb.getRecent(limit || 200));

// ── Backup ────────────────────────────────────────────────────────────────────
ipcMain.handle('backup:create', () => createBackup());
ipcMain.handle('backup:list', () => listBackups());
ipcMain.handle('backup:restore', (_, filePath: string) => {
  const res = restoreFromBackupFile(filePath);
  if (res.success && currentSession) {
    const refreshed = usersDb.getByEmail(currentSession.email) || usersDb.getById(currentSession.id);
    if (refreshed) {
      currentSession = refreshed;
    }
  }
  return res;
});
ipcMain.handle('backup:openFolder', () => shell.openPath(getBackupDirectory()));

// ── Cloud Import ──────────────────────────────────────────────────────────────
ipcMain.handle('import:cloudExport', (_, filePath: string) => {
  const res = importFromCloudExport(filePath);
  if (res.success && currentSession) {
    const refreshed = usersDb.getByEmail(currentSession.email) || usersDb.getById(currentSession.id);
    if (refreshed) {
      currentSession = refreshed;
    }
  }
  return res;
});

ipcMain.handle('dialog:pickFile', async (_, filters) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: filters || [{ name: 'JSON', extensions: ['json'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:pickSaveFile', async (_, defaultName: string) => {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  return result.canceled ? null : result.filePath;
});

// ── AI (Ollama) ───────────────────────────────────────────────────────────────
ipcMain.handle('ai:chat', (_, messages, opts) => chatCompletion(messages, opts || {}));
ipcMain.handle('ai:status', () => getAiStatus());
ipcMain.handle('ai:listModels', () => listLocalModels());

// ── App Config ────────────────────────────────────────────────────────────────
ipcMain.handle('config:get', (_, key: string) => configDb.get(key));
ipcMain.handle('config:set', (_, key: string, value: string) => configDb.set(key, value));

// ── Updates ───────────────────────────────────────────────────────────────────
ipcMain.handle('updater:check', () => {
  if (!autoUpdaterInstance) return { success: false, error: 'Offline edition — updater disabled.' };
  return autoUpdaterInstance.checkForUpdatesAndNotify().catch((e: any) => ({ success: false, error: e?.message }));
});
ipcMain.on('updater:install', () => {
  if (autoUpdaterInstance) autoUpdaterInstance.quitAndInstall();
});

// ── WhatsApp & External Links ─────────────────────────────────────────────────
ipcMain.handle('app:openWhatsApp', async (_, phone: string, text: string) => {
  const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
  const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const whatsappAppUrl = `whatsapp://send?phone=${formattedPhone}&text=${encodeURIComponent(text || '')}`;
  try {
    await shell.openExternal(whatsappAppUrl);
    return { success: true };
  } catch (err: any) {
    console.warn('[WhatsApp] App protocol launch failed (WhatsApp may not be installed):', err?.message);
    return { success: false, notInstalled: true, error: err?.message || 'WhatsApp desktop app is not installed on this PC.' };
  }
});

ipcMain.handle('app:openExternal', async (_, url: string) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
});

ipcMain.handle('app:restoreFocus', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    mainWindow.webContents.focus();
  }
  return true;
});

ipcMain.handle('print:prepare', async () => {
  if (mainWindow) {
    mainWindow.setBackgroundColor('#ffffff');
  }
  return { success: true };
});

// ── Print — show the native Chromium print dialog (with preview) ─────────────
ipcMain.handle('print:showDialog', async (_, elementId?: string) => {
  if (!mainWindow) return { success: false, error: 'Window not available' };
  const targetId = elementId || 'invoice-capture-hidden';
  try {
    // Step 1: Make the target invoice element the only visible thing
    await mainWindow.webContents.executeJavaScript(`
      (function() {
        var el = document.getElementById('${targetId}');
        if (el) {
          el.setAttribute('data-pdf-original-style', el.style.cssText || '');
          el.style.cssText = 'display:block!important;visibility:visible!important;position:fixed!important;top:0!important;left:0!important;width:794px!important;height:auto!important;min-height:0!important;transform:none!important;z-index:999999!important;background:white!important;overflow:visible!important;box-shadow:none!important;';
        }
        document.body.setAttribute('data-pdf-target', '${targetId}');
        document.body.classList.add('pdf-print-mode');
      })();
    `);

    // Small delay to allow the DOM repaint before print dialog opens
    await new Promise(resolve => setTimeout(resolve, 300));

    // Step 2: Show the native print dialog (Chrome-style, with preview)
    // This is a Promise-based wrapper around the callback-based webContents.print()
    await new Promise<void>((resolve, reject) => {
      mainWindow!.webContents.print(
        {
          silent: false,           // Show the print dialog (not silent/background print)
          printBackground: true,    // Print background colors and images
          margins: { marginType: 'none' as const },
        },
        (success, reason) => {
          if (success || reason === 'Print job cancelled') {
            resolve();
          } else {
            reject(new Error(reason || 'Print failed'));
          }
        }
      );
    });

    // Step 3: Restore the UI after dialog closes
    await mainWindow.webContents.executeJavaScript(`
      (function() {
        document.body.classList.remove('pdf-print-mode');
        document.body.removeAttribute('data-pdf-target');
        var el = document.getElementById('${targetId}');
        if (el) {
          var orig = el.getAttribute('data-pdf-original-style') || '';
          el.style.cssText = orig;
          el.removeAttribute('data-pdf-original-style');
        }
      })();
    `);

    return { success: true };
  } catch (err: any) {
    // Always restore UI on error
    try {
      await mainWindow.webContents.executeJavaScript(`
        document.body.classList.remove('pdf-print-mode');
        document.body.removeAttribute('data-pdf-target');
        var el = document.getElementById('${targetId}');
        if (el) { var orig = el.getAttribute('data-pdf-original-style')||''; el.style.cssText = orig; el.removeAttribute('data-pdf-original-style'); }
      `);
    } catch (_) {}
    const errMsg = err?.message || '';
    // "Print job cancelled" is not a real error — user closed the dialog
    if (errMsg.includes('cancelled') || errMsg.includes('canceled')) {
      return { success: true };
    }
    console.error('[Print] Failed:', err);
    return { success: false, error: errMsg };
  }
});

// Keep the old previewPdf handler for backward compatibility (used by InvoiceGenerator)
ipcMain.handle('print:previewPdf', async (_, defaultTitle?: string, elementId?: string) => {
  if (!mainWindow) return { success: false, error: 'Window not available' };
  const targetId = elementId || 'invoice-capture-hidden';
  try {
    await mainWindow.webContents.executeJavaScript(`
      (function() {
        var el = document.getElementById('${targetId}');
        if (el) {
          el.setAttribute('data-pdf-original-style', el.style.cssText || '');
          el.style.cssText = 'display:block!important;visibility:visible!important;position:fixed!important;top:0!important;left:0!important;width:794px!important;height:auto!important;min-height:0!important;transform:none!important;z-index:999999!important;background:white!important;overflow:visible!important;box-shadow:none!important;';
        }
        document.body.setAttribute('data-pdf-target', '${targetId}');
        document.body.classList.add('pdf-print-mode');
      })();
    `);
    await new Promise(resolve => setTimeout(resolve, 350));
    const pdfBuffer = await mainWindow.webContents.printToPDF({
      pageSize: 'A4', printBackground: true,
      preferCSSPageSize: false, margins: { marginType: 'none' },
    });
    await mainWindow.webContents.executeJavaScript(`
      (function() {
        document.body.classList.remove('pdf-print-mode');
        document.body.removeAttribute('data-pdf-target');
        var el = document.getElementById('${targetId}');
        if (el) { var orig = el.getAttribute('data-pdf-original-style') || ''; el.style.cssText = orig; el.removeAttribute('data-pdf-original-style'); }
      })();
    `);
    const tempDir = app.getPath('temp');
    const safeTitle = (defaultTitle || 'Invoice').replace(/[^a-zA-Z0-9_-]/g, '_');
    const pdfPath = path.join(tempDir, `${safeTitle}_${Date.now()}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);
    await shell.openPath(pdfPath);
    return { success: true, filePath: pdfPath };
  } catch (err: any) {
    try {
      await mainWindow.webContents.executeJavaScript(`
        document.body.classList.remove('pdf-print-mode');
        document.body.removeAttribute('data-pdf-target');
        var el = document.getElementById('${targetId}');
        if (el) { var orig = el.getAttribute('data-pdf-original-style')||''; el.style.cssText = orig; el.removeAttribute('data-pdf-original-style'); }
      `);
    } catch (_) {}
    console.error('[PrintToPDF] Failed:', err);
    return { success: false, error: err?.message };
  }
});


// ─── Local User Management IPC Handlers ─────────────────────────────────────

ipcMain.handle('user:getLicenseAdminEmail', () => licenseAdminEmail || null);

ipcMain.handle('user:needsSetup', () => {
  return usersDb.count() === 0;
});

ipcMain.handle('user:adminSetup', async (_, name: string, email: string, password: string) => {
  try {
    const existingCount = usersDb.count();
    if (existingCount > 0) {
      return { success: false, error: 'Admin setup has already been completed.' };
    }
    let adminEmailToUse = (email || '').trim().toLowerCase();
    if (licenseAdminEmail) {
      // Strictly enforce the license's designated admin email
      adminEmailToUse = licenseAdminEmail.trim().toLowerCase();
    }
    if (!adminEmailToUse) {
      return { success: false, error: 'Admin email is required.' };
    }
    if (!password || password.length < 4) {
      return { success: false, error: 'Password must be at least 4 characters.' };
    }

    const admin = usersDb.create({
      name: name || 'Admin',
      email: adminEmailToUse,
      password,
      role: 'admin',
      permissions: {
        canViewSettings: true,
        canDeleteBills: true,
        canViewAnalytics: true,
        canManageProducts: true,
        canManageCustomers: true,
        canManagePayments: true,
      },
      is_active: true,
      created_by: 'system',
    });

    currentSession = admin;
    activityDb.log({
      action: 'ADMIN_SETUP',
      category: 'AUTH',
      details: `Initial admin account created for ${admin.email}`,
      timestamp: Date.now(),
      userId: admin.id,
      userEmail: admin.email,
    });

    return { success: true, user: admin };
  } catch (err: any) {
    console.error('[AdminSetup] Error:', err);
    return { success: false, error: err.message || 'Failed to setup admin account' };
  }
});

ipcMain.handle('user:login', async (_, email: string, password: string) => {
  try {
    const user = usersDb.verifyLogin(email, password);
    if (!user) {
      return { success: false, error: 'Invalid email or password' };
    }
    currentSession = user;
    activityDb.log({
      action: 'LOGIN',
      category: 'AUTH',
      details: `User ${user.email} logged in`,
      timestamp: Date.now(),
      userId: user.id,
      userEmail: user.email,
    });
    return { success: true, user };
  } catch (err: any) {
    return { success: false, error: err.message || 'Login failed' };
  }
});

ipcMain.handle('user:getSession', () => {
  return currentSession;
});

ipcMain.handle('user:logout', () => {
  if (currentSession) {
    activityDb.log({
      action: 'LOGOUT',
      category: 'AUTH',
      details: `User ${currentSession.email} logged out`,
      timestamp: Date.now(),
      userId: currentSession.id,
      userEmail: currentSession.email,
    });
    currentSession = null;
  }
  return { success: true };
});

ipcMain.handle('user:list', () => {
  return usersDb.listAll();
});

ipcMain.handle('user:create', async (_, data: any) => {
  try {
    const existing = usersDb.getByEmail(data.email);
    if (existing) {
      return { success: false, error: 'A user with this email already exists.' };
    }
    const user = usersDb.create({
      name: data.name,
      email: data.email,
      password: data.password,
      role: data.role || 'user',
      permissions: data.permissions || {},
      is_active: data.is_active !== undefined ? data.is_active : true,
      created_by: currentSession?.id || 'admin',
    });
    activityDb.log({
      action: 'CREATE_USER',
      category: 'USERS',
      details: `Created user ${user.email} with role ${user.role}`,
      timestamp: Date.now(),
      userId: currentSession?.id,
      userEmail: currentSession?.email,
    });
    return { success: true, user };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create user' };
  }
});

ipcMain.handle('user:update', async (_, id: string, updates: any) => {
  try {
    const updated = usersDb.update(id, updates);
    if (!updated) {
      return { success: false, error: 'User not found' };
    }
    if (currentSession && currentSession.id === id) {
      currentSession = updated;
    }
    activityDb.log({
      action: 'UPDATE_USER',
      category: 'USERS',
      details: `Updated user ${updated.email}`,
      timestamp: Date.now(),
      userId: currentSession?.id,
      userEmail: currentSession?.email,
    });
    return { success: true, user: updated };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update user' };
  }
});

ipcMain.handle('user:delete', async (_, id: string) => {
  try {
    const existing = usersDb.getById(id);
    if (!existing) {
      return { success: false, error: 'User not found' };
    }
    if (existing.role === 'admin' && usersDb.count() <= 1) {
      return { success: false, error: 'Cannot delete the only admin account.' };
    }
    usersDb.delete(id);
    activityDb.log({
      action: 'DELETE_USER',
      category: 'USERS',
      details: `Deleted user ${existing.email}`,
      timestamp: Date.now(),
      userId: currentSession?.id,
      userEmail: currentSession?.email,
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete user' };
  }
});

ipcMain.handle('user:activityLogs', async (_, filters?: any) => {
  return activityDb.getFiltered(filters);
});
