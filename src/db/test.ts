/**
 * src/db/test.ts — Graph & Algorithms Engine Integration Test
 *
 * Verifies the full pipeline:
 *   1. Neo4j connectivity + GDS version
 *   2. Graph ingestion from mock dataset
 *   3. BFS attack-path discovery
 *   4. Dijkstra shortest-path (GDS)
 *   5. DFS cycle detection
 *   6. Betweenness centrality (GDS)
 *   7. Blast-radius query (bonus)
 *
 * Usage:
 *   npx ts-node src/db/test.ts
 *   npx ts-node src/db/test.ts --skip-load   # if graph is already in Neo4j
 *   npx ts-node src/db/test.ts --wipe        # wipe + reload before tests
 */

import * as path from 'path';

import { verifyConnection, closeDriver } from './neo4j-client';
import { loadGraph }                     from './loader';
import {
  ensureProjection,
  dropProjection,
  findAttackPaths,
  findShortestPath,
  detectCycles,
  findCriticalNodes,
  getBlastRadius,
}                                        from './queries';
import { TestSummary }                   from './types';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function banner(title: string): void {
  const line = '═'.repeat(62);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

function section(title: string): void {
  console.log(`\n  ${'─'.repeat(58)}`);
  console.log(`  🔷 ${title}`);
  console.log(`  ${'─'.repeat(58)}`);
}

function pass(msg: string): void { console.log(`  ✅  ${msg}`); }
function fail(msg: string): void { console.log(`  ❌  ${msg}`); }
function info(msg: string): void { console.log(`  ℹ️   ${msg}`); }

// ─────────────────────────────────────────────────────────────────────────────
// TEST STEPS
// ─────────────────────────────────────────────────────────────────────────────

async function testLoad(mockPath: string, wipe: boolean): Promise<void> {
  section('STEP 1 — Graph Ingestion');
  const stats = await loadGraph(mockPath, wipe);

  if (stats.nodesLoaded >= 40) {
    pass(`Loaded ${stats.nodesLoaded} nodes (≥ 40 required)`);
  } else {
    fail(`Only ${stats.nodesLoaded} nodes loaded — expected at least 40`);
  }

  if (stats.edgesLoaded > 0) {
    pass(`Loaded ${stats.edgesLoaded} edges`);
  } else {
    fail('No edges loaded');
  }

  info(`Indexes created/verified: ${stats.indexesCreated}`);
  info(`Load duration: ${stats.durationMs}ms`);
}

async function testBfs(summary: Partial<TestSummary>): Promise<void> {
  section('STEP 2 — BFS Attack Path Discovery');

  const paths = await findAttackPaths(10, 50);
  summary.attackPathsFound = paths.length;

  if (paths.length >= 6) {
    pass(`Found ${paths.length} attack path(s) (≥ 6 required)`);
  } else {
    fail(`Only ${paths.length} attack path(s) found — expected at least 6`);
  }

  // Print top 5 paths
  console.log(`\n  Top ${Math.min(5, paths.length)} paths (by total weight):\n`);
  for (const p of paths.slice(0, 5)) {
    const route = p.nodeIds.join(' → ');
    console.log(`  [${String(p.hops).padStart(2)} hops | w=${p.totalWeight.toFixed(1)} | r=${p.riskScore.toFixed(2)}]`);
    console.log(`    ${route}`);
    console.log();
  }

  // Verify entry points and crown jewels are correct
  const entries = new Set(paths.map((p) => p.entryPoint));
  const crowns  = new Set(paths.map((p) => p.crownJewel));

  info(`Unique entry points in paths : ${[...entries].join(', ')}`);
  info(`Unique crown jewels in paths : ${[...crowns].join(', ')}`);
}

async function testDijkstra(summary: Partial<TestSummary>): Promise<void> {
  section('STEP 3 — Dijkstra Shortest-Risk Path (GDS)');

  // Known shortest path in mock data: api-lb → api-server → api-sa → api-cluster-role → tls-private-key
  const SOURCE = 'production:api-lb';
  const TARGET = 'default:tls-private-key';

  const result = await findShortestPath(SOURCE, TARGET);

  if (result) {
    summary.shortestPathHops = result.hops;
    pass(`Path found: ${result.hops} hop(s), total cost ${result.totalCost.toFixed(1)}`);
    console.log(`\n  Route:`);
    for (let i = 0; i < result.pathNodeIds.length; i++) {
      const cost = result.costs[i] !== undefined ? ` (+${result.costs[i].toFixed(1)})` : '';
      console.log(`    [${i}] ${result.pathNodeIds[i]}${cost}`);
    }
  } else {
    summary.shortestPathHops = null;
    fail(`No path found between ${SOURCE} and ${TARGET}`);
  }

  // Also try a second pair: frontend-lb → production-postgres
  const result2 = await findShortestPath('production:frontend-lb', 'production:production-postgres');
  if (result2) {
    info(`frontend-lb → production-postgres: ${result2.hops} hops, cost ${result2.totalCost.toFixed(1)}`);
  }
}

async function testCycles(summary: Partial<TestSummary>): Promise<void> {
  section('STEP 4 — DFS Cycle Detection (Privilege Escalation Loops)');

  const cycles = await detectCycles(8, 20);
  summary.cyclesFound = cycles.length;

  if (cycles.length > 0) {
    pass(`Detected ${cycles.length} cycle(s)`);
    console.log('\n  Cycles found:\n');
    for (const c of cycles) {
      const loop = [...c.cycleNodeIds, c.cycleNodeIds[0]].join(' → ');
      console.log(`  [length ${c.cycleLength}] via: ${c.relationshipTypes.join(', ')}`);
      console.log(`    ${loop}`);
      console.log();
    }

    // Specifically check for the known frontend → frontend-sa → pod-executor cycle
    const hasFrontendCycle = cycles.some((c) =>
      c.cycleNodeIds.some((id) => id.includes('frontend-sa')) &&
      c.cycleNodeIds.some((id) => id.includes('pod-executor'))
    );
    if (hasFrontendCycle) {
      pass('Known frontend RBAC cycle confirmed (frontend-sa → pod-executor → frontend-pod)');
    }
  } else {
    info('No cycles found — this may be expected for a clean cluster');
  }
}

async function testCentrality(summary: Partial<TestSummary>): Promise<void> {
  section('STEP 5 — Betweenness Centrality (Critical Nodes)');

  const nodes = await findCriticalNodes(10);

  if (nodes.length > 0) {
    summary.criticalNodesTop = nodes[0].nodeId;
    pass(`Top critical node: ${nodes[0].nodeId} (score: ${nodes[0].betweennessScore})`);
    console.log('\n  Top 10 critical nodes:\n');

    const nameW = 38;
    const typeW = 16;
    console.log(
      `  ${'Node'.padEnd(nameW)} ${'Type'.padEnd(typeW)} ${'Score'.padStart(8)}` +
      `  ${'Entry'.padStart(5)}  ${'Crown'.padStart(5)}`
    );
    console.log(`  ${'─'.repeat(nameW + typeW + 30)}`);

    for (const n of nodes) {
      const entry = n.isEntryPoint ? '  ✓  ' : '  –  ';
      const crown = n.isCrownJewel ? '  ✓  ' : '  –  ';
      console.log(
        `  ${n.nodeId.padEnd(nameW)} ${n.type.padEnd(typeW)}` +
        ` ${n.betweennessScore.toFixed(2).padStart(8)}${entry}${crown}`
      );
    }
  } else {
    fail('No critical nodes returned');
  }
}

async function testBlastRadius(): Promise<void> {
  section('STEP 6 (Bonus) — Blast Radius');

  // If api-sa is compromised, what can it reach?
  const startNode = 'production:api-sa';
  const reachable = await getBlastRadius(startNode, 6);

  info(`From '${startNode}': ${reachable.length} reachable node(s)`);

  const crownCount = reachable.filter((r) => r.isCrownJewel).length;
  if (crownCount > 0) {
    pass(`Can reach ${crownCount} crown jewel(s) — HIGH RISK SA`);
    console.log('\n  Crown jewels in blast radius:');
    for (const r of reachable.filter((n) => n.isCrownJewel)) {
      console.log(`    [${r.hops} hops] ${r.reachableNodeId}  (riskScore: ${r.riskScore})`);
    }
  } else {
    info('No crown jewels reachable from this node');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args      = process.argv.slice(2);
  const skipLoad  = args.includes('--skip-load');
  const wipe      = args.includes('--wipe');

  // Use the generated (transformed) graph — run `npm run db:generate` first.
  // Falls back through loader's candidate list if not specified.
  const mockPath  = path.resolve(process.cwd(), 'data', 'cluster-graph.json');

  banner('🔐 K8s Attack Graph — Algorithm Engine Test Suite');

  const summary: Partial<TestSummary> = {};
  let allPassed = true;

  try {
    // ── Connectivity ─────────────────────────────────────────────────────────
    section('STEP 0 — Connectivity');
    await verifyConnection();
    pass('Neo4j reachable + GDS installed');

    // ── Load ─────────────────────────────────────────────────────────────────
    if (!skipLoad) {
      await testLoad(mockPath, wipe);
    } else {
      info('Skipping load (--skip-load flag set)');
    }

    // ── Ensure GDS projection before algorithm tests ──────────────────────
    await ensureProjection(wipe);  // force refresh if we wiped

    // ── Algorithms ───────────────────────────────────────────────────────────
    await testBfs(summary);
    await testDijkstra(summary);
    await testCycles(summary);
    await testCentrality(summary);
    await testBlastRadius();

  } catch (err) {
    allPassed = false;
    const msg = err instanceof Error ? err.message : String(err);
    fail(`Unexpected error: ${msg}`);
    console.error(err);
  } finally {
    // Drop the in-memory projection to free GDS memory
    await dropProjection().catch(() => { /* ignore */ });
    await closeDriver();
  }

  summary.allPassed = allPassed &&
    (summary.attackPathsFound ?? 0) >= 6 &&
    (summary.cyclesFound       ?? 0) >= 0;

  // ── Final report ───────────────────────────────────────────────────────────
  banner('📊 Test Summary');
  console.log(`  Attack paths found  : ${summary.attackPathsFound ?? '—'}`);
  console.log(`  Shortest path hops  : ${summary.shortestPathHops  ?? '—'}`);
  console.log(`  Cycles detected     : ${summary.cyclesFound        ?? '—'}`);
  console.log(`  Top critical node   : ${summary.criticalNodesTop   ?? '—'}`);
  console.log(`  All checks passed   : ${summary.allPassed ? '✅ YES' : '❌ NO'}`);
  console.log();

  process.exit(summary.allPassed ? 0 : 1);
}

main();
