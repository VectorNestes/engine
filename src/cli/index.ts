import 'dotenv/config';

import { Command } from 'commander';
import { runScan }   from './scan';
import { runStart }  from './start';

import { ingestCluster }    from '../services/ingestion.service';
import { loadGraph }        from '../db/loader';
import { ensureProjection } from '../db/queries';
import { verifyConnection } from '../db/neo4j-client';
import { generateReport }   from '../services/report/generator';
import { formatReport }     from '../services/report/formatter';
import { runPreflight }     from './docker';

import {
  printBanner,
  printSection,
  divider,
  ok,
  warn,
  fail,
  info,
  step,
  detail,
} from './banner';

const program = new Command();

program
  .name('vectornestes')
  .description(
    'VECTORNESTES  ·  Kubernetes RBAC Attack-Path Intelligence Platform\n' +
    'Ingests cluster data, builds an RBAC graph, enriches with CVEs,\n' +
    'detects attack paths from entry points to crown jewels.',
  )
  .version('1.0.8', '-v, --version');

// ─── scan ─────────────────────────────────────────────────────────────────────

program
  .command('scan')
  .description('Scan a Kubernetes cluster and output an attack-path graph (no Neo4j)')
  .option('--mock',           'Use bundled mock data instead of kubectl', false)
  .option('--output <file>',  'Path for the output JSON file', 'cluster-graph.json')
  .option('--skip-cve',       'Skip CVE enrichment', false)
  .option('--verbose',        'Print all attack paths', false)
  .action(async (opts: { mock: boolean; output: string; skipCve: boolean; verbose: boolean }) => {
    printBanner();
    try {
      await runScan({
        mock: opts.mock,
        output: opts.output,
        skipCve: opts.skipCve,
        verbose: opts.verbose,
      });
      process.exit(0);
    } catch (err) {
      fail(`Scan failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

// ─── ingest ───────────────────────────────────────────────────────────────────

program
  .command('ingest')
  .description('Full ingestion: fetch cluster data → load Neo4j → re-project GDS')
  .option('--source <source>', 'Data source: mock | live', 'mock')
  .option('--skip-cve',        'Skip CVE enrichment (faster)', false)
  .option('--wipe',            'Wipe existing Neo4j graph before loading', false)
  .action(async (opts: { source: string; skipCve: boolean; wipe: boolean }) => {
    printBanner();
    const source = opts.source === 'live' ? 'live' : 'mock';

    try {
      printSection('Ingestion Pipeline', '⬡');

      const preflight = await runPreflight();
      if (!preflight.ok) process.exit(1);

      step('Connecting to Neo4j...', 1);
      await verifyConnection();
      ok('Neo4j connection established');

      step('Ingesting cluster data...', 2);
      const ingestResult = await ingestCluster({ source, skipCve: opts.skipCve });
      ok('Graph JSON written');
      detail('Nodes', ingestResult.nodes);
      detail('Edges', ingestResult.edges);

      step('Loading graph into Neo4j...', 3);
      const stats = await loadGraph(ingestResult.graphPath, opts.wipe);
      ok('Neo4j graph loaded');
      detail('Nodes loaded',  stats.nodesLoaded);
      detail('Edges loaded',  stats.edgesLoaded);
      detail('Duration',      `${stats.durationMs}ms`);

      step('Projecting GDS graph...', 4);
      await ensureProjection(true);
      ok('GDS projection ready');

      divider();
      ok('Ingestion complete  ·  Run `report` to analyse.\n');

      process.exit(0);
    } catch (err) {
      fail(`Ingest failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

// ─── report ───────────────────────────────────────────────────────────────────

program
  .command('report')
  .description('Generate a full attack-path report from Neo4j data')
  .option('--format <format>', 'Output format: text | json', 'text')
  .action(async (opts: { format: string }) => {
    printBanner();
    const format = opts.format === 'json' ? 'json' : 'text';

    try {
      printSection('Attack-Path Report', '⬡');

      step('Connecting to Neo4j...');
      await verifyConnection();
      ok('Connected');

      step('Generating report...');
      const data = await generateReport();
      ok('Report generated');

      divider();
      const output = formatReport(data, format);
      process.stdout.write('\n' + output + '\n');

      process.exit(0);
    } catch (err) {
      fail(`Report failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

// ─── start ────────────────────────────────────────────────────────────────────

program
  .command('start')
  .description('Start backend, load cluster data, open the UI in your browser')
  .option('--source <source>', 'Data source: mock | live', 'mock')
  .option('--no-browser',      'Skip opening the browser automatically')
  .action(async (opts: { source: string; browser: boolean }) => {
    printBanner();
    try {
      await runStart({
        source:      opts.source === 'live' ? 'live' : 'mock',
        skipBrowser: !opts.browser,
      });
    } catch (err) {
      fail(`Start failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

// ─── Unknown command fallback ─────────────────────────────────────────────────

program.on('command:*', () => {
  printBanner();
  fail(`Unknown command: ${c('bold')}${program.args.join(' ')}${r()}`);
  info('Run with --help to see available commands.');
  process.exit(1);
});

// ─── No args → help ──────────────────────────────────────────────────────────

if (process.argv.length <= 2) {
  printBanner();
  program.help();
}

program.parse(process.argv);

// tiny helpers for the unknown-command handler
function c(s: string): string { return process.stdout.isTTY ? `\x1b[1m${s}` : s; }
function r(): string           { return process.stdout.isTTY ? '\x1b[0m' : '';  }
