import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { machineIdSync } from 'node-machine-id';

// ─── Cryptographic Verification Key (PUBLIC KEY ONLY) ────────────────────────
// This is the Ed25519 Public Key. It can ONLY VERIFY digital signatures.
// Even if an attacker decompiles or extracts this entire file, it is
// mathematically IMPOSSIBLE to forge signatures or create a keygen without
// the secret Private Key, which is kept exclusively in your Admin Portal.
export const MASTER_PUBLIC_KEY_HEX =
  '302a300506032b65700321001ea055548929dcea67c254133bc2ba295d7aeb4ee9bedb3bb4d3d5f67b825a22';

// ─── Hardware Fingerprint ─────────────────────────────────────────────────────
export function getHardwareFingerprint(): string {
  try {
    // Combine machine-id + network interface MAC addresses
    const machineId = machineIdSync(true); // hashed
    const nets = os.networkInterfaces();
    const macs: string[] = [];

    for (const iface of Object.values(nets)) {
      if (!iface) continue;
      for (const net of iface) {
        if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
          macs.push(net.mac);
        }
      }
    }

    const combined = `${machineId}|${macs.sort().join(',')}|${os.hostname()}`;
    return crypto.createHash('sha256').update(combined).digest('hex');
  } catch (e) {
    // Fallback: use only machine-id
    const machineId = machineIdSync(true);
    return crypto.createHash('sha256').update(machineId).digest('hex');
  }
}

// ─── License Payload Interface ────────────────────────────────────────────────
export interface LicensePayload {
  fingerprint: string;   // SHA-256 hardware hash of target machine
  customerName: string;
  adminEmail?: string;   // email of the admin user (for local user management)
  issuedAt: number;      // ms timestamp
  expiresAt: number;     // -1 = lifetime
  features: string[];    // list of enabled feature keys
  version: number;       // key version/format
}

export interface LicenseValidationResult {
  valid: boolean;
  customerName?: string;
  adminEmail?: string;
  features?: string[];
  error?: string;
}

// ─── License Key Validation (Asymmetric Ed25519 verification) ─────────────────
export function validateLicense(licenseKey: string): LicenseValidationResult {
  try {
    const raw = Buffer.from(licenseKey.trim(), 'base64url').toString('utf8');
    const envelope = JSON.parse(raw);

    if (!envelope || !envelope.p || !envelope.s) {
      return { valid: false, error: 'Invalid or corrupted license envelope.' };
    }

    const payload: LicensePayload = envelope.p;
    const signature = Buffer.from(envelope.s, 'base64url');
    const payloadBuffer = Buffer.from(JSON.stringify(payload), 'utf8');

    // Verify cryptographic signature with master public key
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(MASTER_PUBLIC_KEY_HEX, 'hex'),
      format: 'der',
      type: 'spki'
    });

    const isAuthentic = crypto.verify(null, payloadBuffer, publicKey, signature);
    if (!isAuthentic) {
      return { valid: false, error: 'Cryptographic signature verification failed. Forged license.' };
    }

    // Check hardware fingerprint lock
    const currentFingerprint = getHardwareFingerprint();
    if (payload.fingerprint.toLowerCase() !== currentFingerprint.toLowerCase()) {
      return { valid: false, error: 'License is locked to a different computer hardware.' };
    }

    // Check expiry (lifetime = -1)
    if (payload.expiresAt !== -1 && Date.now() > payload.expiresAt) {
      return { valid: false, error: 'License has expired. Please contact your vendor.' };
    }

    return {
      valid: true,
      customerName: payload.customerName,
      adminEmail: payload.adminEmail,
      features: payload.features,
    };
  } catch (e: any) {
    return { valid: false, error: 'Invalid or unreadable license key.' };
  }
}

// ─── License File Path ────────────────────────────────────────────────────────
export function getLicenseFilePath(): string {
  return path.join(app.getPath('userData'), 'license.key');
}

export function readLicenseFromDisk(): string | null {
  const p = getLicenseFilePath();
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf-8').trim();
}

export function writeLicenseToDisk(key: string): void {
  fs.writeFileSync(getLicenseFilePath(), key, 'utf-8');
}

// ─── Startup License Check ────────────────────────────────────────────────────
export function checkLicenseOnStartup(): LicenseValidationResult {
  const key = readLicenseFromDisk();
  if (!key) {
    return { valid: false, error: 'No license found. Please contact your vendor for a license key.' };
  }
  return validateLicense(key);
}
