/**
 * server.ts — Express server with strict boot sequence.
 *
 * Boot order (MUST succeed fully before accepting requests):
 *   1. Load environment variables (.env)
 *   2. verifyConnection()   — confirm Neo4j reachable + GDS installed
 *   3. ensureProjection()   — project the GDS in-memory graph
 *   4. Register middleware
 *   5. Mount all route files
 *   6. Register global error handler
 *
 * If Neo4j is unreachable the process exits immediately — no partial startup.
 */

import 'dotenv/config';

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

import { verifyConnection }  from '../db/neo4j-client';
import { ensureProjection }  from '../db/queries';

import ingestRouter          from './routes/ingest';
import graphRouter           from './routes/graph';
import pathsRouter           from './routes/paths';
import blastRouter           from './routes/blast';
import cyclesRouter          from './routes/cycles';
import reportRouter          from './routes/report';
import criticalRouter        from './routes/critical';
import simulateRouter        from './routes/simulate';
import vulnerabilitiesRouter from './routes/vulnerabilities';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const PORT = Number(process.env['PORT'] ?? 3001);

// ─────────────────────────────────────────────────────────────────────────────
// BOOT SEQUENCE
// ─────────────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  console.log('\n' + '═'.repeat(60));
  console.log('  🔐 Kubernetes Attack Path Visualizer — API Server');
  console.log('═'.repeat(60));

  // ── Step 1: Env already loaded via `import 'dotenv/config'` ──────────────
  console.log('\n  [1/3] Environment variables loaded');

  // ── Step 2: Verify Neo4j connection + GDS ────────────────────────────────
  console.log('\n  [2/3] Verifying Neo4j connection...');
  try {
    await verifyConnection();
  } catch (err) {
    console.error('\n  ❌ Neo4j unreachable — aborting startup.');
    console.error(`     ${err instanceof Error ? err.message : String(err)}`);
    console.error('\n  Run:  cd docker && docker-compose up -d');
    console.error('  Then wait ~60s for GDS to finish downloading.\n');
    process.exit(1);
  }

  // ── Step 3: Project GDS graph (reuse if exists, no force-refresh on boot) ─
  console.log('\n  [3/3] Ensuring GDS projection...');
  try {
    await ensureProjection(false);
  } catch (err) {
    // GDS projection failure is non-fatal on boot — the graph may not be
    // loaded yet (first run). Routes will re-project after /api/ingest.
    console.warn(`  ⚠  GDS projection skipped: ${err instanceof Error ? err.message : String(err)}`);
    console.warn('     Call POST /api/ingest to load graph data first.');
  }

  // ── Step 4: Create Express app + register middleware ──────────────────────
  const app = express();

  app.use(cors({ origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:3000' }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Minimal security headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`  → ${req.method} ${req.path}`);
    next();
  });

  // ── Step 5: Mount all routes ──────────────────────────────────────────────
  app.use('/api/ingest',           ingestRouter);
  app.use('/api/graph',            graphRouter);
  app.use('/api/paths',            pathsRouter);
  app.use('/api/vulnerabilities',  vulnerabilitiesRouter);
  app.use('/api/blast-radius',     blastRouter);
  app.use('/api/cycles',           cyclesRouter);
  app.use('/api/report',           reportRouter);
  app.use('/api/critical-node',    criticalRouter);
  app.use('/api/simulate',         simulateRouter);

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found' });
  });

  // ── Step 6: Global error handler ─────────────────────────────────────────
  // Must have 4 parameters for Express to recognise it as an error handler.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ Unhandled error: ${message}`);
    res.status(500).json({ error: 'Internal server error', detail: message });
  });

  // ── Start listening ───────────────────────────────────────────────────────
  app.listen(PORT, () => {
    console.log('\n' + '─'.repeat(60));
    console.log(`  ✔ Server ready  →  http://localhost:${PORT}`);
    console.log('');
    console.log('  Routes:');
    console.log('    POST /api/ingest');
    console.log('    GET  /api/graph');
    console.log('    GET  /api/paths');
    console.log('    GET  /api/vulnerabilities');
    console.log('    GET  /api/blast-radius?nodeId=<ns:name>');
    console.log('    GET  /api/cycles');
    console.log('    GET  /api/report');
    console.log('    GET  /api/critical-node');
    console.log('    POST /api/simulate');
    console.log('─'.repeat(60) + '\n');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

boot().catch((err) => {
  console.error(`\n❌ Fatal boot error: ${(err as Error).message}\n`);
  process.exit(1);
});
