import * as fs from 'fs';
import * as path from 'path';

import { fetchClusterData } from '../core/fetcher';
import { transformToGraph } from '../core/transformer';
import { enrichWithCVE } from '../core/cve-enricher';
import { validateGraph } from '../core/schema';
import {
  detectAttackPaths,
  generateFullAttackReport,
  printAttackPaths,
} from '../core/attack-path';

// ─────────────────────────────────────────────────────────────────────────────
// OPTIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface ScanOptions {
  /** Load data from mock JSON instead of running kubectl */
  mock: boolean;
  /** Destination file path for the cluster-graph.json output */
  output: string;
  /** Skip CVE enrichment (faster runs, no network required) */
  skipCve?: boolean;
  /** Print verbose attack-path report including alternate routes */
  verbose?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGGING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function step(label: string): void {
  console.log(`\n✔ ${label}`);
}

function divider(): void {
  console.log('  ' + '─'.repeat(60));
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCAN PIPELINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orchestrates the full ingestion → transformation → enrichment →
 * validation → output pipeline.
 */
export async function runScan(options: ScanOptions): Promise<void> {
  console.log('\n' + '═'.repeat(62));
  console.log('  🔐 Kubernetes Attack Path Visualizer');
  console.log('     RBAC Graph Ingestion & CVE Enrichment Pipeline');
  console.log('═'.repeat(62));

  // ── Step 1: Fetch ──────────────────────────────────────────────────────────
  step('Fetching cluster data...');
  const rawData = await fetchClusterData(options.mock);

  const podCount = (rawData.pods?.items ?? []).length;
  const saCount = (rawData.serviceAccounts?.items ?? []).length;
  const roleCount =
    (rawData.roles?.items ?? []).length +
    (rawData.clusterRoles?.items ?? []).length;
  const bindingCount =
    (rawData.roleBindings?.items ?? []).length +
    (rawData.clusterRoleBindings?.items ?? []).length;

  console.log(
    `  → Pods: ${podCount}  |  ServiceAccounts: ${saCount}  |  ` +
      `Roles: ${roleCount}  |  Bindings: ${bindingCount}`
  );

  // ── Step 2: Transform ─────────────────────────────────────────────────────
  step('Transforming RBAC graph...');
  let graph = transformToGraph(rawData);
  console.log(
    `  → Built ${graph.nodes.length} nodes and ${graph.edges.length} edges`
  );

  const entryPts = graph.nodes.filter((n) => n.isEntryPoint).length;
  const crownJs = graph.nodes.filter((n) => n.isCrownJewel).length;
  console.log(`  → Entry points: ${entryPts}  |  Crown jewels: ${crownJs}`);

  // ── Step 3: CVE Enrichment ────────────────────────────────────────────────
  if (options.skipCve) {
    console.log('\n✔ CVE enrichment skipped (--skip-cve)');
  } else {
    step('Enriching with CVE data...');
    graph = await enrichWithCVE(graph);
    const enriched = graph.nodes.filter((n) => (n.cve?.length ?? 0) > 0).length;
    console.log(`  → ${enriched} pod(s) enriched with CVE data`);
  }

  // ── Step 4: Attack Path Detection ─────────────────────────────────────────
  step('Detecting attack paths...');

  let attackPaths;
  if (options.verbose) {
    const report = generateFullAttackReport(graph);
    attackPaths = report.paths;
    console.log(`  → Total paths    : ${report.summary.totalPaths}`);
    console.log(`  → Critical (≥7)  : ${report.summary.criticalPaths}`);
    console.log(`  → Avg hops       : ${report.summary.avgHops}`);
    printAttackPaths(attackPaths, 10);
  } else {
    attackPaths = detectAttackPaths(graph);
    console.log(`  → ${attackPaths.length} attack path(s) detected`);
    if (attackPaths.length > 0) {
      const top = attackPaths[0];
      console.log(
        `  → Highest risk   : ${top.entryPoint} → ${top.crownJewel}` +
          `  (${top.hops} hops, risk ${top.riskScore.toFixed(2)}/10)`
      );
      printAttackPaths(attackPaths, 6);
    }
  }

  graph = { ...graph, attackPaths };

  // ── Step 5: Validation ────────────────────────────────────────────────────
  step('Validating schema...');

  const finalGraph = {
    ...graph,
    metadata: {
      generatedAt: new Date().toISOString(),
      clusterContext: options.mock
        ? 'mock'
        : process.env['KUBECONFIG'] ?? 'default',
      totalNodes: graph.nodes.length,
      totalEdges: graph.edges.length,
      totalAttackPaths: attackPaths.length,
    },
  };

  const validated = validateGraph(finalGraph);

  // ── Step 6: Persist ───────────────────────────────────────────────────────
  step('Saving graph...');

  const outputPath = path.resolve(options.output);
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(validated, null, 2), 'utf8');
  console.log(`  → Saved to: ${outputPath}`);

  // ── Final Summary ─────────────────────────────────────────────────────────
  divider();
  console.log('\n  📊 Final Summary\n');
  console.log(
    `     Nodes            : ${validated.nodes.length}`
  );
  console.log(
    `     Edges            : ${validated.edges.length}`
  );
  console.log(
    `     Attack Paths     : ${attackPaths.length}`
  );
  console.log(
    `     Entry Points     : ${validated.nodes.filter((n) => n.isEntryPoint).length}`
  );
  console.log(
    `     Crown Jewels     : ${validated.nodes.filter((n) => n.isCrownJewel).length}`
  );
  console.log(
    `     CVE-Enriched     : ${validated.nodes.filter((n) => (n.cve?.length ?? 0) > 0).length}`
  );
  console.log(
    `\n  ✔  cluster-graph.json written to: ${outputPath}\n`
  );
  divider();
}
