import { getGraph } from './graphEngine';
import dijkstra from 'graphology-shortest-path/dijkstra';
import betweennessCentrality from 'graphology-metrics/centrality/betweenness';
import Graph from 'graphology';

import {
  PathResult,
  DijkstraResult,
  CycleResult,
  CriticalNode,
  QueryNode,
  PathRelationship,
  BlastResult,
  AlgorithmResults,
} from './types';

// DFS to find paths up to maxHops between source and target
function findAllSimplePaths(graph: Graph, source: string, target: string, maxHops: number, ignoreNode?: string): string[][] {
  const paths: string[][] = [];
  const visited = new Set<string>();

  function dfs(current: string, path: string[]) {
    if (path.length - 1 > maxHops) return;
    if (current === target && path.length > 1) {
      paths.push([...path]);
      return;
    }

    visited.add(current);
    graph.forEachOutNeighbor(current, (neighbor) => {
      if (neighbor === ignoreNode) return; // Simulated removal
      if (!visited.has(neighbor) || neighbor === target) {
        dfs(neighbor, [...path, neighbor]);
      }
    });
    visited.delete(current);
  }

  dfs(source, [source]);
  return paths;
}

export async function findAttackPaths(maxHops = 10, limit = 50, ignoreNode?: string): Promise<PathResult[]> {
  console.log(`\n  → Running memory BFS attack-path discovery (maxHops=${maxHops})${ignoreNode ? ' EXCLUDING ' + ignoreNode : ''}...`);
  const graph = getGraph();
  
  const entryPoints: string[] = [];
  const crownJewels: string[] = [];
  
  graph.forEachNode((node, attrs) => {
    if (attrs.isEntryPoint && node !== ignoreNode) entryPoints.push(node);
    if (attrs.isCrownJewel && node !== ignoreNode) crownJewels.push(node);
  });

  const allPaths: PathResult[] = [];

  for (const entry of entryPoints) {
    for (const crown of crownJewels) {
      const paths = findAllSimplePaths(graph, entry, crown, maxHops, ignoreNode);
      
      for (const nodeIds of paths) {
        const pathNodes: QueryNode[] = nodeIds.map(id => graph.getNodeAttributes(id) as QueryNode);
        const pathRels: PathRelationship[] = [];
        let totalWeight = 0;
        
        for (let i = 0; i < nodeIds.length - 1; i++) {
          const from = nodeIds[i];
          const to = nodeIds[i + 1];
          // Get the first edge between from/to (assuming DirectedMultiGraph or DirectedGraph)
          const edges = graph.edges(from, to);
          if (edges.length > 0) {
            const edgeId = edges[0];
            const edgeAttrs = graph.getEdgeAttributes(edgeId);
            const weight = typeof edgeAttrs.weight === 'number' ? edgeAttrs.weight : 1;
            pathRels.push({
              type: edgeAttrs.type as string,
              weight: weight,
              from,
              to
            });
            totalWeight += weight;
          }
        }
        
        const hops = nodeIds.length - 1;
        const entryRisk = typeof pathNodes[0].riskScore === 'number' ? pathNodes[0].riskScore : 0;
        const crownRisk = typeof pathNodes[pathNodes.length - 1].riskScore === 'number' ? pathNodes[pathNodes.length - 1].riskScore : 0;
        
        const riskScore = Math.round(100.0 * (0.6 * crownRisk + 0.4 * (totalWeight / hops))) / 100.0;
        
        allPaths.push({
          entryPoint: entry,
          crownJewel: crown,
          nodeIds,
          nodes: pathNodes,
          relationships: pathRels,
          totalWeight,
          hops,
          riskScore
        });
      }
    }
  }

  // Sort by totalWeight DESC, hops ASC
  allPaths.sort((a, b) => {
    if (b.totalWeight !== a.totalWeight) return b.totalWeight - a.totalWeight;
    return a.hops - b.hops;
  });

  return allPaths.slice(0, limit).map((p, i) => ({ ...p, pathId: i + 1 })) as any;
}

export async function findShortestPath(sourceNodeId: string, targetNodeId: string): Promise<DijkstraResult | null> {
  console.log(`\n  → Running memory Dijkstra: ${sourceNodeId} → ${targetNodeId}`);
  const graph = getGraph();

  if (!graph.hasNode(sourceNodeId) || !graph.hasNode(targetNodeId)) return null;

  try {
    const pathNodeIds = dijkstra.bidirectional(graph, sourceNodeId, targetNodeId, 'weight');
    if (!pathNodeIds || pathNodeIds.length === 0) return null;

    let totalCost = 0;
    const costs: number[] = [0];

    for (let i = 0; i < pathNodeIds.length - 1; i++) {
        const edges = graph.edges(pathNodeIds[i], pathNodeIds[i+1]);
        const w = edges.length > 0 ? (graph.getEdgeAttribute(edges[0], 'weight') as number) || 1 : 1;
        totalCost += w;
        costs.push(totalCost);
    }

    return {
      sourceId: sourceNodeId,
      targetId: targetNodeId,
      totalCost,
      pathNodeIds,
      costs,
      hops: pathNodeIds.length - 1
    };
  } catch (err) {
    return null;
  }
}

export async function detectCycles(maxDepth = 8, limit = 20): Promise<CycleResult[]> {
  console.log(`\n  → Running memory cycle detection (maxDepth=${maxDepth})...`);
  const graph = getGraph();
  
  const cycles: CycleResult[] = [];
  const globalVisited = new Set<string>();

  // Simple DFS finding cycles
  function dfs(start: string, current: string, path: string[], visited: Set<string>) {
    if (path.length > maxDepth) return;
    
    graph.forEachOutNeighbor(current, (neighbor) => {
      if (neighbor === start && path.length >= 2) {
        // Form a cycle
        const cycleNodeIds = [...path];
        const relationshipTypes: string[] = [];
        for (let i = 0; i < cycleNodeIds.length; i++) {
          const from = cycleNodeIds[i];
          const to = cycleNodeIds[(i + 1) % cycleNodeIds.length];
          const edges = graph.edges(from, to);
          if (edges.length > 0) {
            relationshipTypes.push(graph.getEdgeAttribute(edges[0], 'type') as string);
          }
        }
        
        // Ensure strictly unique cycle signature to avoid permutations
        const signature = [...cycleNodeIds].sort().join(',');
        if (!globalVisited.has(signature)) {
            globalVisited.add(signature);
            cycles.push({
                cycleNodeIds,
                relationshipTypes,
                cycleLength: cycleNodeIds.length
            });
        }
      } else if (!visited.has(neighbor)) {
        visited.add(neighbor);
        dfs(start, neighbor, [...path, neighbor], visited);
        visited.delete(neighbor);
      }
    });
  }

  graph.forEachNode((node) => {
    dfs(node, node, [node], new Set<string>([node]));
  });

  cycles.sort((a, b) => a.cycleLength - b.cycleLength);
  return cycles.slice(0, limit);
}

export async function findCriticalNodes(topN = 10): Promise<CriticalNode[]> {
  console.log(`\n  → Running memory betweenness centrality (top ${topN} nodes)...`);
  const graph = getGraph();

  if (graph.order === 0) return [];

  // Weight makes betweenness expensive, we can use unweighted or weighted
  // The Neo4j GDS projection used unweighted or natural weight stream.
  const scores = betweennessCentrality(graph);

  const nodes: CriticalNode[] = [];
  for (const [nodeId, score] of Object.entries(scores)) {
    const attrs = graph.getNodeAttributes(nodeId);
    nodes.push({
      nodeId,
      name: attrs.name as string,
      type: attrs.type as string,
      namespace: attrs.namespace as string,
      betweennessScore: Math.round(score * 100.0) / 100.0,
      isEntryPoint: !!attrs.isEntryPoint,
      isCrownJewel: !!attrs.isCrownJewel,
      riskScore: (attrs.riskScore as number) || 0
    });
  }

  nodes.sort((a, b) => b.betweennessScore - a.betweennessScore);
  return nodes.slice(0, topN);
}

export async function getBlastRadius(startNodeId: string, maxHops = 8): Promise<BlastResult[]> {
  console.log(`\n  → Computing memory blast radius for: ${startNodeId}`);
  const graph = getGraph();
  
  if (!graph.hasNode(startNodeId)) return [];

  const reachable = new Map<string, number>(); // target -> hops
  let queue: { id: string, dist: number }[] = [{ id: startNodeId, dist: 0 }];
  const visited = new Set<string>([startNodeId]);

  while (queue.length > 0) {
    const { id, dist } = queue.shift()!;
    if (dist >= maxHops) continue;

    graph.forEachOutNeighbor(id, (neighbor) => {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        reachable.set(neighbor, dist + 1);
        queue.push({ id: neighbor, dist: dist + 1 });
      }
    });
  }

  const results: BlastResult[] = [];
  for (const [targetId, hops] of reachable.entries()) {
    const attrs = graph.getNodeAttributes(targetId);
    results.push({
      reachableNodeId: targetId,
      name: attrs.name as string,
      type: attrs.type as string,
      namespace: attrs.namespace as string,
      hops,
      isCrownJewel: !!attrs.isCrownJewel,
      riskScore: (attrs.riskScore as number) || 0
    });
  }

  results.sort((a, b) => {
    if (a.hops !== b.hops) return a.hops - b.hops;
    return b.riskScore - a.riskScore;
  });

  return results;
}

export async function runAllAlgorithms(): Promise<AlgorithmResults> {
  const [attackPaths, cycles, criticalNodes] = await Promise.all([
    findAttackPaths(),
    detectCycles(),
    findCriticalNodes(),
  ]);

  return { attackPaths, cycles, criticalNodes };
}
