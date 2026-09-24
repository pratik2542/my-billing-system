#!/usr/bin/env node
/**
 * ============================================================
 *  Admin License Key Generator
 *  ============================================================
 *  Usage:
 *    npx ts-node installer/keygen.ts
 *
 *  OR to generate a key from a fingerprint sent by a customer:
 *    npx ts-node installer/keygen.ts --fingerprint <hash>
 *
 *  You ONLY run this tool. Customers never see or run this.
 * ============================================================
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import dotenv from 'dotenv';

// Load root .env or .env.local if present
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// ─── IMPORTANT: Master Private Key for Ed25519 Signature ────────────────────
const MASTER_PRIVATE_KEY_HEX = (process.env.LICENSE_PRIVATE_KEY || '').trim().replace(/\s+/g, '');

if (!MASTER_PRIVATE_KEY_HEX) {
  console.error('\n✗ Error: LICENSE_PRIVATE_KEY is missing.');
  console.error('  Please define LICENSE_PRIVATE_KEY in your local .env file or environment:');
  console.error('  LICENSE_PRIVATE_KEY="<ed25519-private-key-hex>" npm run keygen\n');
  process.exit(1);
}

interface LicensePayload {
  fingerprint: string;
  customerName: string;
  adminEmail?: string;
  issuedAt: number;
  expiresAt: number;  // -1 = lifetime
  features: string[];
  version: number;
}

function generateKey(payload: LicensePayload): string {
  const priv = crypto.createPrivateKey({
    key: Buffer.from(MASTER_PRIVATE_KEY_HEX, 'hex'),
    format: 'der',
    type: 'pkcs8'
  });
  const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  const sig = crypto.sign(null, payloadBuf, priv);
  const envelope = {
    p: payload,
    s: sig.toString('base64url'),
  };
  return Buffer.from(JSON.stringify(envelope)).toString('base64url');
}

function rl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

async function prompt(question: string): Promise<string> {
  return new Promise(resolve => {
    const r = rl();
    r.question(question, answer => { r.close(); resolve(answer.trim()); });
  });
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║     BILLING SYSTEM - ADMIN LICENSE KEYGEN         ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // Check for CLI fingerprint arg
  const args = process.argv.slice(2);
  let fingerprint = '';
  const fpIdx = args.indexOf('--fingerprint');
  if (fpIdx !== -1 && args[fpIdx + 1]) {
    fingerprint = args[fpIdx + 1];
    console.log('Using provided fingerprint:', fingerprint);
  } else {
    console.log('Option 1: Physical visit (you are at the customer PC)');
    console.log('Option 2: Customer emailed you their machine fingerprint\n');
    fingerprint = await prompt('Enter machine fingerprint (SHA-256 hash): ');
  }

  if (!fingerprint || fingerprint.length < 32) {
    console.error('❌ Invalid fingerprint. Must be a SHA-256 hex string.');
    process.exit(1);
  }

  const customerName = await prompt('Customer/business name: ');
  const adminEmail = await prompt('Admin email (for local user management, optional): ');

  console.log('\n─── Feature Selection ────────────────────────────────');
  const enableAnalytics     = (await prompt('Enable Analytics dashboard? (y/n): ')).toLowerCase() === 'y';
  const enableAiAnalyst     = (await prompt('Enable AI Business Analyst (needs Ollama)? (y/n): ')).toLowerCase() === 'y';
  const enablePayments      = (await prompt('Enable Payment Tracking? (y/n): ')).toLowerCase() === 'y';
  const enableProductsMenu  = (await prompt('Enable Products menu? (y/n): ')).toLowerCase() === 'y';
  const enableCustomersMenu = (await prompt('Enable Customers menu? (y/n): ')).toLowerCase() === 'y';
  const enableGst           = (await prompt('Enable GST features? (y/n): ')).toLowerCase() === 'y';
  const enableCsvImport     = (await prompt('Enable CSV import? (y/n): ')).toLowerCase() === 'y';
  const enableAuditTrail    = (await prompt('Enable Audit Trail? (y/n): ')).toLowerCase() === 'y';
  const enableCloudImport   = (await prompt('Enable Cloud→Offline Import? (y/n): ')).toLowerCase() === 'y';

  let ollamaModel = 'llama3.2:3b';
  if (enableAiAnalyst) {
    console.log('\nOllama Model Selection:');
    console.log('  [1] qwen2.5:1.5b  → ~0.9 GB | Budget PCs (4–8 GB RAM, older i5)');
    console.log('  [2] llama3.2:3b   → ~2.0 GB | Standard (8–16 GB RAM, i5 8th+) ← Recommended');
    console.log('  [3] llama3.1:8b   → ~4.7 GB | High-end (16+ GB RAM, i5 13th+)');
    const modelChoice = await prompt('Select model [1/2/3]: ');
    if (modelChoice === '1') ollamaModel = 'qwen2.5:1.5b';
    else if (modelChoice === '3') ollamaModel = 'llama3.1:8b';
    else ollamaModel = 'llama3.2:3b';
  }

  let autoUpdates: 'silent' | 'manual' | 'disabled' = 'manual';
  console.log('\nAuto-Update Mode:');
  console.log('  [1] manual  → Customer is notified, manually installs update');
  console.log('  [2] silent  → Updates download and install automatically in background');
  console.log('  [3] disabled → No update checks');
  const updateChoice = await prompt('Select update mode [1/2/3]: ');
  if (updateChoice === '2') autoUpdates = 'silent';
  else if (updateChoice === '3') autoUpdates = 'disabled';

  const maxInvoicesStr = await prompt('\nMax invoices per month? (-1 for unlimited): ');
  const maxInvoicesPerMonth = parseInt(maxInvoicesStr) || -1;

  // Build feature list embedded in license
  const features = [
    enableAnalytics ? 'analytics' : '',
    enableAiAnalyst ? 'ai' : '',
    enablePayments ? 'payments' : '',
    enableProductsMenu ? 'products' : '',
    enableCustomersMenu ? 'customers' : '',
    enableGst ? 'gst' : '',
    enableCsvImport ? 'csv' : '',
    enableAuditTrail ? 'audit' : '',
    enableCloudImport ? 'cloudimport' : '',
  ].filter(Boolean);

  const payload: LicensePayload = {
    fingerprint,
    customerName,
    adminEmail: adminEmail || undefined,
    issuedAt: Date.now(),
    expiresAt: -1, // Lifetime license
    features,
    version: 1,
  };

  const licenseKey = generateKey(payload);

  // Also create features.dat content
  const featuresPayload = {
    enableAnalytics,
    enableAiAnalyst,
    ollamaModel,
    enablePaymentTracking: enablePayments,
    enableProductsMenu,
    enableCustomersMenu,
    enableGst,
    enableCsvImport,
    enableAuditTrail,
    enableCloudImport,
    autoUpdates,
    maxInvoicesPerMonth,
    customerName,
    installedAt: Date.now(),
    featureVersion: 1,
  };

  const FEATURES_AES_KEY_HEX =
    process.env.FEATURES_AES_KEY ||
    crypto.createHash('sha256').update('universal-billing-offline-features').digest('hex');
  const AES_ALGORITHM = 'aes-256-gcm';
  const keyBuf = Buffer.from(FEATURES_AES_KEY_HEX, 'hex');
  const iv2 = crypto.randomBytes(12);
  const cipher2 = crypto.createCipheriv(AES_ALGORITHM, keyBuf, iv2) as crypto.CipherGCM;
  const featJson = JSON.stringify(featuresPayload);
  const enc2 = Buffer.concat([cipher2.update(featJson, 'utf8'), cipher2.final()]);
  const tag2 = cipher2.getAuthTag();
  const featuresEncoded = Buffer.concat([iv2, tag2, enc2]).toString('base64url');

  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║              GENERATED OUTPUT                      ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('\n📋 License Key (paste into license.key file):');
  console.log('──────────────────────────────────────────────────────');
  console.log(licenseKey);
  console.log('──────────────────────────────────────────────────────');

  console.log('\n📋 Features Data (content of features.dat):');
  console.log('──────────────────────────────────────────────────────');
  console.log(featuresEncoded);
  console.log('──────────────────────────────────────────────────────');

  // Save to output files
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const safeCustomerName = customerName.replace(/[^a-zA-Z0-9]/g, '_');
  const licenseFile = path.join(outputDir, `license_${safeCustomerName}.key`);
  const featuresFile = path.join(outputDir, `features_${safeCustomerName}.dat`);

  fs.writeFileSync(licenseFile, licenseKey);
  fs.writeFileSync(featuresFile, featuresEncoded);

  console.log(`\n✅ Saved to:`);
  console.log(`   License  → ${licenseFile}`);
  console.log(`   Features → ${featuresFile}`);
  console.log('\n📌 Deployment instructions:');
  console.log('   1. Copy license.key → %APPDATA%\\BillingSystem\\license.key');
  console.log('   2. Copy features.dat → %APPDATA%\\BillingSystem\\features.dat');
  console.log('   OR: Provide these files in the installer wizard input during NSIS install.\n');
}

main().catch(console.error);
