import { runQuery }          from '../../db/neo4j-client';
import {
  findAttackPaths,
  findShortestPath,
  detectCycles,
  findCriticalNodes,
  getBlastRadius,
  ensureProjection,
} from '../../db/queries';
import type {
  PathResult,
  DijkstraResult,
  CycleResult,
  CriticalNode,
} from '../../db/types';
import type { BlastResult } from '../../db/queries';

// ─────────────────────────────────────────────────────────────────────────────
// REPORT DATA SHAPE
// ─────────────────────────────────────────────────────────────────────────────

export interface BlastRadiusEntry {
  entryPoint: string;
  reachable:  BlastResult[];
}

export interface ReportData {
  generatedAt:   string;
  attackPaths:   PathResult[];
  dijkstraPaths: DijkstraResult[];
  blastRadii:    BlastRadiusEntry[];
  cycles:        CycleResult[];
  criticalNode:  CriticalNode | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function getEntryPoints(): Promise<string[]> {
  const rows = await runQuery<{ id: string }>(
    'MATCH (n:K8sNode) WHERE n.isEntryPoint = true RETURN n.id AS id'
  );
  return rows.map((r) => r.id);
}

async function getCrownJewels(): Promise<string[]> {
  const rows = await runQuery<{ id: string }>(
    'MATCH (n:K8sNode) WHERE n.isCrownJewel = true RETURN n.id AS id'
  );
  return rows.map((r) => r.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collects all report data from Neo4j:
 *  1. All BFS attack paths
 *  2. Dijkstra shortest path for every (entryPoint, crownJewel) pair
 *  3. Blast radius per entry point
 *  4. Privilege escalation cycles
 *  5. Top betweenness-centrality node (critical chokepoint)
 *
 * The same function is called by both GET /api/report and the CLI
 * `report` command — zero duplication.
 */
export async function generateReport(): Promise<ReportData> {
  // Ensure GDS projection exists (read-only, reuse if present)
  await ensureProjection(false);

  // ── 1. All BFS attack paths ───────────────────────────────────────────────
  const attackPaths = await findAttackPaths();

  // ── 2. Dijkstra for every entryPoint → crownJewel pair ───────────────────
  const [entryPoints, crownJewels] = await Promise.all([
    getEntryPoints(),
    getCrownJewels(),
  ]);

  const dijkstraPromises: Promise<DijkstraResult | null>[] = [];
  for (const ep of entryPoints) {
    for (const cj of crownJewels) {
      dijkstraPromises.push(findShortestPath(ep, cj));
    }
  }

  const dijkstraSettled = await Promise.all(dijkstraPromises);
  const dijkstraPaths   = dijkstraSettled.filter((r): r is DijkstraResult => r !== null);

  // ── 3. Blast radius per entry point ──────────────────────────────────────
  const blastRadii: BlastRadiusEntry[] = await Promise.all(
    entryPoints.map(async (ep) => ({
      entryPoint: ep,
      reachable:  await getBlastRadius(ep),
    }))
  );

  // ── 4. Privilege escalation cycles ───────────────────────────────────────
  const cycles = await detectCycles();

  // ── 5. Critical node (top betweenness) ───────────────────────────────────
  const topNodes    = await findCriticalNodes(1);
  const criticalNode = topNodes[0] ?? null;

  return {
    generatedAt:   new Date().toISOString(),
    attackPaths,
    dijkstraPaths,
    blastRadii,
    cycles,
    criticalNode,
  };
}
