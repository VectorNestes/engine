import { exec as execCb, spawn, type ChildProcess } from 'child_process';
import * as fs   from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as util from 'util';

import { runPreflight } from './docker';

const exec = util.promisify(execCb);

const ROOT         = path.resolve(__dirname, '..', '..');
const UI_DIR       = path.join(ROOT, 'ui');
const BACKEND_URL  = 'http://localhost:3001';
const DEFAULT_FRONTEND_URL = 'http://localhost:5174';

const log  = (msg: string) => console.log(`  ${msg}`);
const warn = (msg: string) => console.log(`  ! ${msg}`);

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

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'win32'  ? ['cmd',      ['/c', 'start', '""', url]] :
    process.platform === 'darwin' ? ['open',     [url]]                  :
                                    ['xdg-open', [url]];

  spawn(cmd, args, { shell: false, detached: true, stdio: 'ignore' }).unref();
}

function extractFrontendUrl(line: string): string | null {
  // Strip ANSI escape codes that Vite adds
  // eslint-disable-next-line no-control-regex
  const cleanLine = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  const match = cleanLine.match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[[^\]]+\]):\d+/i);
  return match?.[0] ?? null;
}

function splitOutputLines(chunk: Buffer): string[] {
  return chunk
    .toString('utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function ensureUiDeps(): Promise<void> {
  const nmDir = path.join(UI_DIR, 'node_modules');
  const requiredPackages = [
    path.join(nmDir, 'vite', 'package.json'),
    path.join(nmDir, '@vitejs', 'plugin-react', 'package.json'),
  ];
  const hasUiDeps = fs.existsSync(nmDir) && requiredPackages.every((pkg) => fs.existsSync(pkg));
  if (hasUiDeps) return;

  log(fs.existsSync(nmDir)
    ? 'Repairing incomplete UI dependencies...'
    : 'Installing UI dependencies (first run)...');
  try {
    await exec('npm install', { cwd: UI_DIR });
    log('UI dependencies installed');
  } catch (err) {
    throw new Error(
      `Failed to install UI deps in ${UI_DIR}:\n` +
      `  ${err instanceof Error ? err.message : String(err)}\n` +
      '  Try: cd ui && npm install',
    );
  }
}

export interface StartOptions {
  skipBrowser: boolean;
  source:      'mock' | 'live';
}

export async function runStart(opts: StartOptions): Promise<void> {
  console.log('\n' + '='.repeat(62));
  console.log('  Kubernetes Attack Path Visualizer');
  console.log('  ' + (opts.source === 'mock' ? 'Demo mode (mock data)' : 'Live cluster mode'));
  console.log('='.repeat(62));

  let frontendUrl = DEFAULT_FRONTEND_URL;
  let frontendUrlGenerated = false;
  let uiBootstrapLogged = false;
  let uiReadyLogged = false;

  if (opts.source === 'mock') {
    console.log('\n  Info: Mock mode - skipping Docker and Neo4j preflight.');
  } else {
    const preflight = await runPreflight();
    if (!preflight.ok) process.exit(1);
  }

  console.log();

  log('Starting backend...');

  const distServer = path.join(ROOT, 'dist', 'server', 'server.js');
  const [backendCmd, backendArgs] = fs.existsSync(distServer)
    ? ['node',  [distServer]]
    : ['npx',   ['ts-node', path.join(ROOT, 'src', 'server', 'server.ts')]];

  const backend: ChildProcess = spawn(backendCmd, backendArgs, {
    cwd:   ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env:   { ...process.env, CORS_ORIGIN: frontendUrl },
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
      console.error(`\n  ERROR: Backend exited with code ${code}`);
      process.exit(1);
    }
  });

  log('Waiting for backend...');
  try {
    await waitFor(`${BACKEND_URL}/health`, 60_000);
  } catch {
    console.error('\n  ERROR: Backend did not start within 60s.');
    if (opts.source !== 'mock') {
      console.error('     Ensure Neo4j is running:');
      console.error('       cd docker && docker compose up -d');
    }
    backend.kill();
    process.exit(1);
  }
  log('Backend ready');

  log(opts.source === 'live'
    ? 'Getting cluster data from kubectl...'
    : 'Loading bundled mock cluster data...');
  try {
    await ingest(opts.source);
    log('Data loaded');
  } catch (err) {
    warn(`Ingest warning: ${(err as Error).message}`);
    warn('UI will start in empty state - check Neo4j connection.');
  }

  try {
    await ensureUiDeps();
  } catch (err) {
    console.error(`\n  ERROR: ${(err as Error).message}`);
    backend.kill();
    process.exit(1);
  }

  log('Starting UI...');

  const frontend: ChildProcess = spawn('npm', ['run', 'dev'], {
    cwd:   UI_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env:   process.env,
  });

  let stdoutBuffer = '';
  frontend.stdout?.on('data', (d: Buffer) => {
    stdoutBuffer += d.toString('utf8');
    const parts = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = parts.pop() ?? '';

    for (const line of parts) {
      const lineClean = line.trim();
      if (!lineClean) continue;

      const detectedUrl = extractFrontendUrl(lineClean);

      if (detectedUrl) {
        frontendUrl = detectedUrl;
        frontendUrlGenerated = true;
        if (!uiReadyLogged) {
          log('UI server ready');
          uiReadyLogged = true;
        }
        continue;
      }

      const normalized = lineClean.toLowerCase();
      if (!uiBootstrapLogged && (
        normalized.includes('vite v') ||
        normalized.includes('ready in') ||
        normalized.includes('starting') ||
        normalized.includes('building')
      )) {
        log('Preparing UI assets...');
        uiBootstrapLogged = true;
      }
    }
  });

  let stderrBuffer = '';
  frontend.stderr?.on('data', (d: Buffer) => {
    stderrBuffer += d.toString('utf8');
    const parts = stderrBuffer.split(/\r?\n/);
    stderrBuffer = parts.pop() ?? '';

    for (const line of parts) {
      const lineClean = line.trim();
      if (!lineClean) continue;

      const detectedUrl = extractFrontendUrl(lineClean);

      if (detectedUrl) {
        frontendUrl = detectedUrl;
        frontendUrlGenerated = true;
        if (!uiReadyLogged) {
          log('UI server ready');
          uiReadyLogged = true;
        }
        continue;
      }

      const normalized = lineClean.toLowerCase();
      if (!uiBootstrapLogged && (
        normalized.includes('vite v') ||
        normalized.includes('ready in') ||
        normalized.includes('starting') ||
        normalized.includes('building')
      )) {
        log('Preparing UI assets...');
        uiBootstrapLogged = true;
        continue;
      }

      if (
        normalized.includes('error') ||
        normalized.includes('failed') ||
        normalized.includes('address already in use')
      ) {
        process.stderr.write(`     [ui] ${lineClean}\n`);
      }
    }
  });

  try {
    await waitFor(frontendUrl, 45_000);
  } catch {
    warn('UI did not respond in time.');
  }

  if (!opts.skipBrowser && frontendUrlGenerated) {
    log('Opening browser...');
    openBrowser(frontendUrl);
  } else if (!opts.skipBrowser && !frontendUrlGenerated) {
    warn('Browser not opened because the UI URL has not been generated yet.');
  }

  console.log('\n  ' + '-'.repeat(58));
  console.log('  System ready');
  console.log(`     Backend  ->  ${BACKEND_URL}`);
  if (frontendUrlGenerated) {
    console.log(`     UI       ->  ${frontendUrl}`);
  }
  console.log('  ' + '-'.repeat(58));
  console.log('\n  Press Ctrl+C to stop.\n');

  const shutdown = (): void => {
    log('Shutting down...');
    if (!backendExited) backend.kill('SIGTERM');
    frontend.kill('SIGTERM');
    setTimeout(() => process.exit(0), 800);
  };

  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);

  await new Promise(() => {});
}
