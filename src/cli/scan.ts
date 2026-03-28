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

export interface ScanOptions {
  mock: boolean;
  output: string;
  skipCve?: boolean;
  verbose?: boolean;
}

function step(label: string): void {
  console.log(`\n✔ ${label}`);
}

function divider(): void {
  console.log('  ' + '─'.repeat(60));
}

export async function runScan(options: ScanOptions): Promise<void> {
  console.log('\n' + '═'.repeat(62));
  console.log('  🔐 Kubernetes Attack Path Visualizer');
  console.log('     RBAC Graph Ingestion & CVE Enrichment Pipeline');
  console.log('═'.repeat(62));

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

  step('Transforming RBAC graph...');
  let graph = transformToGraph(rawData);
  console.log(
    `  → Built ${graph.nodes.length} nodes and ${graph.edges.length} edges`
  );

  const entryPts = graph.nodes.filter((n) => n.isEntryPoint).length;
  const crownJs = graph.nodes.filter((n) => n.isCrownJewel).length;
  console.log(`  → Entry points: ${entryPts}  |  Crown jewels: ${crownJs}`);

  if (options.skipCve) {
    console.log('\n✔ CVE enrichment skipped (--skip-cve)');
  } else {
    step('Enriching with CVE data...');
    graph = await enrichWithCVE(graph);
    const enriched = graph.nodes.filter((n) => (n.cve?.length ?? 0) > 0).length;
    console.log(`  → ${enriched} pod(s) enriched with CVE data`);
  }

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

  step('Saving graph...');

  const outputPath = path.resolve(options.output);
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(validated, null, 2), 'utf8');
  console.log(`  → Saved to: ${outputPath}`);

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
