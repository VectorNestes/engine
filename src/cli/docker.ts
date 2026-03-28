/**
 * docker.ts — Docker detection and Neo4j container lifecycle helpers.
 *
 * Used by the `start` and `ingest` CLI commands before they touch Neo4j.
 * The `scan` command is Docker-free and never calls this module.
 */

import { exec as execCb, spawn } from 'child_process';
import * as path from 'path';
import * as util from 'util';

const exec = util.promisify(execCb);

// ─── Constants ───────────────────────────────────────────────────────────────

const CONTAINER_NAME   = 'k8s-attack-neo4j';
const COMPOSE_DIR      = path.resolve(__dirname, '..', '..', 'docker');
const NEO4J_BOLT_PORT  = 7687;
const NEO4J_HTTP_PORT  = 7474;

// ─── Logging helpers ─────────────────────────────────────────────────────────

const ok   = (msg: string) => console.log(`  ✔  ${msg}`);
const warn = (msg: string) => console.log(`  ⚠  ${msg}`);
const fail = (msg: string) => console.error(`  ✖  ${msg}`);
const info = (msg: string) => console.log(`     ${msg}`);
const line = ()            => console.log('  ' + '─'.repeat(58));

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — Is Docker installed?
// ─────────────────────────────────────────────────────────────────────────────

export async function checkDockerInstalled(): Promise<boolean> {
  try {
    const { stdout } = await exec('docker --version');
    const version = stdout.trim().split('\n')[0] ?? 'unknown';
    ok(`Docker installed  (${version})`);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — Is the Docker daemon running?
// ─────────────────────────────────────────────────────────────────────────────

export async function checkDockerRunning(): Promise<boolean> {
  try {
    await exec('docker ps');
    ok('Docker daemon is running');
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — Is the Neo4j container already up?
// ─────────────────────────────────────────────────────────────────────────────

export async function isNeo4jContainerRunning(): Promise<boolean> {
  try {
    const { stdout } = await exec(
      `docker inspect --format "{{.State.Running}}" ${CONTAINER_NAME}`,
    );
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — Start Neo4j via docker-compose
// ─────────────────────────────────────────────────────────────────────────────

export async function startNeo4j(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      ['compose', 'up', '-d', '--remove-orphans'],
      { cwd: COMPOSE_DIR, stdio: 'pipe', shell: process.platform === 'win32' },
    );

    let stderr = '';
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.once('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`docker compose up failed (exit ${code}):\n${stderr.slice(0, 400)}`));
      }
    });

    child.once('error', reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — Poll until Neo4j Bolt port is accepting connections
// ─────────────────────────────────────────────────────────────────────────────

export async function waitForNeo4j(
  timeoutMs = 120_000,
  pollMs    = 3_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let attempt    = 0;

  while (Date.now() < deadline) {
    attempt++;
    try {
      // Use `docker exec` to run a lightweight cypher-shell ping
      await exec(
        `docker exec ${CONTAINER_NAME} cypher-shell -u neo4j -p password "RETURN 1" --format plain`,
      );
      return; // success
    } catch {
      const remaining = Math.ceil((deadline - Date.now()) / 1000);
      process.stdout.write(
        `\r     ⏳ Waiting for Neo4j... attempt ${attempt}  (${remaining}s left)  `,
      );
      await sleep(pollMs);
    }
  }

  process.stdout.write('\n');
  throw new Error(
    `Neo4j did not become ready within ${timeoutMs / 1000}s.\n` +
    `  Check container logs: docker logs ${CONTAINER_NAME}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 6 — Full preflight check (install → running → Neo4j)
// ─────────────────────────────────────────────────────────────────────────────

export interface PreflightResult {
  ok: boolean;
  /** true = Docker + Neo4j are ready, false = caller should abort */
}

/**
 * Run the full Docker preflight:
 *   1. Docker installed?
 *   2. Docker daemon running?
 *   3. Neo4j container up? (start it if not)
 *   4. Neo4j accepting connections?
 *
 * Prints clear, actionable messages for every failure case.
 * Never throws — returns { ok: false } so the caller can exit cleanly.
 */
export async function runPreflight(): Promise<PreflightResult> {
  console.log('\n' + '─'.repeat(62));
  console.log('  Docker & Neo4j Preflight');
  console.log('─'.repeat(62));

  // ── 1. Docker installed ───────────────────────────────────────────────────
  const installed = await checkDockerInstalled();
  if (!installed) {
    fail('Docker is not installed.\n');
    info('K8s-AV requires Docker to run Neo4j locally.');
    info('');
    info('  👉  Install Docker Desktop:');
    info('      https://www.docker.com/products/docker-desktop/');
    info('');
    info('  After installing, start Docker Desktop and re-run:');
    info('    npx k8s-av start');
    info('');
    info('  Or skip Neo4j and run in demo mode:');
    info('    npx k8s-av start --mock');
    line();
    return { ok: false };
  }

  // ── 2. Docker daemon running ──────────────────────────────────────────────
  const running = await checkDockerRunning();
  if (!running) {
    warn('Docker is installed but the daemon is not running.\n');
    info('  Please start Docker Desktop and try again.');
    info('');
    info('  Once running, re-run:');
    info('    npx k8s-av start');
    info('');
    info('  Or skip Neo4j and run in demo mode:');
    info('    npx k8s-av start --mock');
    line();
    return { ok: false };
  }

  // ── 3. Neo4j container ───────────────────────────────────────────────────
  const neo4jUp = await isNeo4jContainerRunning();

  if (neo4jUp) {
    ok(`Neo4j container running  (${CONTAINER_NAME})`);
  } else {
    info(`Neo4j container not found — starting it now...`);
    info(`  Working directory: ${COMPOSE_DIR}`);

    try {
      await startNeo4j();
      ok('Neo4j container started');
    } catch (err) {
      fail('Failed to start Neo4j container.\n');
      info(`  ${err instanceof Error ? err.message : String(err)}`);
      info('');
      info('  Try starting it manually:');
      info('    cd docker && docker compose up -d');
      info('');
      info('  Or run in demo mode (no Neo4j required):');
      info('    npx k8s-av start --mock');
      line();
      return { ok: false };
    }
  }

  // ── 4. Wait for Neo4j to be ready ────────────────────────────────────────
  info(`Neo4j ports: Bolt :${NEO4J_BOLT_PORT}  Browser :${NEO4J_HTTP_PORT}`);

  try {
    await waitForNeo4j(120_000);
    process.stdout.write('\n'); // clear the spinner line
    ok('Neo4j is ready');
  } catch (err) {
    process.stdout.write('\n');
    fail('Neo4j did not become ready in time.\n');
    info(`  ${err instanceof Error ? err.message : String(err)}`);
    info('');
    info('  View logs:  docker logs ' + CONTAINER_NAME);
    info('  Try again:  npx k8s-av start');
    line();
    return { ok: false };
  }

  line();
  return { ok: true };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Export port constants for health-check URLs
// ─────────────────────────────────────────────────────────────────────────────

export { NEO4J_BOLT_PORT, NEO4J_HTTP_PORT };
