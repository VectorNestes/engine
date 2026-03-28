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

export async function generateReport(): Promise<ReportData> {
  await ensureProjection(false);

  const attackPaths = await findAttackPaths();

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

  const blastRadii: BlastRadiusEntry[] = await Promise.all(
    entryPoints.map(async (ep) => ({
      entryPoint: ep,
      reachable:  await getBlastRadius(ep),
    }))
  );

  const cycles = await detectCycles();

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
