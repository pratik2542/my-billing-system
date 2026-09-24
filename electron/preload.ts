import { contextBridge, ipcRenderer } from 'electron';

// ─── Type-safe IPC Bridge ─────────────────────────────────────────────────────
// All methods exposed to the renderer (React app) via window.electronAPI
// No Node.js APIs are leaked directly — only safe, explicit channels.

const electronAPI = {
  // ── App Info ──────────────────────────────────────────────────────────────
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  getFeatures: (): Promise<any> => ipcRenderer.invoke('app:getFeatures'),
  getHardwareFingerprint: (): Promise<string> => ipcRenderer.invoke('app:getFingerprint'),

  // ── License ───────────────────────────────────────────────────────────────
  installLicense: (key: string, featuresData?: string): Promise<{ success?: boolean; valid?: boolean; error?: string; customerName?: string }> =>
    ipcRenderer.invoke('license:install', key, featuresData),
  getLicenseStatus: (): Promise<{ valid: boolean; customerName?: string; error?: string }> =>
    ipcRenderer.invoke('license:status'),

  // ── Products ──────────────────────────────────────────────────────────────
  getProducts: (): Promise<any[]> => ipcRenderer.invoke('db:products:getAll'),
  upsertProduct: (product: any): Promise<void> => ipcRenderer.invoke('db:products:upsert', product),
  deleteProduct: (id: string): Promise<void> => ipcRenderer.invoke('db:products:delete', id),

  // ── Customers ─────────────────────────────────────────────────────────────
  getCustomers: (): Promise<any[]> => ipcRenderer.invoke('db:customers:getAll'),
  upsertCustomer: (customer: any): Promise<void> => ipcRenderer.invoke('db:customers:upsert', customer),
  deleteCustomer: (id: string): Promise<void> => ipcRenderer.invoke('db:customers:delete', id),

  // ── Invoices ──────────────────────────────────────────────────────────────
  getInvoices: (): Promise<any[]> => ipcRenderer.invoke('db:invoices:getAll'),
  upsertInvoice: (invoice: any): Promise<void> => ipcRenderer.invoke('db:invoices:upsert', invoice),
  deleteInvoice: (id: string): Promise<void> => ipcRenderer.invoke('db:invoices:delete', id),

  // ── Settings ──────────────────────────────────────────────────────────────
  getSettings: (): Promise<any> => ipcRenderer.invoke('db:settings:get'),
  saveSettings: (settings: any): Promise<void> => ipcRenderer.invoke('db:settings:save', settings),

  // ── Activity & Error Logs ─────────────────────────────────────────────────
  logActivity: (entry: any): Promise<void> => ipcRenderer.invoke('db:activity:log', entry),
  logError: (entry: any): Promise<void> => ipcRenderer.invoke('db:error:log', entry),
  getActivityLogs: (limit?: number): Promise<any[]> => ipcRenderer.invoke('db:activity:get', limit),

  // ── Backup ────────────────────────────────────────────────────────────────
  createBackup: (): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('backup:create'),
  listBackups: (): Promise<any[]> => ipcRenderer.invoke('backup:list'),
  restoreBackup: (filePath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('backup:restore', filePath),
  openBackupFolder: (): Promise<void> => ipcRenderer.invoke('backup:openFolder'),

  // ── Cloud Import ──────────────────────────────────────────────────────────
  importCloudExport: (filePath: string): Promise<{ success: boolean; counts?: any; error?: string }> =>
    ipcRenderer.invoke('import:cloudExport', filePath),
  pickFile: (filters?: any[]): Promise<string | null> => ipcRenderer.invoke('dialog:pickFile', filters),
  pickSaveFile: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pickSaveFile', defaultName),

  // ── AI (Ollama) ───────────────────────────────────────────────────────────
  aiChat: (messages: any[], opts?: any): Promise<{ success: boolean; content?: string; error?: string }> =>
    ipcRenderer.invoke('ai:chat', messages, opts),
  getAiStatus: (): Promise<any> => ipcRenderer.invoke('ai:status'),
  listAiModels: (): Promise<string[]> => ipcRenderer.invoke('ai:listModels'),

  // ── Updates ───────────────────────────────────────────────────────────────
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('updater:check'),
  onUpdateAvailable: (cb: (info: any) => void) => {
    const listener = (_: any, info: any) => cb(info);
    ipcRenderer.on('update-available', listener);
    return () => ipcRenderer.removeListener('update-available', listener);
  },
  onUpdateDownloaded: (cb: (info: any) => void) => {
    const listener = (_: any, info: any) => cb(info);
    ipcRenderer.on('update-downloaded', listener);
    return () => ipcRenderer.removeListener('update-downloaded', listener);
  },
  installUpdate: (): void => ipcRenderer.send('updater:install'),

  // ── App Config (key-value) ────────────────────────────────────────────────
  getConfig: (key: string): Promise<string | null> => ipcRenderer.invoke('config:get', key),
  setConfig: (key: string, value: string): Promise<void> => ipcRenderer.invoke('config:set', key, value),

  // ── WhatsApp & External ───────────────────────────────────────────────────
  openWhatsApp: (phone: string, text: string): Promise<{ success: boolean; notInstalled?: boolean; error?: string }> =>
    ipcRenderer.invoke('app:openWhatsApp', phone, text),
  openExternal: (url: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('app:openExternal', url),
  restoreFocus: (): Promise<boolean> =>
    ipcRenderer.invoke('app:restoreFocus'),

  // ── Print & PDF Preview ───────────────────────────────────────────────────
  previewPdf: (title?: string, elementId?: string): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('print:previewPdf', title, elementId),

  // Shows the native Chromium print dialog (with preview, printer picker)
  showPrintDialog: (elementId?: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('print:showDialog', elementId),
  preparePrint: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('print:prepare'),


  // ── Local User Management ─────────────────────────────────────────────────
  userLogin: (email: string, password: string): Promise<{ success: boolean; user?: any; error?: string }> =>
    ipcRenderer.invoke('user:login', email, password),
  userGetSession: (): Promise<any | null> =>
    ipcRenderer.invoke('user:getSession'),
  userLogout: (): Promise<void> =>
    ipcRenderer.invoke('user:logout'),
  userList: (): Promise<any[]> =>
    ipcRenderer.invoke('user:list'),
  userCreate: (data: any): Promise<{ success: boolean; user?: any; error?: string }> =>
    ipcRenderer.invoke('user:create', data),
  userUpdate: (id: string, updates: any): Promise<{ success: boolean; user?: any; error?: string }> =>
    ipcRenderer.invoke('user:update', id, updates),
  userDelete: (id: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('user:delete', id),
  userNeedsSetup: (): Promise<boolean> =>
    ipcRenderer.invoke('user:needsSetup'),
  userAdminSetup: (name: string, email: string, password: string): Promise<{ success: boolean; user?: any; error?: string }> =>
    ipcRenderer.invoke('user:adminSetup', name, email, password),
  userGetActivityLogs: (filters?: { userId?: string; category?: string; limit?: number }): Promise<any[]> =>
    ipcRenderer.invoke('user:activityLogs', filters),
  userGetLicenseAdminEmail: (): Promise<string | null> =>
    ipcRenderer.invoke('user:getLicenseAdminEmail'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// ─── Type Declaration for TypeScript in Renderer ──────────────────────────────
// This block generates the window.electronAPI types for renderer code.
export type ElectronAPI = typeof electronAPI;
