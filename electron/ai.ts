import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { loadFeatures } from './features';

// ─── Model Selection ──────────────────────────────────────────────────────────
// Recommended models by PC spec tier:
//   Budget  (4–8 GB RAM, i5 4th–7th gen)  → qwen2.5:1.5b (0.9 GB)
//   Low (4–6 GB RAM)         → phi3.5:mini    (2.2 GB)
//   Standard (8–16 GB RAM)   → qwen2.5:7b     (4.7 GB) ← DEFAULT  ⭐ Best for billing/GST
//   High (16–32 GB RAM)      → qwen2.5:14b    (9.0 GB)
//   Ultra (32 GB+ RAM)       → qwen2.5:32b    (20 GB)
//
// Default is qwen2.5:7b — excellent at structured data, numbers, GST/invoice analysis.
//
// The admin selects the model in the feature wizard based on customer PC specs.

const OLLAMA_HOST = 'http://127.0.0.1:11434';
const OLLAMA_TIMEOUT_MS = 30_000;

let _ollamaProcess: ChildProcess | null = null;
let _ollamaReady = false;

// ─── Check if Ollama is installed ────────────────────────────────────────────
function getOllamaExecutable(): string {
  // Try common install locations on Windows
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Ollama', 'ollama.exe'),
    'ollama', // if in PATH
  ];
  for (const c of candidates) {
    if (c === 'ollama') return c; // Will be resolved via PATH
    if (fs.existsSync(c)) return c;
  }
  return 'ollama';
}

// ─── Start Ollama Server ──────────────────────────────────────────────────────
export async function startOllama(): Promise<{ started: boolean; error?: string }> {
  const features = loadFeatures();
  if (!features.enableAiAnalyst) {
    return { started: false, error: 'AI feature not enabled in this license.' };
  }

  // Check if already running (user may have started it manually)
  if (await isOllamaHealthy()) {
    _ollamaReady = true;
    console.log('[AI] Ollama already running');
    return { started: true };
  }

  const ollamaBin = getOllamaExecutable();
  console.log('[AI] Starting Ollama:', ollamaBin);

  try {
    _ollamaProcess = spawn(ollamaBin, ['serve'], {
      detached: false,
      stdio: 'ignore',
      windowsHide: true,
    });

    _ollamaProcess.on('error', (e) => {
      console.error('[AI] Ollama process error:', e.message);
      _ollamaReady = false;
    });

    _ollamaProcess.on('exit', (code) => {
      console.log('[AI] Ollama exited with code:', code);
      _ollamaReady = false;
      _ollamaProcess = null;
    });

    // Wait for Ollama to become ready (up to 15 seconds)
    const ready = await waitForOllama(15_000);
    if (ready) {
      _ollamaReady = true;
      // Ensure the required model is pulled
      await ensureModelPulled(features.ollamaModel || 'qwen2.5:7b');
      return { started: true };
    } else {
      return { started: false, error: 'Ollama started but did not become ready in time.' };
    }
  } catch (e: any) {
    return { started: false, error: `Failed to start Ollama: ${e.message}. Please install Ollama from https://ollama.com` };
  }
}

async function waitForOllama(timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isOllamaHealthy()) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function isOllamaHealthy(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Ensure Model is Pulled ───────────────────────────────────────────────────
async function ensureModelPulled(model: string): Promise<void> {
  try {
    // Check if model exists locally
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    const data = await res.json() as any;
    const models: string[] = (data.models || []).map((m: any) => m.name);

    if (models.some(m => m.startsWith(model.replace(':latest', '')))) {
      console.log(`[AI] Model ${model} already available`);
      return;
    }

    // Pull the model (this can take a while for first install)
    console.log(`[AI] Pulling model ${model}...`);
    const pullRes = await fetch(`${OLLAMA_HOST}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: false }),
    });

    if (!pullRes.ok) {
      console.error('[AI] Failed to pull model:', await pullRes.text());
    } else {
      console.log(`[AI] Model ${model} pulled successfully`);
    }
  } catch (e) {
    console.warn('[AI] Could not check/pull model:', e);
  }
}

// ─── Stop Ollama ──────────────────────────────────────────────────────────────
export function stopOllama(): void {
  if (_ollamaProcess) {
    _ollamaProcess.kill();
    _ollamaProcess = null;
    _ollamaReady = false;
    console.log('[AI] Ollama stopped');
  }
}

// ─── Chat Completion (replaces Gemini API in offline mode) ───────────────────
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResult {
  success: boolean;
  content?: string;
  error?: string;
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<ChatCompletionResult> {
  const features = loadFeatures();

  if (!features.enableAiAnalyst) {
    return { success: false, error: 'AI analytics is not enabled in your license.' };
  }

  if (!_ollamaReady) {
    return { success: false, error: 'AI service is not running. Please restart the application.' };
  }

  const model = features.ollamaModel || 'qwen2.5:7b';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.3,
          num_predict: options.maxTokens ?? 2048,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `AI error: ${errText}` };
    }

    const data = await res.json() as any;
    const content = data.message?.content || '';
    return { success: true, content };
  } catch (e: any) {
    if (e.name === 'AbortError') {
      return { success: false, error: 'AI request timed out. The model may be busy.' };
    }
    return { success: false, error: `AI error: ${e.message}` };
  }
}

// ─── Get AI Status ────────────────────────────────────────────────────────────
export async function getAiStatus(): Promise<{
  enabled: boolean;
  ollamaRunning: boolean;
  model: string;
  modelAvailable: boolean;
}> {
  const features = loadFeatures();
  const enabled = features.enableAiAnalyst;
  const model = features.ollamaModel || 'qwen2.5:7b';

  if (!enabled) return { enabled: false, ollamaRunning: false, model, modelAvailable: false };

  const ollamaRunning = await isOllamaHealthy();
  let modelAvailable = false;

  if (ollamaRunning) {
    try {
      const res = await fetch(`${OLLAMA_HOST}/api/tags`);
      const data = await res.json() as any;
      const models: string[] = (data.models || []).map((m: any) => m.name);
      modelAvailable = models.some(m => m.startsWith(model.replace(':latest', '')));
    } catch { /* ignore */ }
  }

  return { enabled, ollamaRunning, model, modelAvailable };
}

// ─── List Available Models ────────────────────────────────────────────────────
export async function listLocalModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    const data = await res.json() as any;
    return (data.models || []).map((m: any) => m.name);
  } catch {
    return [];
  }
}
