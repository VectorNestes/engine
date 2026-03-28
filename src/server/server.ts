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

const PORT = Number(process.env['PORT'] ?? 3001);

async function boot(): Promise<void> {
  console.log('\n' + '═'.repeat(60));
  console.log('  🔐 Kubernetes Attack Path Visualizer — API Server');
  console.log('═'.repeat(60));

  console.log('\n  [1/3] Environment variables loaded');

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

  console.log('\n  [3/3] Ensuring GDS projection...');
  try {
    await ensureProjection(false);
  } catch (err) {
    console.warn(`  ⚠  GDS projection skipped: ${err instanceof Error ? err.message : String(err)}`);
    console.warn('     Call POST /api/ingest to load graph data first.');
  }

  const app = express();

  app.use(cors({ origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:3000' }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`  → ${req.method} ${req.path}`);
    next();
  });

  app.use('/api/ingest',           ingestRouter);
  app.use('/api/graph',            graphRouter);
  app.use('/api/paths',            pathsRouter);
  app.use('/api/vulnerabilities',  vulnerabilitiesRouter);
  app.use('/api/blast-radius',     blastRouter);
  app.use('/api/cycles',           cyclesRouter);
  app.use('/api/report',           reportRouter);
  app.use('/api/critical-node',    criticalRouter);
  app.use('/api/simulate',         simulateRouter);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ Unhandled error: ${message}`);
    res.status(500).json({ error: 'Internal server error', detail: message });
  });

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

boot().catch((err) => {
  console.error(`\n❌ Fatal boot error: ${(err as Error).message}\n`);
  process.exit(1);
});
