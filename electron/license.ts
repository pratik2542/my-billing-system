import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
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
// Uses the permanent, offline OS MachineGuid from Windows Registry / DBus machine-id.
// It is 100% stable across reboots, sleep cycles, network/Wi-Fi changes, and offline use.
function getRawWindowsMachineId(): string {
  // Tier 1: node-machine-id (reads HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid)
  try {
    const id = machineIdSync(true);
    if (id && id.trim().length >= 16) {
      return id.trim().toLowerCase();
    }
  } catch {}

  // Tier 2: Direct reg.exe query fallback
  if (process.platform === 'win32') {
    try {
      const stdout = child_process.execSync(
        '%windir%\\System32\\reg.exe query HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid',
        { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true }
      );
      const match = stdout.match(/MachineGuid\s+REG_SZ\s+([A-Fa-f0-9\-]+)/i);
      if (match && match[1]) {
        return match[1].trim().toLowerCase();
      }
    } catch {}

    // Tier 3: PowerShell registry query fallback
    try {
      const stdout = child_process.execSync(
        'powershell.exe -NoProfile -NonInteractive -Command "(Get-ItemProperty -Path \'Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\').MachineGuid"',
        { encoding: 'utf8', timeout: 4000, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true }
      );
      const clean = stdout.trim().toLowerCase();
      if (clean && clean.length >= 16) {
        return clean;
      }
    } catch {}

    // Tier 4: Motherboard / BIOS UUID fallback
    try {
      const stdout = child_process.execSync(
        'powershell.exe -NoProfile -NonInteractive -Command "(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID"',
        { encoding: 'utf8', timeout: 4000, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true }
      );
      const clean = stdout.trim().toLowerCase();
      if (clean && clean.length >= 16 && clean !== 'ffffffff-ffff-ffff-ffff-ffffffffffff') {
        return clean;
      }
    } catch {}
  }

  // Tier 5: Hostname fallback (never fails)
  return (os.hostname() || 'offline-pc').trim().toLowerCase();
}

export function getHardwareFingerprint(): string {
  const rawId = getRawWindowsMachineId();
  return crypto.createHash('sha256').update(rawId).digest('hex');
}

// Legacy fallback: for licenses issued with network MAC interface concatenation
export function getLegacyHardwareFingerprint(): string | null {
  try {
    const machineId = machineIdSync(true);
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
  } catch {
    return null;
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
    const legacyFingerprint = getLegacyHardwareFingerprint();
    const isMatch =
      payload.fingerprint.toLowerCase() === currentFingerprint.toLowerCase() ||
      (legacyFingerprint && payload.fingerprint.toLowerCase() === legacyFingerprint.toLowerCase());

    if (!isMatch) {
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
