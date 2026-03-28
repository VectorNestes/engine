/**
 * start.ts — CLI orchestrator
 *
 * Sequence:
 *   0. Docker + Neo4j preflight  (skipped with --mock)
 *   1. Spawn Express backend     (ts-node or node dist/server/server.js)
 *   2. Poll /health until ready  (60s timeout)
 *   3. POST /api/ingest          (load cluster data)
 *   4. Ensure UI deps installed  (npm install inside ui/ if needed)
 *   5. Spawn Vite frontend       (npm run dev inside ui/)
 *   6. Wait for Vite             (poll localhost:5173, 30s timeout)
 *   7. Open browser
 *   8. Park — Ctrl+C kills both children cleanly
 */

import { exec as execCb, spawn, type ChildProcess } from 'child_process';
import * as fs   from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as util from 'util';

import { runPreflight } from './docker';

const exec = util.promisify(execCb);

// ─── Resolved paths ───────────────────────────────────────────────────────────
// __dirname is dist/cli/ at runtime (both ts-node and compiled).
// ROOT is always the package root (two levels up from dist/cli/).
const ROOT         = path.resolve(__dirname, '..', '..');
const UI_DIR       = path.join(ROOT, 'ui');
const BACKEND_URL  = 'http://localhost:3001';
const FRONTEND_URL = 'http://localhost:5173';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const log  = (msg: string) => console.log(`  ${msg}`);
const warn = (msg: string) => console.log(`  ⚠  ${msg}`);

/** Poll a URL until it responds < 400. Rejects after timeoutMs. */
function waitFor(url: string, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function attempt(): void {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 400) resolve();
        else retry();
      });
      req.on('error', retry);
      req.setTimeout(1000, () => { req.destroy(); retry(); });
    }

    function retry(): void {
      if (Date.now() >= deadline) reject(new Error(`Timed out waiting for ${url}`));
      else setTimeout(attempt, 1000);
    }

    attempt();
  });
}

/** POST /api/ingest — load cluster data into Neo4j */
async function ingest(source: 'mock' | 'live'): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/ingest`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ source, wipe: false }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
}

/** Open the system default browser cross-platform */
function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'win32'  ? ['cmd',      ['/c', `start ${url}`]] :
    process.platform === 'darwin' ? ['open',     [url]]                  :
                                    ['xdg-open', [url]];

  spawn(cmd, args, { shell: false, detached: true, stdio: 'ignore' }).unref();
}

/**
 * Ensure the ui/ directory has its node_modules installed.
 * Runs `npm install --omit=dev` inside ui/ if node_modules is absent.
 * This handles the `npx k8s-av` case where ui/node_modules is not present.
 */
async function ensureUiDeps(): Promise<void> {
  const nmDir = path.join(UI_DIR, 'node_modules');
  if (fs.existsSync(nmDir)) return;

  log('📦 Installing UI dependencies (first run)...');
  try {
    await exec('npm install --omit=dev', { cwd: UI_DIR });
    log('✔ UI dependencies installed');
  } catch (err) {
    throw new Error(
      `Failed to install UI deps in ${UI_DIR}:\n` +
      `  ${err instanceof Error ? err.message : String(err)}\n` +
      '  Try: cd ui && npm install',
    );
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export interface StartOptions {
  skipBrowser: boolean;
  source:      'mock' | 'live';
}

export async function runStart(opts: StartOptions): Promise<void> {
  console.log('\n' + '═'.repeat(62));
  console.log('  🔐 Kubernetes Attack Path Visualizer');
  console.log('  ' + (opts.source === 'mock' ? 'Demo mode (mock data)' : 'Live cluster mode'));
  console.log('═'.repeat(62));

  // ── 0. Docker preflight (skipped in mock mode) ────────────────────────────
  if (opts.source === 'mock') {
    console.log('\n  ℹ  Mock mode — skipping Docker & Neo4j preflight.');
  } else {
    const preflight = await runPreflight();
    if (!preflight.ok) process.exit(1);
  }

  console.log();

  // ── 1. Spawn backend ───────────────────────────────────────────────────────
  log('✔ Starting backend...');

  // Use compiled JS if available (npm package context), fall back to ts-node
  const distServer = path.join(ROOT, 'dist', 'server', 'server.js');
  const [backendCmd, backendArgs] = fs.existsSync(distServer)
    ? ['node',  [distServer]]
    : ['npx',   ['ts-node', path.join(ROOT, 'src', 'server', 'server.ts')]];

  const backend: ChildProcess = spawn(backendCmd, backendArgs, {
    cwd:   ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env:   { ...process.env, CORS_ORIGIN: FRONTEND_URL },
  });

  let backendExited = false;

  backend.stdout?.on('data', (d: Buffer) => {
    const line = d.toString().trim();
    if (line) process.stdout.write(`     [backend] ${line}\n`);
  });
  backend.stderr?.on('data', (d: Buffer) => {
    const line = d.toString().trim();
    if (line) process.stderr.write(`     [backend] ${line}\n`);
  });
  backend.once('exit', (code) => {
    backendExited = true;
    if (code !== 0 && code !== null) {
      console.error(`\n  ❌ Backend exited with code ${code}`);
      process.exit(1);
    }
  });

  // ── 2. Wait for backend ────────────────────────────────────────────────────
  log('⏳ Waiting for backend...');
  try {
    await waitFor(`${BACKEND_URL}/health`, 60_000);
  } catch {
    console.error('\n  ❌ Backend did not start within 60s.');
    if (opts.source !== 'mock') {
      console.error('     Ensure Neo4j is running:');
      console.error('       cd docker && docker compose up -d');
    }
    backend.kill();
    process.exit(1);
  }
  log('✔ Backend ready');

  // ── 3. Ingest data ────────────────────────────────────────────────────────
  log(`✔ Loading cluster data (source: ${opts.source})...`);
  try {
    await ingest(opts.source);
    log('✔ Data loaded');
  } catch (err) {
    warn(`Ingest warning: ${(err as Error).message}`);
    warn('   UI will start in empty state — check Neo4j connection.');
  }

  // ── 4. Ensure UI dependencies ─────────────────────────────────────────────
  try {
    await ensureUiDeps();
  } catch (err) {
    console.error(`\n  ❌ ${(err as Error).message}`);
    backend.kill();
    process.exit(1);
  }

  // ── 5. Spawn frontend ─────────────────────────────────────────────────────
  log('✔ Starting UI...');

  const frontend: ChildProcess = spawn('npm', ['run', 'dev'], {
    cwd:   UI_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env:   process.env,
  });

  frontend.stdout?.on('data', (d: Buffer) => {
    const line = d.toString().trim();
    if (line) process.stdout.write(`     [ui] ${line}\n`);
  });
  frontend.stderr?.on('data', (d: Buffer) => {
    const line = d.toString().trim();
    if (line) process.stderr.write(`     [ui] ${line}\n`);
  });

  // ── 6. Wait for Vite ──────────────────────────────────────────────────────
  try {
    await waitFor(FRONTEND_URL, 45_000);
  } catch {
    warn('Vite did not respond in time — opening browser anyway.');
  }

  // ── 7. Open browser ───────────────────────────────────────────────────────
  if (!opts.skipBrowser) {
    log('✔ Opening browser...');
    openBrowser(FRONTEND_URL);
  }

  // ── 8. Summary ────────────────────────────────────────────────────────────
  console.log('\n  ' + '─'.repeat(58));
  console.log('  ✔ System ready');
  console.log(`     Backend  →  ${BACKEND_URL}`);
  console.log(`     UI       →  ${FRONTEND_URL}`);
  console.log('  ' + '─'.repeat(58));
  console.log('\n  Press Ctrl+C to stop.\n');

  // ── Shutdown handler ──────────────────────────────────────────────────────
  const shutdown = (): void => {
    log('Shutting down...');
    if (!backendExited) backend.kill('SIGTERM');
    frontend.kill('SIGTERM');
    setTimeout(() => process.exit(0), 800);
  };

  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);

  // Park indefinitely until Ctrl+C
  await new Promise(() => {});
}
