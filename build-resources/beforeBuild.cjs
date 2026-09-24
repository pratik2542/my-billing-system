/**
 * beforeBuild.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Electron Builder beforeBuild hook.
 *
 * Uses pre-compiled binaries for better-sqlite3 to avoid requiring
 * Visual Studio Build Tools on the build machine.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { execSync } = require('child_process');
const path = require('path');

exports.default = async function beforeBuild(context) {
  const { appDir } = context;

  console.log('\n[beforeBuild] Installing better-sqlite3 prebuilt binary for Electron...');

  try {
    execSync('node scripts/install-prebuilt-sqlite.cjs', {
      cwd: appDir,
      stdio: 'inherit',
    });
    console.log('[beforeBuild] ✓ better-sqlite3 ready.\n');
  } catch (err) {
    console.error('[beforeBuild] ✗ Failed to install prebuilt binary:', err.message);
    console.error('[beforeBuild]   Trying fallback: electron-rebuild...');
    try {
      execSync('npx electron-rebuild -f -w better-sqlite3', {
        cwd: appDir,
        stdio: 'inherit',
      });
      console.log('[beforeBuild] ✓ Fallback rebuild succeeded.\n');
    } catch (err2) {
      console.error('[beforeBuild] ✗ Fallback also failed. Native SQLite may not work.');
      // Don't throw — let the build continue; it may still work on the target machine
    }
  }
};
