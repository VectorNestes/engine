import * as fs   from 'fs';
import * as path from 'path';

import { runQuery, verifyConnection } from './neo4j-client';
import {
  GraphData,
  GraphNode,
  GraphEdge,
  LoaderStats,
  NODE_LABELS,
  EDGE_TYPES,
  NodeType,
  EdgeType,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// FILE RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the cluster-graph.json path, checking multiple candidate locations
 * so the loader works whether called from the project root or /src/db/.
 */
function resolveGraphPath(override?: string): string {
  if (override) {
    if (!fs.existsSync(override)) {
      throw new Error(`Graph file not found at specified path: ${override}`);
    }
    return override;
  }

  const candidates = [
    path.resolve(process.cwd(), 'data', 'cluster-graph.json'),
    path.resolve(process.cwd(), 'cluster-graph.json'),
    path.resolve(__dirname, '../../data/cluster-graph.json'),
    path.resolve(__dirname, '../../../cluster-graph.json'),
    // Fall back to the bundled mock dataset for quick testing
    path.resolve(__dirname, '../data/mock-cluster-graph.json'),
    path.resolve(process.cwd(), 'src', 'data', 'mock-cluster-graph.json'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(
    `cluster-graph.json not found. Tried:\n` +
    candidates.map((c) => `  • ${c}`).join('\n') +
    `\n\nRun "npm run scan:mock" first to generate the file.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INDEX CREATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a lookup index on `id` for every node label.
 *
 * Without these indexes, every MATCH (n {id: $id}) is a full graph scan.
 * With them, node lookups during edge loading are O(log n).
 */
async function createIndexes(): Promise<number> {
  let created = 0;

  // One index per concrete label (for label-specific lookups)
  for (const label of NODE_LABELS) {
    const indexName = `idx_${label.toLowerCase()}_id`;
    await runQuery(
      `CREATE INDEX ${indexName} IF NOT EXISTS FOR (n:\`${label}\`) ON (n.id)`
    );
    created++;
  }

  // One index on the shared K8sNode super-label (used by GDS projection + BFS)
  await runQuery(
    `CREATE INDEX idx_k8snode_id IF NOT EXISTS FOR (n:K8sNode) ON (n.id)`
  );
  created++;

  // Index on isEntryPoint / isCrownJewel — used in every BFS WHERE clause
  await runQuery(
    `CREATE INDEX idx_k8snode_entry IF NOT EXISTS FOR (n:K8sNode) ON (n.isEntryPoint)`
  );
  await runQuery(
    `CREATE INDEX idx_k8snode_crown IF NOT EXISTS FOR (n:K8sNode) ON (n.isCrownJewel)`
  );
  created += 2;

  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE LOADING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loads all nodes of a given type using MERGE (idempotent — safe to re-run).
 *
 * Each node gets TWO labels:
 *   1. Its specific type label  (e.g. :Pod, :Secret)
 *   2. A shared super-label     :K8sNode  (required by GDS projection)
 *
 * Properties are set with SET n += props so existing data is merged, not wiped.
 */
async function loadNodesByType(nodes: GraphNode[], label: NodeType): Promise<number> {
  const subset = nodes.filter((n) => n.type === label);
  if (subset.length === 0) return 0;

  // Sanitise: convert undefined optional fields to null so Neo4j stores them
  const props = subset.map((n) => ({
    id:           n.id,
    name:         n.name,
    namespace:    n.namespace,
    type:         n.type,
    riskScore:    n.riskScore,
    isEntryPoint: n.isEntryPoint,
    isCrownJewel: n.isCrownJewel,
    image:        n.image        ?? null,
    cve:          n.cve          ?? [],
  }));

  // Dynamic label — safe here because `label` comes from our closed NodeType enum.
  // We use MERGE on :K8sNode {id} (indexed) then add the specific label in SET.
  const query = `
    UNWIND $props AS p
    MERGE (n:K8sNode {id: p.id})
    SET   n:\`${label}\`
    SET   n += p
    RETURN count(n) AS loaded
  `;

  const result = await runQuery<{ loaded: number }>(query, { props });
  return result[0]?.loaded ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// EDGE LOADING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loads all edges of a given relationship type using MERGE (idempotent).
 *
 * Matches nodes by their `id` property (indexed), then MERGEs the relationship.
 * Edges whose source or target node does not exist in the DB are silently skipped.
 */0
async function loadEdgesByType(edges: GraphEdge[], relType: EdgeType): Promise<number> {
  const subset = edges.filter((e) => e.type === relType);
  if (subset.length === 0) return 0;

  const props = subset.map((e) => ({
    from:      e.from,
    to:        e.to,
    weight:    e.weight,
    verbs:     e.verbs     ?? [],
    resources: e.resources ?? [],
  }));

  // Relationship type is embedded in the query string (not a parameter) because
  // Neo4j does not support parameterised relationship types.
  // `relType` is from our closed EdgeType enum — no injection risk.
  const query = `
    UNWIND $props AS e
    MATCH (from:K8sNode {id: e.from})
    MATCH (to:K8sNode   {id: e.to})
    MERGE (from)-[r:${relType}]->(to)
    SET   r.weight    = e.weight
    SET   r.verbs     = e.verbs
    SET   r.resources = e.resources
    RETURN count(r) AS loaded
  `;

  const result = await runQuery<{ loaded: number }>(query, { props });
  return result[0]?.loaded ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// OPTIONAL CLEAR
// ─────────────────────────────────────────────────────────────────────────────

/** Wipes all K8sNode nodes and their relationships (useful for re-loading). */
export async function clearGraph(): Promise<void> {
  await runQuery(`MATCH (n:K8sNode) DETACH DELETE n`);
  console.log('  ✔ Previous graph cleared');
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API — loadGraph()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full graph ingestion pipeline.
 *
 * 1. Resolves the JSON file
 * 2. Creates indexes (idempotent)
 * 3. MERGEs all nodes (grouped by label)
 * 4. MERGEs all edges (grouped by relationship type)
 *
 * @param graphPath  Optional override path to cluster-graph.json
 * @param wipe       Set true to DELETE existing nodes before loading (default: false)
 */
export async function loadGraph(
  graphPath?: string,
  wipe = false
): Promise<LoaderStats> {
  const start = Date.now();

  // ── Resolve + parse JSON ───────────────────────────────────────────────────
  const resolvedPath = resolveGraphPath(graphPath);
  console.log(`\n  → Reading graph from: ${resolvedPath}`);

  const raw: GraphData = JSON.parse(fs.readFileSync(resolvedPath, 'utf8')) as GraphData;
  console.log(
    `  → Parsed: ${raw.nodes.length} nodes, ${raw.edges.length} edges`
  );

  // ── Optional wipe ─────────────────────────────────────────────────────────
  if (wipe) await clearGraph();

  // ── Step 1: Create indexes ─────────────────────────────────────────────────
  console.log('\n  Creating indexes...');
  const indexesCreated = await createIndexes();
  console.log(`  ✔ Indexes ensured: ${indexesCreated}`);

  // ── Step 2: Load nodes (ALWAYS before edges) ───────────────────────────────
  console.log('\n  Loading nodes...');
  let totalNodes = 0;

  for (const label of NODE_LABELS) {
    const count = await loadNodesByType(raw.nodes, label);
    if (count > 0) {
      console.log(`     ${label.padEnd(16)} ${count} node(s)`);
      totalNodes += count;
    }
  }

  // ── Step 3: Load edges ────────────────────────────────────────────────────
  console.log('\n  Loading edges...');
  let totalEdges = 0;

  for (const relType of EDGE_TYPES) {
    const count = await loadEdgesByType(raw.edges, relType);
    if (count > 0) {
      console.log(`     ${relType.padEnd(24)} ${count} edge(s)`);
      totalEdges += count;
    }
  }

  const durationMs = Date.now() - start;

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log('\n  ' + '─'.repeat(50));
  console.log(`  ✔ Nodes loaded  : ${totalNodes}`);
  console.log(`  ✔ Edges loaded  : ${totalEdges}`);
  console.log(`  ✔ Duration      : ${durationMs}ms`);
  console.log(`  ✔ Graph ready   ✅`);
  console.log('  ' + '─'.repeat(50));

  return { nodesLoaded: totalNodes, edgesLoaded: totalEdges, indexesCreated, durationMs };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI ENTRYPOINT  (ts-node src/db/loader.ts [path] [--wipe])
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args     = process.argv.slice(2);
  const wipe     = args.includes('--wipe');
  const filePath = args.find((a) => !a.startsWith('--'));

  console.log('\n' + '═'.repeat(52));
  console.log('  🔷 K8s Attack Graph — Neo4j Loader');
  console.log('═'.repeat(52));

  await verifyConnection();
  await loadGraph(filePath, wipe);
}

// Run when executed directly (not when imported)
if (require.main === module) {
  main().catch((err) => {
    console.error(`\n❌ Loader failed: ${(err as Error).message}\n`);
    process.exit(1);
  });
}
