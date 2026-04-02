import { Graph, AttackPath, Node, Edge } from './schema';

function edgesForPath(path: string[], allEdges: Edge[]): Edge[] {
  const result: Edge[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const e = allEdges.find((ed) => ed.from === path[i] && ed.to === path[i + 1]);
    if (e) result.push(e);
  }
  return result;
}

type AdjacencyList = Map<string, string[]>;

function buildAdjacencyList(edges: Edge[]): AdjacencyList {
  const adj: AdjacencyList = new Map();
  for (const edge of edges) {
    const neighbors = adj.get(edge.from) ?? [];
    neighbors.push(edge.to);
    adj.set(edge.from, neighbors);
  }
  return adj;
}

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

function calculatePathRisk(path: string[], nodeMap: Map<string, Node>, edges?: Edge[]): number {
  if (path.length === 0) return 0;

  const targetNode = nodeMap.get(path[path.length - 1]);

  // Axis 1 — Impact: risk of what we reach (crown jewel / entry node risk)
  const impact = targetNode?.riskScore ?? 0;

  // Axis 2 — Exploitability: shorter paths are more exploitable
  const hops = path.length - 1;
  const exploitability = Math.max(1, 10 - hops * 0.8);

  // Axis 3 — Amplifiers: flags that make the path worse
  let amplifier = 1.0;
  const edgeTypes = new Set(edges?.map((e) => e.type) ?? []);
  if (edgeTypes.has('RUN_AS_ROOT'))               amplifier += 0.15;
  if (edgeTypes.has('UNRESTRICTED_EGRESS'))        amplifier += 0.10;
  if (edgeTypes.has('PLAINTEXT_CREDENTIAL'))       amplifier += 0.20;
  if (edgeTypes.has('AUTH_BYPASS'))                amplifier += 0.25;
  if (edgeTypes.has('PRIVILEGED_CONTAINER_ESCAPE') ||
      edgeTypes.has('DOCKER_SOCKET_ESCAPE'))        amplifier += 0.20;

  // Check for mutable image tags (e.g. :latest) along the path
  for (const id of path) {
    const n = nodeMap.get(id);
    if (n?.image && (n.image.endsWith(':latest') || !n.image.includes(':'))) {
      amplifier += 0.10;
      break;
    }
  }

  const raw = (impact * 0.5 + exploitability * 0.5) * Math.min(amplifier, 1.8);
  return parseFloat(Math.min(10, raw).toFixed(2));
}

export interface AttackPathReport {
  paths: AttackPath[];
  summary: {
    totalPaths: number;
    uniqueEntryPoints: number;
    uniqueCrownJewels: number;
    criticalPaths: number;
    avgHops: number;
  };
}

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
        riskScore: calculatePathRisk(path, nodeMap, edgesForPath(path, graph.edges)),
        entryPoint: entry.id,
        crownJewel: jewel.id,
        hops: path.length - 1,
      });
    }
  }

  return paths.sort((a, b) => b.riskScore - a.riskScore);
}

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
          riskScore: calculatePathRisk(path, nodeMap, edgesForPath(path, graph.edges)),
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
