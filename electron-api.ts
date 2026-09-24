/**
 * electron-api.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Typed wrapper around window.electronAPI (exposed by preload.ts).
 *
 * In the OFFLINE (Electron) build this module routes all data operations
 * through IPC → SQLite in the main process.
 *
 * The rest of the React app uses these helpers instead of calling Firebase
 * directly, so the same codebase works in both cloud and offline mode.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Runtime detection ────────────────────────────────────────────────────────
export const IS_ELECTRON = typeof window !== 'undefined' && !!(window as any).electronAPI;

function api() {
  return (window as any).electronAPI;
}

// ─── Features ─────────────────────────────────────────────────────────────────
export async function getFeatures(): Promise<Record<string, any>> {
  if (!IS_ELECTRON) return {};
  return api().getFeatures();
}

export async function getHardwareFingerprint(): Promise<string> {
  if (!IS_ELECTRON) return '';
  return api().getHardwareFingerprint();
}

// ─── License ──────────────────────────────────────────────────────────────────
export async function installLicense(key: string, featuresData?: string): Promise<{ valid?: boolean; success?: boolean; error?: string; customerName?: string }> {
  if (!IS_ELECTRON) return { success: false, error: 'Not in desktop mode' };
  return api().installLicense(key, featuresData);
}

export async function getLicenseStatus(): Promise<{ valid: boolean; customerName?: string; error?: string }> {
  if (!IS_ELECTRON) return { valid: true };
  return api().getLicenseStatus();
}

// ─── Products ─────────────────────────────────────────────────────────────────
export async function getProducts() {
  return api().getProducts();
}

export async function upsertProduct(product: any) {
  return api().upsertProduct(product);
}

export async function deleteProduct(id: string) {
  return api().deleteProduct(id);
}

// ─── Customers ────────────────────────────────────────────────────────────────
export async function getCustomers() {
  return api().getCustomers();
}

export async function upsertCustomer(customer: any) {
  return api().upsertCustomer(customer);
}

export async function deleteCustomer(id: string) {
  return api().deleteCustomer(id);
}

// ─── Invoices ─────────────────────────────────────────────────────────────────
export async function getInvoices() {
  return api().getInvoices();
}

export async function upsertInvoice(invoice: any) {
  return api().upsertInvoice(invoice);
}

export async function deleteInvoice(id: string) {
  return api().deleteInvoice(id);
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export async function getSettings() {
  return api().getSettings();
}

export async function saveSettings(settings: any) {
  return api().saveSettings(settings);
}

// ─── Activity & Error Logs ────────────────────────────────────────────────────
export async function logActivity(entry: any) {
  return api().logActivity(entry);
}

export async function logError(entry: any) {
  return api().logError(entry);
}

// ─── Backup ───────────────────────────────────────────────────────────────────
export async function createBackup() {
  return api().createBackup();
}

export async function listBackups() {
  return api().listBackups();
}

export async function restoreBackup(filePath: string) {
  return api().restoreBackup(filePath);
}

export async function openBackupFolder() {
  return api().openBackupFolder();
}

// ─── Cloud Import ─────────────────────────────────────────────────────────────
export async function pickFile(filters?: any[]) {
  return api().pickFile(filters);
}

export async function importCloudExport(filePath: string) {
  return api().importCloudExport(filePath);
}

// ─── AI ───────────────────────────────────────────────────────────────────────
export async function aiChat(messages: any[], opts?: any) {
  return api().aiChat(messages, opts);
}

export async function getAiStatus() {
  return api().getAiStatus();
}

// ─── App Config ───────────────────────────────────────────────────────────────
export async function getConfig(key: string): Promise<string | null> {
  return api().getConfig(key);
}

export async function setConfig(key: string, value: string): Promise<void> {
  return api().setConfig(key, value);
}

// ─── Updates ──────────────────────────────────────────────────────────────────
export function checkForUpdates() {
  return api().checkForUpdates();
}

export function onUpdateAvailable(cb: (info: any) => void) {
  return api().onUpdateAvailable(cb);
}

export function onUpdateDownloaded(cb: (info: any) => void) {
  return api().onUpdateDownloaded(cb);
}

export function installUpdate() {
  return api().installUpdate();
}

// ─── WhatsApp & External Links ────────────────────────────────────────────────
export async function openWhatsApp(phone: string, text: string): Promise<{ success: boolean; notInstalled?: boolean; error?: string }> {
  if (IS_ELECTRON && api()?.openWhatsApp) {
    return api().openWhatsApp(phone, text);
  }
  // Web fallback: wa.me
  const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
  const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text || '')}`;
  window.open(url, '_blank');
  return { success: true };
}

export async function openExternal(url: string): Promise<{ success: boolean; error?: string }> {
  if (IS_ELECTRON && api()?.openExternal) {
    return api().openExternal(url);
  }
  window.open(url, '_blank');
  return { success: true };
}

// ─── PDF Preview & Export ─────────────────────────────────────────────────────
export async function previewPdf(title?: string, elementId?: string): Promise<{ success: boolean; filePath?: string; error?: string }> {
  if (IS_ELECTRON && api()?.previewPdf) {
    return api().previewPdf(title, elementId);
  }
  return { success: false, error: 'PDF preview is only available in desktop app' };
}

// Shows the Chromium native print dialog (with preview, printer picker, etc.)
export async function showPrintDialog(elementId?: string): Promise<{ success: boolean; error?: string }> {
  if (IS_ELECTRON && api()?.showPrintDialog) {
    return api().showPrintDialog(elementId);
  }
  // Fallback for browser (shouldn't normally be called)
  window.print();
  return { success: true };
}

export async function preparePrint(): Promise<{ success: boolean }> {
  if (IS_ELECTRON && api()?.preparePrint) {
    return api().preparePrint();
  }
  return { success: true };
}

export async function restoreAppFocus(): Promise<boolean> {
  if (IS_ELECTRON && api()?.restoreFocus) {
    return api().restoreFocus();
  }
  return false;
}


// ─── Local User Management ──────────────────────────────────────────────────
export interface LocalUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'user';
  permissions: {
    canViewSettings?: boolean;
    canDeleteBills?: boolean;
    canViewAnalytics?: boolean;
    canManageProducts?: boolean;
    canManageCustomers?: boolean;
    canManagePayments?: boolean;
  };
  is_active: boolean;
  created_at: number;
  created_by?: string;
  last_login?: number;
}

export async function userLogin(email: string, password: string): Promise<{ success: boolean; user?: LocalUser; error?: string }> {
  if (!IS_ELECTRON) return { success: false, error: 'Not supported on web' };
  return api().userLogin(email, password);
}

export async function userGetSession(): Promise<LocalUser | null> {
  if (!IS_ELECTRON) return null;
  return api().userGetSession();
}

export async function userLogout(): Promise<void> {
  if (!IS_ELECTRON) return;
  return api().userLogout();
}

export async function userList(): Promise<LocalUser[]> {
  if (!IS_ELECTRON) return [];
  return api().userList();
}

export async function userCreate(data: any): Promise<{ success: boolean; user?: LocalUser; error?: string }> {
  if (!IS_ELECTRON) return { success: false, error: 'Not supported on web' };
  return api().userCreate(data);
}

export async function userUpdate(id: string, updates: any): Promise<{ success: boolean; user?: LocalUser; error?: string }> {
  if (!IS_ELECTRON) return { success: false, error: 'Not supported on web' };
  return api().userUpdate(id, updates);
}

export async function userDelete(id: string): Promise<{ success: boolean; error?: string }> {
  if (!IS_ELECTRON) return { success: false, error: 'Not supported on web' };
  return api().userDelete(id);
}

export async function userNeedsSetup(): Promise<boolean> {
  if (!IS_ELECTRON) return false;
  return api().userNeedsSetup();
}

export async function userAdminSetup(name: string, email: string, password: string): Promise<{ success: boolean; user?: LocalUser; error?: string }> {
  if (!IS_ELECTRON) return { success: false, error: 'Not supported on web' };
  return api().userAdminSetup(name, email, password);
}

export async function userGetActivityLogs(filters?: { userId?: string; category?: string; limit?: number }): Promise<any[]> {
  if (!IS_ELECTRON) return [];
  return api().userGetActivityLogs(filters);
}

export async function userGetLicenseAdminEmail(): Promise<string | null> {
  if (!IS_ELECTRON) return null;
  return api().userGetLicenseAdminEmail();
}
