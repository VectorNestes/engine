import { runQuery } from './neo4j-client';
import {
  PathResult,
  DijkstraResult,
  CycleResult,
  CriticalNode,
  QueryNode,
  PathRelationship,
} from './types';

const PROJECTION_NAME = 'attackGraph';

async function projectionExists(): Promise<boolean> {
  const rows = await runQuery<{ exists: boolean }>(
    `RETURN gds.graph.exists($name) AS exists`,
    { name: PROJECTION_NAME }
  );
  return rows[0]?.exists ?? false;
}

export async function ensureProjection(forceRefresh = false): Promise<void> {
  if (!forceRefresh && (await projectionExists())) {
    console.log(`  → GDS projection '${PROJECTION_NAME}' already exists — reusing`);
    return;
  }

  if (forceRefresh && (await projectionExists())) {
    await runQuery(`CALL gds.graph.drop($name, false)`, { name: PROJECTION_NAME });
    console.log(`  → Dropped stale GDS projection`);
  }

  console.log(`  → Projecting graph into GDS memory...`);

  const relRows = await runQuery<{ type: string }>(
    `MATCH ()-[r:K8sNode|USES_SERVICE_ACCOUNT|BINDS_TO|HAS_ACCESS|EXPOSES|MOUNTS_SECRET|READS_CONFIGMAP|CAN_EXEC_INTO]->() RETURN DISTINCT type(r) AS type`
  );

  const knownTypes = relRows.map((r) => r.type);
  const typesToProject = knownTypes.length > 0
    ? knownTypes
    : (await runQuery<{ type: string }>(`MATCH ()-[r]->() RETURN DISTINCT type(r) AS type`)).map((r) => r.type);

  if (typesToProject.length === 0) {
    throw new Error('No relationships found in the database. Run POST /api/ingest first.');
  }

  const relProjection = typesToProject
    .map((t) => `${t}: { properties: 'weight', orientation: 'NATURAL' }`)
    .join(',\n        ');

  await runQuery(`
    CALL gds.graph.project(
      $name,
      {
        K8sNode: {
          properties: ['riskScore']
        }
      },
      {
        ${relProjection}
      }
    )
    YIELD graphName, nodeCount, relationshipCount
    RETURN graphName, nodeCount, relationshipCount
  `, { name: PROJECTION_NAME });

  console.log(`  ✔ GDS projection '${PROJECTION_NAME}' created (types: ${typesToProject.join(', ')})`);
}

export async function dropProjection(): Promise<void> {
  if (await projectionExists()) {
    await runQuery(`CALL gds.graph.drop($name, false)`, { name: PROJECTION_NAME });
    console.log(`  ✔ GDS projection dropped`);
  }
}

interface BfsRow {
  entryPoint:    string;
  crownJewel:    string;
  nodeIds:       string[];
  pathNodes:     QueryNode[];
  pathRels:      PathRelationship[];
  totalWeight:   number;
  hops:          number;
  riskScore:     number;
}

export async function findAttackPaths(
  maxHops = 10,
  limit   = 50
): Promise<PathResult[]> {
  console.log(`\n  → Running BFS attack-path discovery (maxHops=${maxHops})...`);

  const rows = await runQuery<BfsRow>(`
    MATCH p = (start:K8sNode)-[*1..${maxHops}]->(end:K8sNode)
    WHERE start.isEntryPoint = true
      AND end.isCrownJewel   = true

    WITH p,
         nodes(p)         AS ns,
         relationships(p) AS rs

    WITH p, ns, rs,
         [ n IN ns | n.id ]                                        AS nodeIds,
         [ n IN ns | {
               id:           n.id,
               type:         n.type,
               name:         n.name,
               namespace:    n.namespace,
               riskScore:    n.riskScore,
               isEntryPoint: n.isEntryPoint,
               isCrownJewel: n.isCrownJewel,
               image:        n.image,
               cve:          n.cve
           }]                                                       AS pathNodes,
         [ r IN rs | {
               type:   type(r),
               weight: r.weight,
               from:   startNode(r).id,
               to:     endNode(r).id
           }]                                                       AS pathRels,
         reduce(w = 0.0, r IN rs | w + r.weight)                   AS totalWeight,
         length(p)                                                  AS hops

    WITH nodeIds, pathNodes, pathRels, totalWeight, hops,
         ns[0].id        AS entryPoint,
         ns[-1].id       AS crownJewel,
         ns[0].riskScore AS entryRisk,
         ns[-1].riskScore AS crownRisk

    WITH nodeIds, pathNodes, pathRels, totalWeight, hops,
         entryPoint, crownJewel,
         round(
           100.0 * (0.6 * crownRisk + 0.4 * (totalWeight / hops))
         ) / 100.0   AS riskScore

    RETURN entryPoint, crownJewel, nodeIds, pathNodes, pathRels,
           totalWeight, hops, riskScore

    ORDER BY totalWeight DESC, hops ASC
    LIMIT toInteger($limit)
  `, { limit });

  return rows.map((r, i) => ({
    pathId:        i + 1,
    entryPoint:    r.entryPoint,
    crownJewel:    r.crownJewel,
    nodeIds:       r.nodeIds,
    nodes:         r.pathNodes,
    relationships: r.pathRels,
    totalWeight:   r.totalWeight,
    hops:          r.hops,
    riskScore:     r.riskScore,
  })) as PathResult[];
}

interface DijkstraRow {
  sourceId:    string;
  targetId:    string;
  totalCost:   number;
  pathNodeIds: string[];
  costs:       number[];
  hops:        number;
}

export async function findShortestPath(
  sourceNodeId: string,
  targetNodeId:  string
): Promise<DijkstraResult | null> {
  console.log(`\n  → Running Dijkstra: ${sourceNodeId} → ${targetNodeId}`);

  await ensureProjection();

  const rows = await runQuery<DijkstraRow>(`
    MATCH (source:K8sNode {id: $sourceId})
    MATCH (target:K8sNode {id: $targetId})

    CALL gds.shortestPath.dijkstra.stream($projection, {
      sourceNode:                 source,
      targetNode:                 target,
      relationshipWeightProperty: 'weight'
    })
    YIELD index, sourceNode, targetNode, totalCost, nodeIds, costs, path

    RETURN
      gds.util.asNode(sourceNode).id                        AS sourceId,
      gds.util.asNode(targetNode).id                        AS targetId,
      totalCost,
      [ nodeId IN nodeIds | gds.util.asNode(nodeId).id ]    AS pathNodeIds,
      costs,
      size(nodeIds) - 1                                     AS hops
  `, {
    sourceId:   sourceNodeId,
    targetId:   targetNodeId,
    projection: PROJECTION_NAME,
  });

  if (rows.length === 0) {
    console.log(`  → No path found between ${sourceNodeId} and ${targetNodeId}`);
    return null;
  }

  return rows[0] as DijkstraResult;
}

interface CycleRow {
  cycleNodeIds:      string[];
  relationshipTypes: string[];
  cycleLength:       number;
}

export async function detectCycles(
  maxDepth = 8,
  limit    = 20
): Promise<CycleResult[]> {
  console.log(`\n  → Running cycle detection (maxDepth=${maxDepth})...`);

  const rows = await runQuery<CycleRow>(`
    MATCH p = (a:K8sNode)-[*2..${maxDepth}]->(a)

    WITH
      [ n IN nodes(p)         | n.id    ] AS cycleNodeIds,
      [ r IN relationships(p) | type(r) ] AS relationshipTypes,
      length(p)                            AS cycleLength

    RETURN DISTINCT cycleNodeIds, relationshipTypes, cycleLength
    ORDER BY cycleLength ASC
    LIMIT toInteger($limit)
  `, { limit });

  return rows as CycleResult[];
}

interface CentralityRow {
  nodeId:           string;
  name:             string;
  type:             string;
  namespace:        string;
  betweennessScore: number;
  isEntryPoint:     boolean;
  isCrownJewel:     boolean;
  riskScore:        number;
}

export async function findCriticalNodes(topN = 10): Promise<CriticalNode[]> {
  console.log(`\n  → Running betweenness centrality (top ${topN} nodes)...`);

  await ensureProjection();

  const rows = await runQuery<CentralityRow>(`
    CALL gds.betweenness.stream($projection)
    YIELD nodeId, score

    MATCH (n:K8sNode) WHERE id(n) = nodeId

    RETURN
      n.id           AS nodeId,
      n.name         AS name,
      n.type         AS type,
      n.namespace    AS namespace,
      round(score * 100.0) / 100.0  AS betweennessScore,
      n.isEntryPoint AS isEntryPoint,
      n.isCrownJewel AS isCrownJewel,
      n.riskScore    AS riskScore

    ORDER BY betweennessScore DESC
    LIMIT toInteger($topN)
  `, { projection: PROJECTION_NAME, topN });

  return rows as CriticalNode[];
}

export interface BlastResult {
  reachableNodeId: string;
  name:            string;
  type:            string;
  namespace:       string;
  hops:            number;
  isCrownJewel:    boolean;
  riskScore:       number;
}

export async function getBlastRadius(
  startNodeId: string,
  maxHops = 8
): Promise<BlastResult[]> {
  console.log(`\n  → Computing blast radius for: ${startNodeId}`);

  const rows = await runQuery<BlastResult>(`
    MATCH (start:K8sNode {id: $startId})
    MATCH p = (start)-[*1..${maxHops}]->(target:K8sNode)
    WHERE target.id <> $startId

    WITH DISTINCT target, min(length(p)) AS hops

    RETURN
      target.id           AS reachableNodeId,
      target.name         AS name,
      target.type         AS type,
      target.namespace    AS namespace,
      hops,
      target.isCrownJewel AS isCrownJewel,
      target.riskScore    AS riskScore

    ORDER BY hops ASC, target.riskScore DESC
  `, { startId: startNodeId });

  return rows as BlastResult[];
}

export interface AlgorithmResults {
  attackPaths:   PathResult[];
  cycles:        CycleResult[];
  criticalNodes: CriticalNode[];
}

export async function runAllAlgorithms(): Promise<AlgorithmResults> {
  await ensureProjection();

  const [attackPaths, cycles, criticalNodes] = await Promise.all([
    findAttackPaths(),
    detectCycles(),
    findCriticalNodes(),
  ]);

  return { attackPaths, cycles, criticalNodes };
}
