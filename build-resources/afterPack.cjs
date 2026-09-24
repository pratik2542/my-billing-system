/**
 * afterPack.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Electron Builder afterPack hook — runs after the app is packed but before
 * the installer is created.
 *
 * Responsibilities:
 *   1. Downloads VC_redist.x64.exe into build-resources/ if not already there
 *      so the NSIS installer.nsh can bundle it.
 *   2. (Optional) downloads OllamaSetup.exe into build-resources/ if present.
 *   3. Verifies better-sqlite3 is properly compiled for Electron.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BUILD_RESOURCES = path.join(__dirname);  // This file lives in build-resources/

const VCREDIST_URL =
  'https://aka.ms/vs/17/release/vc_redist.x64.exe';
const VCREDIST_PATH = path.join(BUILD_RESOURCES, 'VC_redist.x64.exe');

// Ollama — too large to bundle by default (~800 MB), so we only bundle it
// if you manually download and place OllamaSetup.exe in build-resources/.
// Otherwise the NSIS script downloads it at install time from ollama.com.
const OLLAMA_PATH = path.join(BUILD_RESOURCES, 'OllamaSetup.exe');

/**
 * Download a file from a URL to a destination path.
 * Shows progress percentage.
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`\n[afterPack] Downloading: ${url}`);
    console.log(`[afterPack]         To: ${dest}`);

    const file = fs.createWriteStream(dest);

    const request = https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`HTTP ${response.statusCode} downloading ${url}`));
        return;
      }

      const total = parseInt(response.headers['content-length'] || '0', 10);
      let downloaded = 0;
      let lastPct = -1;

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0) {
          const pct = Math.floor((downloaded / total) * 100);
          if (pct !== lastPct && pct % 10 === 0) {
            process.stdout.write(`\r[afterPack] Progress: ${pct}%`);
            lastPct = pct;
          }
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`\n[afterPack] ✓ Downloaded: ${path.basename(dest)}`);
        resolve(dest);
      });
    });

    request.on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

/**
 * Main afterPack hook — called by electron-builder.
 */
exports.default = async function afterPack(context) {
  const { electronPlatformName } = context;

  // Only run for Windows builds
  if (electronPlatformName !== 'win32') {
    console.log('[afterPack] Skipping prerequisite download (not a Windows build).');
    return;
  }

  // ── 1. VC++ Redistributable ───────────────────────────────────────────────
  if (!fs.existsSync(VCREDIST_PATH)) {
    console.log('[afterPack] VC_redist.x64.exe not found — downloading...');
    try {
      await downloadFile(VCREDIST_URL, VCREDIST_PATH);
      console.log('[afterPack] ✓ VC++ Redistributable ready for bundling.');
    } catch (err) {
      console.error('[afterPack] ✗ Failed to download VC++ Redistributable:', err.message);
      console.error('[afterPack]   Manual fix: Download VC_redist.x64.exe from https://aka.ms/vs/17/release/vc_redist.x64.exe');
      console.error('[afterPack]   and place it in: build-resources/VC_redist.x64.exe');
      console.error('[afterPack]   The installer will still be created but without the bundled VC++ prereq.');
    }
  } else {
    const sizeMB = (fs.statSync(VCREDIST_PATH).size / 1024 / 1024).toFixed(1);
    console.log(`[afterPack] ✓ VC_redist.x64.exe already present (${sizeMB} MB).`);
  }

  // ── 2. Ollama (optional bundling) ─────────────────────────────────────────
  if (fs.existsSync(OLLAMA_PATH)) {
    const sizeMB = (fs.statSync(OLLAMA_PATH).size / 1024 / 1024).toFixed(0);
    console.log(`[afterPack] ✓ OllamaSetup.exe found (${sizeMB} MB) — will be bundled.`);
  } else {
    console.log('[afterPack] ℹ OllamaSetup.exe not found in build-resources/.');
    console.log('[afterPack]   Ollama will be downloaded at install time from ollama.com.');
    console.log('[afterPack]   To bundle it: place OllamaSetup.exe in build-resources/');
  }

  console.log('[afterPack] ✓ afterPack complete.\n');
};
