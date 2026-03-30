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

function resolveGraphPath(override?: string): string {
  if (override) {
    if (!fs.existsSync(override)) {
      throw new Error(`Graph file not found at specified path: ${override}`);
    }
    return override;
  }

  const candidates = [
    path.resolve(__dirname, '..', '..', 'data', 'cluster-graph.json'),
    path.resolve(__dirname, '..', 'data', 'cluster-graph.json'),
    path.resolve(__dirname, 'data', 'cluster-graph.json'),
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

async function createIndexes(): Promise<number> {
  let created = 0;

  for (const label of NODE_LABELS) {
    const indexName = `idx_${label.toLowerCase()}_id`;
    await runQuery(
      `CREATE INDEX ${indexName} IF NOT EXISTS FOR (n:\`${label}\`) ON (n.id)`
    );
    created++;
  }

  await runQuery(
    `CREATE INDEX idx_k8snode_id IF NOT EXISTS FOR (n:K8sNode) ON (n.id)`
  );
  created++;

  await runQuery(
    `CREATE INDEX idx_k8snode_entry IF NOT EXISTS FOR (n:K8sNode) ON (n.isEntryPoint)`
  );
  await runQuery(
    `CREATE INDEX idx_k8snode_crown IF NOT EXISTS FOR (n:K8sNode) ON (n.isCrownJewel)`
  );
  created += 2;

  return created;
}

async function loadNodesByType(nodes: GraphNode[], label: NodeType): Promise<number> {
  const subset = nodes.filter((n) => n.type === label);
  if (subset.length === 0) return 0;

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

export async function clearGraph(): Promise<void> {
  await runQuery(`MATCH (n:K8sNode) DETACH DELETE n`);
  console.log('  ✔ Previous graph cleared');
}

export async function loadGraph(
  graphPath?: string,
  wipe = false
): Promise<LoaderStats> {
  const start = Date.now();

  const resolvedPath = resolveGraphPath(graphPath);
  console.log(`\n  → Reading graph from: ${resolvedPath}`);

  const raw: GraphData = JSON.parse(fs.readFileSync(resolvedPath, 'utf8')) as GraphData;
  console.log(
    `  → Parsed: ${raw.nodes.length} nodes, ${raw.edges.length} edges`
  );

  if (wipe) await clearGraph();

  console.log('\n  Creating indexes...');
  const indexesCreated = await createIndexes();
  console.log(`  ✔ Indexes ensured: ${indexesCreated}`);

  console.log('\n  Loading nodes...');
  let totalNodes = 0;

  for (const label of NODE_LABELS) {
    const count = await loadNodesByType(raw.nodes, label);
    if (count > 0) {
      console.log(`     ${label.padEnd(16)} ${count} node(s)`);
      totalNodes += count;
    }
  }

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

  console.log('\n  ' + '─'.repeat(50));
  console.log(`  ✔ Nodes loaded  : ${totalNodes}`);
  console.log(`  ✔ Edges loaded  : ${totalEdges}`);
  console.log(`  ✔ Duration      : ${durationMs}ms`);
  console.log(`  ✔ Graph ready   ✅`);
  console.log('  ' + '─'.repeat(50));

  return { nodesLoaded: totalNodes, edgesLoaded: totalEdges, indexesCreated, durationMs };
}

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

if (require.main === module) {
  main().catch((err) => {
    console.error(`\n❌ Loader failed: ${(err as Error).message}\n`);
    process.exit(1);
  });
}
