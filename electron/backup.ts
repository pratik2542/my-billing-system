import fs from 'fs';
import path from 'path';
import os from 'os';
import { app, dialog } from 'electron';
import { schedule, ScheduledTask } from 'node-cron';
import { exportFullDatabase, importFullDatabase } from './database';

// ─── Config ───────────────────────────────────────────────────────────────────
const MAX_BACKUPS = 30; // Keep last 30 daily backups

function getBackupDir(): string {
  // Store in user's Documents/BillingBackups
  const docsDir = app.getPath('documents');
  const backupDir = path.join(docsDir, 'BillingBackups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

function getBackupPath(dateStr?: string): string {
  const date = dateStr || new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(getBackupDir(), `backup_${date}.json`);
}

// ─── Create Backup ────────────────────────────────────────────────────────────
export async function createBackup(): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const data = exportFullDatabase();
    const backupPath = getBackupPath();

    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log('[Backup] Created:', backupPath);

    // Prune old backups
    pruneOldBackups();

    return { success: true, filePath: backupPath };
  } catch (e: any) {
    console.error('[Backup] Failed:', e.message);
    return { success: false, error: e.message };
  }
}

// ─── List Available Backups ───────────────────────────────────────────────────
export function listBackups(): Array<{ filename: string; date: string; size: number; path: string }> {
  const dir = getBackupDir();
  try {
    return fs.readdirSync(dir)
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .sort()
      .reverse()
      .map(f => {
        const filePath = path.join(dir, f);
        const stat = fs.statSync(filePath);
        const date = f.replace('backup_', '').replace('.json', '');
        return { filename: f, date, size: stat.size, path: filePath };
      });
  } catch {
    return [];
  }
}

// ─── Restore from Backup File Path ───────────────────────────────────────────
export function restoreFromBackupFile(filePath: string): { success: boolean; error?: string } {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Backup file not found.' };
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    const result = importFullDatabase(data);
    return { success: result.imported, error: result.error };
  } catch (e: any) {
    return { success: false, error: `Failed to restore: ${e.message}` };
  }
}

// ─── Import from Cloud Export JSON ───────────────────────────────────────────
export function importFromCloudExport(filePath: string): { success: boolean; error?: string; counts?: Record<string, number> } {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Export file not found.' };
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);

    // Accept both cloud-export format and backup format
    const normalized = normalizeCloudExport(data);
    const result = importFullDatabase(normalized);

    if (result.imported) {
      return {
        success: true,
        counts: {
          invoices: Array.isArray(normalized.invoices) ? normalized.invoices.length : 0,
          products: Array.isArray(normalized.products) ? normalized.products.length : 0,
          customers: Array.isArray(normalized.customers) ? normalized.customers.length : 0,
        }
      };
    }
    return { success: false, error: result.error };
  } catch (e: any) {
    return { success: false, error: `Failed to import: ${e.message}` };
  }
}

// ─── Cloud Export Normalizer ──────────────────────────────────────────────────
// Handles the JSON format exported by the cloud AdminPortal
function normalizeCloudExport(data: any): any {
  // If it's already in our backup format (has 'version' key)
  if (data.version !== undefined) return data;

  // Cloud export format: { exportedAt, businessId, settings, products, customers, invoices }
  return {
    version: 1,
    exportedAt: data.exportedAt || Date.now(),
    settings: data.settings || data.businessSettings || null,
    products: data.products || [],
    customers: data.customers || [],
    invoices: data.invoices || [],
  };
}

// ─── Prune Old Backups ────────────────────────────────────────────────────────
function pruneOldBackups(): void {
  const dir = getBackupDir();
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length > MAX_BACKUPS) {
      const toDelete = files.slice(MAX_BACKUPS);
      for (const f of toDelete) {
        fs.unlinkSync(path.join(dir, f));
        console.log('[Backup] Pruned old backup:', f);
      }
    }
  } catch { /* non-fatal */ }
}

// ─── Backup Scheduler (daily at 11 PM) ───────────────────────────────────────
let _cronJob: ScheduledTask | null = null;

export function startBackupScheduler(): void {
  if (_cronJob) return;

  // Run daily at 11:00 PM
  _cronJob = schedule('0 23 * * *', async () => {
    console.log('[Backup] Running scheduled backup...');
    const result = await createBackup();
    if (result.success) {
      console.log('[Backup] Scheduled backup complete:', result.filePath);
    } else {
      console.error('[Backup] Scheduled backup failed:', result.error);
    }
  });

  console.log('[Backup] Scheduler started (daily at 23:00)');

  // Also run a backup on startup if today's backup doesn't exist yet
  const todayPath = getBackupPath();
  if (!fs.existsSync(todayPath)) {
    createBackup().then(r => {
      if (r.success) console.log('[Backup] Startup backup created:', r.filePath);
    });
  }
}

export function stopBackupScheduler(): void {
  if (_cronJob) {
    _cronJob.stop();
    _cronJob = null;
  }
}

// ─── Get Backup Directory Path ────────────────────────────────────────────────
export function getBackupDirectory(): string {
  return getBackupDir();
}
