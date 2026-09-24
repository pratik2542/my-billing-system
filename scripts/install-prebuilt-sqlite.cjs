/**
 * install-prebuilt-sqlite.js
 * Downloads and installs the prebuilt better-sqlite3 binary for Electron
 * without needing to compile from source (no Visual Studio Build Tools needed).
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// Get current versions
const electronPkg = JSON.parse(fs.readFileSync('./node_modules/electron/package.json', 'utf8'));
const electronMajor = parseInt(electronPkg.version.split('.')[0]);

// Map Electron major version -> Electron module version (ABI)
const ELECTRON_ABI_MAP = {
  30: 121, 31: 123, 32: 128, 33: 130, 34: 132, 35: 133, 36: 135
};
const abiVersion = ELECTRON_ABI_MAP[electronMajor];
if (!abiVersion) {
  console.error(`Unknown Electron ABI for version ${electronMajor}. Update ELECTRON_ABI_MAP.`);
  process.exit(1);
}

// We know v12.12.0 has prebuilt for v133 (Electron 35)
const BETTER_SQLITE_VERSION = '12.12.0';
const TARBALL_URL = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${BETTER_SQLITE_VERSION}/better-sqlite3-v${BETTER_SQLITE_VERSION}-electron-v${abiVersion}-win32-x64.tar.gz`;
// Always install to project root node_modules, regardless of where this script is located
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEST_DIR = path.join(PROJECT_ROOT, 'node_modules', 'better-sqlite3', 'build', 'Release');
const TARBALL_PATH = path.join(os.tmpdir(), 'better-sqlite3-prebuilt.tar.gz');

console.log(`\n📦 Installing better-sqlite3 prebuilt binary`);
console.log(`   Electron: v${electronPkg.version} (ABI: ${abiVersion})`);
console.log(`   better-sqlite3: v${BETTER_SQLITE_VERSION} (prebuilt for Electron ${electronMajor})`);
console.log(`   URL: ${TARBALL_URL}\n`);

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    // Use PowerShell Invoke-WebRequest for reliable redirect-following on Windows
    const { spawn } = require('child_process');
    console.log('   Downloading (using PowerShell)...');
    const ps = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Invoke-WebRequest -Uri '${url}' -OutFile '${dest}' -UseBasicParsing`
    ], { stdio: 'inherit' });
    ps.on('close', (code) => {
      if (code === 0) {
        const size = require('fs').statSync(dest).size;
        if (size < 1000) {
          reject(new Error('Downloaded file is too small — likely failed'));
        } else {
          console.log(`   Downloaded: ${(size / 1024 / 1024).toFixed(1)} MB`);
          resolve();
        }
      } else {
        reject(new Error(`PowerShell download failed with exit code ${code}`));
      }
    });
    ps.on('error', reject);
  });
}

async function main() {
  // Download
  await downloadFile(TARBALL_URL, TARBALL_PATH);
  console.log(`✓ Downloaded to ${TARBALL_PATH}`);

  // Extract
  if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
  }

  console.log(`\n   Extracting to ${DEST_DIR}...`);
  
  // Use tar (available on Windows 10+)
  const extractDir = path.join(os.tmpdir(), 'better-sqlite3-extract');
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
  fs.mkdirSync(extractDir);

  execSync(`tar -xzf "${TARBALL_PATH}" -C "${extractDir}"`, { stdio: 'inherit' });

  // Find the .node file
  function findNodeFile(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.isDirectory()) {
        const found = findNodeFile(path.join(dir, f.name));
        if (found) return found;
      } else if (f.name.endsWith('.node')) {
        return path.join(dir, f.name);
      }
    }
    return null;
  }

  const nodeFile = findNodeFile(extractDir);
  if (!nodeFile) {
    throw new Error('Could not find .node file in extracted tarball');
  }

  const destFile = path.join(DEST_DIR, 'better_sqlite3.node');
  fs.copyFileSync(nodeFile, destFile);

  // Cleanup
  fs.unlinkSync(TARBALL_PATH);
  fs.rmSync(extractDir, { recursive: true });

  // Verify the .node file was installed correctly
  if (!fs.existsSync(destFile)) {
    throw new Error('Installation failed — .node file not found after extraction');
  }
  const fileSize = fs.statSync(destFile).size;
  if (fileSize < 100000) {
    throw new Error(`File too small (${fileSize} bytes) — likely corrupt download`);
  }
  console.log(`✓ Installed: ${destFile} (${(fileSize/1024/1024).toFixed(1)} MB)`);
  console.log('✓ Note: This binary is compiled for Electron — it will NOT load in plain Node.js (that is expected).');
  console.log('✓ It will work correctly when running inside Electron.\n');
}

main().catch(err => {
  console.error('\n✗ Failed:', err.message);
  console.error('\nManual fix: run "npm install better-sqlite3" with Visual Studio Build Tools installed');
  process.exit(1);
});
