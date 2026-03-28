/**
 * start.ts — CLI orchestrator
 *
 * Sequence:
 *   1. Spawn Express backend  (ts-node src/server/server.ts)
 *   2. Poll /health until ready (30s timeout)
 *   3. POST /api/ingest to load mock data
 *   4. Spawn Vite frontend    (npm run dev  inside ui/)
 *   5. Wait for Vite to bind  (poll localhost:5173, 30s timeout)
 *   6. Open browser
 *   7. Park — forward Ctrl+C to both children
 */

import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as http from 'http';

const ROOT         = path.resolve(__dirname, '..', '..');
const BACKEND_URL  = 'http://localhost:3001';
const FRONTEND_URL = 'http://localhost:5173';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string): void { console.log(`  ${msg}`); }

/** Poll a URL until it responds 200. Rejects after timeoutMs. */
function waitFor(url: string, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function attempt(): void {
      const req = http.get(url, (res) => {
        res.resume(); // drain body
        if (res.statusCode && res.statusCode < 400) {
          resolve();
        } else {
          retry();
        }
      });
      req.on('error', retry);
      req.setTimeout(1000, () => { req.destroy(); retry(); });
    }

    function retry(): void {
      if (Date.now() >= deadline) {
        reject(new Error(`Timed out waiting for ${url}`));
      } else {
        setTimeout(attempt, 1000);
      }
    }

    attempt();
  });
}

/** POST /api/ingest with source=mock */
async function ingest(): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/ingest`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ source: 'mock', wipe: false }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
}

/** Open the default browser cross-platform */
function openBrowser(url: string): void {
  const cmd =
    process.platform === 'win32' ? ['cmd', ['/c', `start ${url}`]] :
    process.platform === 'darwin' ? ['open', [url]]                 :
                                    ['xdg-open', [url]];

  spawn(cmd[0] as string, cmd[1] as string[], {
    shell: false, detached: true, stdio: 'ignore',
  }).unref();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export interface StartOptions {
  skipBrowser: boolean;
  source:      'mock' | 'live';
}

export async function runStart(opts: StartOptions): Promise<void> {
  console.log('\n' + '═'.repeat(62));
  console.log('  🔐 Kubernetes Attack Path Visualizer');
  console.log('═'.repeat(62) + '\n');

  // ── 1. Spawn backend ───────────────────────────────────────────────────────
  log('✔ Starting backend...');

  const backend: ChildProcess = spawn(
    'npx', ['ts-node', 'src/server/server.ts'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: true, env: process.env },
  );

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
  log('⏳ Waiting for backend to be ready...');
  try {
    await waitFor(`${BACKEND_URL}/health`, 60_000);
  } catch {
    console.error('\n  ❌ Backend did not start in time.');
    console.error('     Make sure Neo4j is running: cd docker && docker-compose up -d\n');
    backend.kill();
    process.exit(1);
  }
  log('✔ Backend ready');

  // ── 3. Ingest mock data ────────────────────────────────────────────────────
  log('✔ Loading cluster data...');
  try {
    await ingest();
    log('✔ Data ingested');
  } catch (err) {
    log(`⚠  Ingest warning: ${(err as Error).message}`);
    log('   UI will show empty state. Check Neo4j connection.');
  }

  // ── 4. Spawn frontend ──────────────────────────────────────────────────────
  log('✔ Starting UI...');

  const uiDir  = path.join(ROOT, 'ui');
  const frontend: ChildProcess = spawn(
    'npm', ['run', 'dev'],
    { cwd: uiDir, stdio: ['ignore', 'pipe', 'pipe'], shell: true, env: process.env },
  );

  frontend.stdout?.on('data', (d: Buffer) => {
    const line = d.toString().trim();
    if (line) process.stdout.write(`     [ui] ${line}\n`);
  });
  frontend.stderr?.on('data', (d: Buffer) => {
    const line = d.toString().trim();
    if (line) process.stderr.write(`     [ui] ${line}\n`);
  });

  // ── 5. Wait for Vite ──────────────────────────────────────────────────────
  try {
    await waitFor(FRONTEND_URL, 30_000);
  } catch {
    log('⚠  Vite did not respond in time — opening browser anyway');
  }

  // ── 6. Open browser ────────────────────────────────────────────────────────
  if (!opts.skipBrowser) {
    log('✔ Opening browser...');
    openBrowser(FRONTEND_URL);
  }

  // ── 7. Summary ─────────────────────────────────────────────────────────────
  console.log('\n  ' + '─'.repeat(58));
  console.log(`  ✔ System ready`);
  console.log(`     Backend  →  ${BACKEND_URL}`);
  console.log(`     UI       →  ${FRONTEND_URL}`);
  console.log('  ' + '─'.repeat(58));
  console.log('\n  Press Ctrl+C to stop.\n');

  // ── Shutdown handler ───────────────────────────────────────────────────────
  const shutdown = (): void => {
    log('Shutting down...');
    if (!backendExited) backend.kill('SIGTERM');
    frontend.kill('SIGTERM');
    setTimeout(() => process.exit(0), 800);
  };

  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);

  // Park the process indefinitely
  await new Promise(() => {});
}
