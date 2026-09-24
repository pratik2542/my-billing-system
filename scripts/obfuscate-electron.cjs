/**
 * obfuscate-electron.cjs
 * Hardens Electron main-process JavaScript using javascript-obfuscator.
 * Run automatically after `tsc --project tsconfig.electron.json`.
 */

const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ELECTRON_DIR = path.resolve(__dirname, '..', 'electron');

const OBFUSCATOR_OPTIONS = {
  target: 'node',
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  numbersToExpressions: true,
  simplify: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.8,
  splitStrings: true,
  splitStringsChunkLength: 8,
  transformObjectKeys: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false, // Must be false for Node.js CommonJS module/exports/require
  reservedNames: [
    'module',
    'exports',
    'require',
    '__dirname',
    '__filename',
    'process',
    'global',
    'Buffer'
  ]
};

const FILES_TO_OBFUSCATE = [
  'license.js',
  'features.js',
  'main.js',
  'preload.js',
  'database.js',
  'backup.js',
  'ai.js'
];

console.log('[Obfuscator] Starting code obfuscation for Electron files...');

let count = 0;
for (const file of FILES_TO_OBFUSCATE) {
  const filePath = path.join(ELECTRON_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`[Obfuscator] Skipping missing file: ${file}`);
    continue;
  }

  const originalSource = fs.readFileSync(filePath, 'utf8');
  try {
    const obfuscationResult = JavaScriptObfuscator.obfuscate(originalSource, OBFUSCATOR_OPTIONS);
    fs.writeFileSync(filePath, obfuscationResult.getObfuscatedCode(), 'utf8');
    console.log(`[Obfuscator] Obfuscated: electron/${file}`);
    count++;
  } catch (err) {
    console.error(`[Obfuscator] Error obfuscating ${file}:`, err);
    process.exit(1);
  }
}

console.log(`[Obfuscator] Successfully obfuscated ${count} files.`);
