import { getGraph } from '../../db/graphEngine';
import {
  findAttackPaths,
  findShortestPath,
  detectCycles,
  findCriticalNodes,
  getBlastRadius,
} from '../../db/algorithms';
import type {
  PathResult,
  DijkstraResult,
  CycleResult,
  CriticalNode,
  BlastResult,
} from '../../db/types';

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

function getEntryPoints(): string[] {
  const graph = getGraph();
  const eps: string[] = [];
  graph.forEachNode((node, attrs) => {
    if (attrs.isEntryPoint) eps.push(node);
  });
  return eps;
}

function getCrownJewels(): string[] {
  const graph = getGraph();
  const cjs: string[] = [];
  graph.forEachNode((node, attrs) => {
    if (attrs.isCrownJewel) cjs.push(node);
  });
  return cjs;
}

export async function generateReport(): Promise<ReportData> {
  const attackPaths = await findAttackPaths();

  const entryPoints = getEntryPoints();
  const crownJewels = getCrownJewels();

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
