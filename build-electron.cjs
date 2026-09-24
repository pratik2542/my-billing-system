#!/usr/bin/env node
/**
 * build-electron.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Master build script for the offline Billing System EXE.
 *
 * Run:  node build-electron.js
 *
 * What it does:
 *  1. Checks if Visual Studio Build Tools are available (for better-sqlite3)
 *  2. If not found, installs them automatically (windows-build-tools)
 *  3. Compiles the Electron TypeScript main process
 *  4. Builds the React renderer with Vite
 *  5. Runs electron-builder to produce the NSIS installer EXE
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
  } catch (e) {
    console.error(`\n✗ Command failed: ${cmd}`);
    process.exit(1);
  }
}

function runSafe(cmd, opts = {}) {
  try {
    const result = spawnSync(cmd, { shell: true, encoding: 'utf8', cwd: ROOT, ...opts });
    return { ok: result.status === 0, output: (result.stdout || '') + (result.stderr || '') };
  } catch {
    return { ok: false, output: '' };
  }
}

function header(msg) {
  const line = '─'.repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${msg}`);
  console.log(`${line}`);
}

function hasBuildTools() {
  // Check if cl.exe (MSVC compiler) is accessible
  const result = runSafe('where cl.exe');
  if (result.ok) return true;

  // Check registry for VS Build Tools
  const reg = runSafe('reg query "HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0" /v InstallDir');
  return reg.ok;
}

function hasNodeGyp() {
  return runSafe('node-gyp --version').ok;
}

// ─── Step 0: Check prerequisites ─────────────────────────────────────────────
header('STEP 0: Checking Build Environment');

// Check Node.js version
const nodeVer = process.version;
const nodeMajor = parseInt(nodeVer.split('.')[0].replace('v', ''));
if (nodeMajor < 18) {
  console.error(`✗ Node.js ${nodeVer} is too old. Please install Node.js 18 or newer.`);
  process.exit(1);
}
console.log(`✓ Node.js: ${nodeVer}`);

// Check npm
const npmResult = runSafe('npm --version');
console.log(`✓ npm: ${npmResult.output.trim()}`);

// ─── Step 1: Prebuilt Native Modules for Electron ────────────────────────────
header('STEP 1: Native Modules (better-sqlite3)');
const sqliteBin = path.join(ROOT, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
if (!fs.existsSync(sqliteBin)) {
  console.log('   better-sqlite3 binary not found. Installing prebuilt binary for Electron...');
  run('node scripts/install-prebuilt-sqlite.cjs');
} else {
  console.log('✓ Prebuilt better-sqlite3 binary for Electron is ready.');
}

// ─── Step 2: Install npm dependencies ────────────────────────────────────────
header('STEP 2: Installing Dependencies');
run('npm install --ignore-scripts');

// ─── Step 3: Verify native modules for Electron ──────────────────────────────
header('STEP 3: Ensuring Native Modules for Electron');
run('node scripts/install-prebuilt-sqlite.cjs');
console.log('✓ Native modules verified.');

// ─── Step 4: Compile Electron TypeScript ─────────────────────────────────────
header('STEP 4: Compiling Electron Main Process');
run('npm run electron:compile');
console.log('✓ TypeScript compiled successfully.');

// ─── Step 5: Build React renderer ────────────────────────────────────────────
header('STEP 5: Building React UI');
run('npx vite build --config vite.electron.config.ts');
console.log('✓ React UI built successfully.');

// ─── Step 6: Run electron-builder ────────────────────────────────────────────
header('STEP 6: Packaging into EXE Installer');
console.log('   This will:');
console.log('   - Download VC++ Redistributable if needed (~25 MB)');
console.log('   - Package everything into an NSIS installer EXE');
console.log('   - Output: release/Billing System Setup.exe\n');

run('npx electron-builder --win');

// ─── Done ─────────────────────────────────────────────────────────────────────
header('✅ BUILD COMPLETE');

const releaseDirs = fs.readdirSync(path.join(ROOT, 'release')).filter(f =>
  f.endsWith('.exe') && f.includes('Setup')
);

if (releaseDirs.length > 0) {
  console.log(`\n📦 Installer: release/${releaseDirs[0]}`);
  console.log(`   Full path: ${path.join(ROOT, 'release', releaseDirs[0])}`);
}

console.log('\n📋 Before distributing the installer:');
console.log('   1. Run: node installer/keygen.ts  (to generate license key for customer)');
console.log('   2. Copy license.key + features.dat to customer PC during install');
console.log('   3. Or: bundle them in the NSIS installer for automatic placement');
console.log('\n');
