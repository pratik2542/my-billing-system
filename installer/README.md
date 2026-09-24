# Admin Installer Toolkit — Billing System Desktop App

> **CONFIDENTIAL — This directory is for admin use only. Do NOT include in customer deliverables.**

---

## Overview

This toolkit lets you generate license keys and feature flags for each customer installation of the offline desktop billing app.

---

## Requirements

- Node.js 18+
- `ts-node` (install globally: `npm install -g ts-node typescript`)
- The project's `.env` with `LICENSE_PRIVATE_KEY` set (or the default key in code)

---

## Workflow

### Step 1: Get the Customer's Machine Fingerprint

**Option A — Physical visit (you are at the customer's PC):**

Run the app installer on their PC. The install wizard will show the machine fingerprint on screen. You can also get it by running:

```bash
npx ts-node installer/keygen.ts
```

And when prompted, run the following on **their PC**:

```bash
node -e "const {machineIdSync} = require('node-machine-id'); const crypto = require('crypto'); const os = require('os'); const id = machineIdSync(true); const nets = os.networkInterfaces(); const macs = []; for (const iface of Object.values(nets)) { for (const net of iface) { if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') macs.push(net.mac); } } const combined = id + '|' + macs.sort().join(',') + '|' + os.hostname(); console.log(crypto.createHash('sha256').update(combined).digest('hex'));"
```

**Option B — Email/remote:**

Ask the customer to run the fingerprint command above and email you the SHA-256 hash.

---

### Step 2: Run the Keygen Wizard

```bash
cd d:\billing\my-billing-system
npx ts-node installer/keygen.ts
```

The wizard will ask:
- Machine fingerprint hash
- Customer/business name
- Which features to enable (Analytics, AI, Payments, etc.)
- Ollama model (for AI feature)
- Auto-update mode
- Invoice limit

Output: Two files in `installer/output/`:
- `license_<CustomerName>.key` — machine-locked license key
- `features_<CustomerName>.dat` — encrypted feature flags

---

### Step 3: Deploy to Customer PC

Copy both files to:
```
%APPDATA%\BillingSystem\license.key
%APPDATA%\BillingSystem\features.dat
```

These paths expand to something like:
```
C:\Users\CustomerName\AppData\Roaming\BillingSystem\
```

**OR:** Include them in the NSIS installer so they are automatically placed during installation.

---

## Ollama Model Guide

| Model | Size | RAM Required | Best For |
|---|---|---|---|
| `qwen2.5:1.5b` | ~0.9 GB | 4–8 GB | Budget PCs, older i5 (4th–7th gen) |
| `llama3.2:3b` | ~2.0 GB | 8–16 GB | **Standard (recommended)** — i5 8th gen+ |
| `llama3.1:8b` | ~4.7 GB | 16+ GB | High-end PCs, i5 13th gen or i7 |

For most customers with a typical office PC (i5, 8GB RAM), use `llama3.2:3b`.

---

## Generating a New Key for a Different Machine

If a customer replaces their PC, you need to:
1. Get the new machine fingerprint
2. Run keygen.ts again with the new fingerprint
3. Deploy the new `license.key` and `features.dat`

The data remains intact (SQLite database is separate from the license files).

---

## Adding Features to an Existing Installation

When you add a new feature to the app:
1. Build new EXE version
2. Run keygen.ts with same fingerprint, enable the new feature
3. Deploy updated `features.dat` only (license.key stays the same if machine didn't change)
4. Customer installs new EXE — SQLite data is preserved via migrations

---

## Security Notes

- The `LICENSE_PRIVATE_KEY` in `electron/license.ts` and `electron/features.ts` must be the same 32-byte hex key
- Never share this key with customers
- The keygen CLI must be run by you only
- The private key is embedded in the binary at build time (via `process.env.LICENSE_PRIVATE_KEY` at compile time)
