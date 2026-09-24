import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

// ─── Feature Definitions ──────────────────────────────────────────────────────
export interface OfflineFeatures {
  enableAnalytics: boolean;
  enableAiAnalyst: boolean;          // Requires Ollama
  ollamaModel: string;               // e.g. 'llama3.2:3b'
  enablePaymentTracking: boolean;
  enableProductsMenu: boolean;
  enableCustomersMenu: boolean;
  enableGst: boolean;
  enableCsvImport: boolean;
  enableAuditTrail: boolean;
  enableCloudImport: boolean;        // Allow importing from cloud export JSON
  autoUpdates: 'silent' | 'manual' | 'disabled';
  maxInvoicesPerMonth: number;       // -1 = unlimited
  customerName: string;              // Embedded at install time
  installedAt: number;
  featureVersion: number;
}

export const DEFAULT_FEATURES: OfflineFeatures = {
  enableAnalytics: true,
  enableAiAnalyst: false,
  ollamaModel: 'qwen2.5:7b',
  enablePaymentTracking: true,
  enableProductsMenu: true,
  enableCustomersMenu: true,
  enableGst: true,
  enableCsvImport: true,
  enableAuditTrail: true,
  enableCloudImport: true,
  autoUpdates: 'manual',
  maxInvoicesPerMonth: -1,
  customerName: 'Unknown',
  installedAt: Date.now(),
  featureVersion: 1,
};

// Derived key for features obfuscation
const PRIVATE_KEY_HEX =
  process.env.FEATURES_AES_KEY ||
  crypto.createHash('sha256').update('universal-billing-offline-features').digest('hex');

const ALGORITHM = 'aes-256-gcm';

function encryptFeatures(features: OfflineFeatures): string {
  const keyBuf = Buffer.from(PRIVATE_KEY_HEX, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuf, iv) as crypto.CipherGCM;
  const json = JSON.stringify(features);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decryptFeatures(encoded: string): OfflineFeatures {
  const keyBuf = Buffer.from(PRIVATE_KEY_HEX, 'hex');
  const combined = Buffer.from(encoded, 'base64url');
  const iv = combined.subarray(0, 12);
  const tag = combined.subarray(12, 28);
  const encrypted = combined.subarray(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuf, iv) as crypto.DecipherGCM;
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

// ─── File Path ────────────────────────────────────────────────────────────────
export function getFeaturesFilePath(): string {
  return path.join(app.getPath('userData'), 'features.dat');
}

// ─── Read Features (at app startup) ──────────────────────────────────────────
let _cachedFeatures: OfflineFeatures | null = null;

export function loadFeatures(): OfflineFeatures {
  if (_cachedFeatures) return _cachedFeatures;

  const p = getFeaturesFilePath();
  if (!fs.existsSync(p)) {
    console.warn('[Features] features.dat not found, using defaults (install not complete)');
    _cachedFeatures = { ...DEFAULT_FEATURES };
    return _cachedFeatures;
  }

  try {
    const raw = fs.readFileSync(p, 'utf-8').trim();
    let features: Partial<OfflineFeatures>;
    if (raw.startsWith('{')) {
      features = JSON.parse(raw);
    } else {
      features = decryptFeatures(raw);
    }
    // Merge with defaults to handle new keys added in future versions
    _cachedFeatures = { ...DEFAULT_FEATURES, ...features };
    return _cachedFeatures;
  } catch (e) {
    console.error('[Features] Failed to decrypt features.dat:', e);
    // If tampered / corrupt, deny all premium features
    _cachedFeatures = {
      ...DEFAULT_FEATURES,
      enableAnalytics: false,
      enableAiAnalyst: false,
      enableCsvImport: false,
      maxInvoicesPerMonth: 50,
    };
    return _cachedFeatures;
  }
}

// ─── Write Features (admin installer wizard only) ─────────────────────────────
export function saveFeatures(features: OfflineFeatures): void {
  const encoded = encryptFeatures(features);
  fs.writeFileSync(getFeaturesFilePath(), encoded, 'utf-8');
  _cachedFeatures = features; // Update cache
  console.log('[Features] features.dat written successfully');
}

// ─── Reset cache (useful after install wizard) ────────────────────────────────
export function resetFeaturesCache(): void {
  _cachedFeatures = null;
}
