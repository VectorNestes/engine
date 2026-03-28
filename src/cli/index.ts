#!/usr/bin/env node
/**
 * Kubernetes Attack Path Visualizer — CLI Entry Point
 *
 * Commands:
 *   scan    — fetch + transform + enrich → write cluster-graph.json  (no Neo4j)
 *   ingest  — full pipeline: scan → load Neo4j → re-project GDS
 *   report  — generate + print attack report from Neo4j
 *
 * Usage:
 *   npx ts-node src/cli/index.ts scan   --mock
 *   npx ts-node src/cli/index.ts ingest --source mock
 *   npx ts-node src/cli/index.ts report --format text
 */

import 'dotenv/config';

import { Command } from 'commander';
import { runScan }  from './scan';

import { ingestCluster }  from '../services/ingestion.service';
import { loadGraph }      from '../db/loader';
import { ensureProjection } from '../db/queries';
import { verifyConnection } from '../db/neo4j-client';
import { generateReport }   from '../services/report/generator';
import { formatReport }     from '../services/report/formatter';

const program = new Command();

program
  .name('k8s-attack-viz')
  .description(
    'Kubernetes RBAC Attack Path Visualizer\n' +
    'Ingests cluster data, builds an RBAC graph, enriches with CVEs,\n' +
    'detects attack paths from entry points to crown jewels.'
  )
  .version('1.0.0', '-v, --version');

// ─────────────────────────────────────────────────────────────────────────────
// scan — local pipeline only (no Neo4j)
// ─────────────────────────────────────────────────────────────────────────────

program
  .command('scan')
  .description('Scan a Kubernetes cluster and output an attack-path graph (no Neo4j)')
  .option('--mock',              'Use bundled mock data instead of kubectl', false)
  .option('--output <file>',     'Path for the output JSON file', 'cluster-graph.json')
  .option('--skip-cve',          'Skip CVE enrichment', false)
  .option('--verbose',           'Print all attack paths', false)
  .action(async (opts: { mock: boolean; output: string; skipCve: boolean; verbose: boolean }) => {
    try {
      await runScan({ mock: opts.mock, output: opts.output, skipCve: opts.skipCve, verbose: opts.verbose });
      process.exit(0);
    } catch (err) {
      console.error(`\n❌  Scan failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// ingest — full pipeline: scan → Neo4j → GDS
// Reuses same services as POST /api/ingest
// ─────────────────────────────────────────────────────────────────────────────

program
  .command('ingest')
  .description('Full ingestion: fetch cluster data → load Neo4j → re-project GDS')
  .option('--source <source>',   'Data source: mock | live', 'mock')
  .option('--skip-cve',          'Skip CVE enrichment (faster)', false)
  .option('--wipe',              'Wipe existing Neo4j graph before loading', false)
  .action(async (opts: { source: string; skipCve: boolean; wipe: boolean }) => {
    const source = opts.source === 'live' ? 'live' : 'mock';

    try {
      console.log('\n' + '═'.repeat(60));
      console.log('  🔷 K8s Attack Path Visualizer — Ingest');
      console.log('═'.repeat(60));

      // Verify Neo4j before doing anything
      console.log('\n  Connecting to Neo4j...');
      await verifyConnection();

      // ── Step 1: ingestCluster (Teammate 1) ───────────────────────────────
      console.log('\n  [1/3] Ingesting cluster data...');
      const ingestResult = await ingestCluster({ source, skipCve: opts.skipCve });
      console.log(`  ✔ Graph JSON written: ${ingestResult.nodes} nodes, ${ingestResult.edges} edges`);

      // ── Step 2: loadGraph (Teammate 2) ───────────────────────────────────
      console.log('\n  [2/3] Loading graph into Neo4j...');
      const stats = await loadGraph(ingestResult.graphPath, opts.wipe);
      console.log(`  ✔ Neo4j: ${stats.nodesLoaded} nodes, ${stats.edgesLoaded} edges (${stats.durationMs}ms)`);

      // ── Step 3: Re-project GDS ────────────────────────────────────────────
      console.log('\n  [3/3] Projecting GDS graph...');
      await ensureProjection(true);
      console.log('  ✔ GDS projection ready');

      console.log('\n' + '─'.repeat(60));
      console.log('  ✔ Ingestion complete. Run `report` to analyse.\n');
      process.exit(0);
    } catch (err) {
      console.error(`\n❌  Ingest failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// report — generate + print attack report
// Reuses same generator + formatter as GET /api/report
// ─────────────────────────────────────────────────────────────────────────────

program
  .command('report')
  .description('Generate a full attack-path report from Neo4j data')
  .option('--format <format>',   'Output format: text | json', 'text')
  .action(async (opts: { format: string }) => {
    const format = opts.format === 'json' ? 'json' : 'text';

    try {
      console.log('\n  Connecting to Neo4j...');
      await verifyConnection();

      console.log('  Generating report...\n');
      const data = await generateReport();

      // Same formatter used by the API — no duplication
      const output = formatReport(data, format);
      console.log(output);

      process.exit(0);
    } catch (err) {
      console.error(`\n❌  Report failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Fallback
// ─────────────────────────────────────────────────────────────────────────────

program.on('command:*', () => {
  console.error(`Unknown command: ${program.args.join(' ')}`);
  program.help();
});

if (process.argv.length <= 2) {
  program.help();
}

program.parse(process.argv);
