import * as fs   from 'fs';
import * as path from 'path';

import { fetchClusterData }  from '../core/fetcher';
import { transformToGraph }  from '../core/transformer';
import { enrichWithCVE }     from '../core/cve-enricher';
import { validateGraph }     from '../core/schema';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface IngestOptions {
  /** 'mock' = bundled JSON, 'live' = kubectl */
  source?: 'mock' | 'live';
  /** Skip CVE enrichment (no network calls) */
  skipCve?: boolean;
}

export interface IngestResult {
  graphPath:   string;
  nodes:        number;
  edges:        number;
  attackPaths:  number;
  durationMs:   number;
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT PATH
// Consistent location used by both the ingestion service and the loader.
// ─────────────────────────────────────────────────────────────────────────────

export const GRAPH_OUTPUT_PATH = path.resolve(
  process.cwd(), 'data', 'cluster-graph.json'
);

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Teammate 1 pipeline: fetch → transform → enrich → validate → write JSON.
 *
 * Does NOT touch Neo4j — callers are responsible for calling loadGraph()
 * and projectGDSGraph() after this returns.
 *
 * Throws with a descriptive message on any failure so the route can
 * return "Ingestion failed" without swallowing the root cause.
 */
export async function ingestCluster(options: IngestOptions = {}): Promise<IngestResult> {
  const start   = Date.now();
  const useMock = options.source !== 'live';

  console.log(`\n  → Ingesting cluster (source: ${useMock ? 'mock' : 'live'}, skipCve: ${!!options.skipCve})`);

  // ── Step 1: Fetch ──────────────────────────────────────────────────────────
  const rawData = await fetchClusterData(useMock);

  // ── Step 2: Transform ─────────────────────────────────────────────────────
  let graph = transformToGraph(rawData);
  console.log(`  → Built ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

  // ── Step 3: CVE Enrichment ────────────────────────────────────────────────
  if (!options.skipCve) {
    graph = await enrichWithCVE(graph);
  }

  // ── Step 4: Validate ──────────────────────────────────────────────────────
  const finalGraph = {
    ...graph,
    metadata: {
      generatedAt:      new Date().toISOString(),
      clusterContext:   useMock ? 'mock' : (process.env['KUBECONFIG'] ?? 'default'),
      totalNodes:       graph.nodes.length,
      totalEdges:       graph.edges.length,
      totalAttackPaths: graph.attackPaths?.length ?? 0,
    },
  };

  const validated = validateGraph(finalGraph);

  // ── Step 5: Write JSON ────────────────────────────────────────────────────
  const dir = path.dirname(GRAPH_OUTPUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(GRAPH_OUTPUT_PATH, JSON.stringify(validated, null, 2), 'utf8');
  console.log(`  ✔ Graph written → ${GRAPH_OUTPUT_PATH}`);

  return {
    graphPath:  GRAPH_OUTPUT_PATH,
    nodes:       validated.nodes.length,
    edges:       validated.edges.length,
    attackPaths: validated.attackPaths?.length ?? 0,
    durationMs:  Date.now() - start,
  };
}
