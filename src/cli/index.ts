#!/usr/bin/env node
/**
 * Kubernetes Attack Path Visualizer — CLI Entry Point
 *
 * Usage:
 *   npx ts-node src/cli/index.ts scan --mock
 *   npx ts-node src/cli/index.ts scan --mock --output my-graph.json
 *   npx ts-node src/cli/index.ts scan --output cluster-graph.json
 *   npx ts-node src/cli/index.ts scan --mock --skip-cve --verbose
 */

import { Command } from 'commander';
import { runScan } from './scan';

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
// scan command
// ─────────────────────────────────────────────────────────────────────────────

program
  .command('scan')
  .description('Scan a Kubernetes cluster and output an attack-path graph')
  .option(
    '--mock',
    'Use bundled mock data instead of running kubectl (great for demos)',
    false
  )
  .option(
    '--output <file>',
    'Path for the output JSON file',
    'cluster-graph.json'
  )
  .option(
    '--skip-cve',
    'Skip CVE enrichment (no network calls, faster)',
    false
  )
  .option(
    '--verbose',
    'Print all attack paths including alternate routes',
    false
  )
  .action(async (opts: {
    mock: boolean;
    output: string;
    skipCve: boolean;
    verbose: boolean;
  }) => {
    try {
      await runScan({
        mock: opts.mock,
        output: opts.output,
        skipCve: opts.skipCve,
        verbose: opts.verbose,
      });
      process.exit(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\n❌  Scan failed: ${message}\n`);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Fallback: show help if no command is given
// ─────────────────────────────────────────────────────────────────────────────

program.on('command:*', () => {
  console.error(`Unknown command: ${program.args.join(' ')}`);
  program.help();
});

if (process.argv.length <= 2) {
  program.help();
}

program.parse(process.argv);
