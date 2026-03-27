import { Graph, AttackPath, Node, Edge } from './schema';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type AdjacencyList = Map<string, string[]>;

// ─────────────────────────────────────────────────────────────────────────────
// GRAPH UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/** Builds a directed adjacency list from the graph edges. */
function buildAdjacencyList(edges: Edge[]): AdjacencyList {
  const adj: AdjacencyList = new Map();
  for (const edge of edges) {
    const neighbors = adj.get(edge.from) ?? [];
    neighbors.push(edge.to);
    adj.set(edge.from, neighbors);
  }
  return adj;
}

// ─────────────────────────────────────────────────────────────────────────────
// BFS — shortest path between two nodes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the shortest directed path (BFS) from `startId` to `endId`,
 * or `null` if no path exists.
 * The returned array includes both `startId` and `endId`.
 */
function bfsShortestPath(
  startId: string,
  endId: string,
  adj: AdjacencyList
): string[] | null {
  if (startId === endId) return [startId];

  const visited = new Set<string>([startId]);
  const queue: Array<{ node: string; path: string[] }> = [
    { node: startId, path: [startId] },
  ];

  while (queue.length > 0) {
    const { node, path } = queue.shift()!;

    for (const neighbor of adj.get(node) ?? []) {
      if (neighbor === endId) return [...path, neighbor];

      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ node: neighbor, path: [...path, neighbor] });
      }
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// DFS — ALL paths between two nodes (bounded depth)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns ALL simple directed paths from `startId` to `endId` up to
 * `maxDepth` hops. Useful for finding multiple exploitation routes.
 */
function dfsAllPaths(
  startId: string,
  endId: string,
  adj: AdjacencyList,
  maxDepth = 12
): string[][] {
  const results: string[][] = [];
  const visited = new Set<string>();

  function dfs(current: string, path: string[]): void {
    if (current === endId) {
      results.push([...path]);
      return;
    }
    if (path.length > maxDepth) return;

    visited.add(current);
    for (const neighbor of adj.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path, neighbor]);
      }
    }
    visited.delete(current);
  }

  dfs(startId, [startId]);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// RISK CALCULATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates the aggregate risk score for an attack path.
 * Uses the average node riskScore, biased toward the highest-risk node.
 */
function calculatePathRisk(path: string[], nodeMap: Map<string, Node>): number {
  if (path.length === 0) return 0;

  const scores = path.map((id) => nodeMap.get(id)?.riskScore ?? 0);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const max = Math.max(...scores);

  // Weighted blend: 60 % max severity + 40 % average traversal risk
  return parseFloat(Math.min(10, max * 0.6 + avg * 0.4).toFixed(2));
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export interface AttackPathReport {
  paths: AttackPath[];
  summary: {
    totalPaths: number;
    uniqueEntryPoints: number;
    uniqueCrownJewels: number;
    criticalPaths: number;  // riskScore >= 7
    avgHops: number;
  };
}

/**
 * Detects all attack paths in the graph that lead from an entry-point node
 * to a crown-jewel node using BFS (shortest path) per pair.
 *
 * Paths are sorted by descending riskScore.
 */
export function detectAttackPaths(graph: Graph): AttackPath[] {
  const entryPoints = graph.nodes.filter((n) => n.isEntryPoint);
  const crownJewels = graph.nodes.filter((n) => n.isCrownJewel);

  if (entryPoints.length === 0 || crownJewels.length === 0) {
    return [];
  }

  const adj = buildAdjacencyList(graph.edges);
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const paths: AttackPath[] = [];
  const seenPaths = new Set<string>();

  for (const entry of entryPoints) {
    for (const jewel of crownJewels) {
      const path = bfsShortestPath(entry.id, jewel.id, adj);
      if (!path) continue;

      const key = path.join('→');
      if (seenPaths.has(key)) continue;
      seenPaths.add(key);

      paths.push({
        path,
        riskScore: calculatePathRisk(path, nodeMap),
        entryPoint: entry.id,
        crownJewel: jewel.id,
        hops: path.length - 1,
      });
    }
  }

  return paths.sort((a, b) => b.riskScore - a.riskScore);
}

/**
 * Same as `detectAttackPaths` but also finds ALTERNATE (non-shortest) paths
 * for richer analysis. Returns a full report with statistics.
 */
export function generateFullAttackReport(graph: Graph): AttackPathReport {
  const entryPoints = graph.nodes.filter((n) => n.isEntryPoint);
  const crownJewels = graph.nodes.filter((n) => n.isCrownJewel);

  const adj = buildAdjacencyList(graph.edges);
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const allPaths: AttackPath[] = [];
  const seenPaths = new Set<string>();

  for (const entry of entryPoints) {
    for (const jewel of crownJewels) {
      const rawPaths = dfsAllPaths(entry.id, jewel.id, adj);
      for (const path of rawPaths) {
        const key = path.join('→');
        if (seenPaths.has(key)) continue;
        seenPaths.add(key);

        allPaths.push({
          path,
          riskScore: calculatePathRisk(path, nodeMap),
          entryPoint: entry.id,
          crownJewel: jewel.id,
          hops: path.length - 1,
        });
      }
    }
  }

  const sorted = allPaths.sort((a, b) => b.riskScore - a.riskScore);
  const uniqueEntries = new Set(sorted.map((p) => p.entryPoint)).size;
  const uniqueJewels = new Set(sorted.map((p) => p.crownJewel)).size;
  const criticalPaths = sorted.filter((p) => p.riskScore >= 7).length;
  const avgHops =
    sorted.length > 0
      ? parseFloat(
          (sorted.reduce((s, p) => s + p.hops, 0) / sorted.length).toFixed(1)
        )
      : 0;

  return {
    paths: sorted,
    summary: {
      totalPaths: sorted.length,
      uniqueEntryPoints: uniqueEntries,
      uniqueCrownJewels: uniqueJewels,
      criticalPaths,
      avgHops,
    },
  };
}

/** Pretty-prints the top N attack paths to the console. */
export function printAttackPaths(paths: AttackPath[], limit = 10): void {
  const top = paths.slice(0, limit);
  if (top.length === 0) {
    console.log('  No attack paths detected.');
    return;
  }

  console.log(`\n  Top ${top.length} attack path(s) (sorted by risk):\n`);
  for (let i = 0; i < top.length; i++) {
    const ap = top[i];
    const risk = ap.riskScore.toFixed(2);
    const pathStr = ap.path.join(' → ');
    console.log(`  [${i + 1}] Risk: ${risk}/10  Hops: ${ap.hops}`);
    console.log(`      ${pathStr}`);
    console.log();
  }
}
