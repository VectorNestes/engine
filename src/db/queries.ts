import { runQuery } from './neo4j-client';
import {
  PathResult,
  DijkstraResult,
  CycleResult,
  CriticalNode,
  QueryNode,
  PathRelationship,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// GDS GRAPH PROJECTION MANAGEMENT
//
// GDS algorithms require a named in-memory graph projection.
// We cache it for the lifetime of the process and only re-project on demand.
// ─────────────────────────────────────────────────────────────────────────────

const PROJECTION_NAME = 'attackGraph';

/**
 * Returns true if the named GDS in-memory graph already exists.
 */
async function projectionExists(): Promise<boolean> {
  const rows = await runQuery<{ exists: boolean }>(
    `RETURN gds.graph.exists($name) AS exists`,
    { name: PROJECTION_NAME }
  );
  return rows[0]?.exists ?? false;
}

/**
 * Projects the K8sNode graph into GDS memory.
 *
 * • Uses 'K8sNode' as the node filter (all Kubernetes nodes share this label).
 * • Projects ALL relationship types with their `weight` property.
 * • Stores riskScore as a node property for potential future use.
 *
 * This is idempotent — if the projection already exists it is reused.
 */
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

  await runQuery(`
    CALL gds.graph.project(
      $name,
      {
        K8sNode: {
          properties: ['riskScore', 'isEntryPoint', 'isCrownJewel']
        }
      },
      {
        USES_SERVICE_ACCOUNT: { properties: 'weight', orientation: 'NATURAL' },
        BINDS_TO:             { properties: 'weight', orientation: 'NATURAL' },
        HAS_ACCESS:           { properties: 'weight', orientation: 'NATURAL' },
        EXPOSES:              { properties: 'weight', orientation: 'NATURAL' },
        MOUNTS_SECRET:        { properties: 'weight', orientation: 'NATURAL' },
        READS_CONFIGMAP:      { properties: 'weight', orientation: 'NATURAL' },
        CAN_EXEC_INTO:        { properties: 'weight', orientation: 'NATURAL' }
      }
    )
    YIELD graphName, nodeCount, relationshipCount
    RETURN graphName, nodeCount, relationshipCount
  `, { name: PROJECTION_NAME });

  console.log(`  ✔ GDS projection '${PROJECTION_NAME}' created`);
}

/** Drops the in-memory projection (call after algorithms to free memory). */
export async function dropProjection(): Promise<void> {
  if (await projectionExists()) {
    await runQuery(`CALL gds.graph.drop($name, false)`, { name: PROJECTION_NAME });
    console.log(`  ✔ GDS projection dropped`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ALGORITHM 1 — BFS: ALL ATTACK PATHS
//
// Uses Cypher variable-length path matching to find every route from an
// entry-point node to a crown-jewel node.
//
// Why Cypher (not GDS BFS)?
//   • GDS BFS finds shortest paths from a single source.
//   • We need ALL paths across ALL (entry, crown-jewel) pairs.
//   • Cypher's [*1..maxHops] does this naturally.
//   • With 42 nodes and maxHops=10 the result set is manageable.
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * Finds ALL attack paths from entry-point nodes to crown-jewel nodes.
 *
 * @param maxHops  Maximum path length in edges (default 10)
 * @param limit    Maximum number of paths to return, sorted by totalWeight DESC
 */
export async function findAttackPaths(
  maxHops = 10,
  limit   = 50
): Promise<PathResult[]> {
  console.log(`\n  → Running BFS attack-path discovery (maxHops=${maxHops})...`);

  // We extract all node/edge data in Cypher so TypeScript never sees raw
  // Neo4j Node/Relationship/Path objects.
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
    LIMIT $limit
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

// ─────────────────────────────────────────────────────────────────────────────
// ALGORITHM 2 — DIJKSTRA: SHORTEST RISK PATH (GDS)
//
// Uses gds.shortestPath.dijkstra to find the minimum-weight path between
// a specific source and target node.
//
// Weight = privilege severity (higher weight = more dangerous hop).
// Dijkstra minimises total weight → returns the safest (lowest risk) path,
// which in threat modelling means: the path the attacker would prefer
// (lowest resistance / detectable footprint).
// ─────────────────────────────────────────────────────────────────────────────

interface DijkstraRow {
  sourceId:    string;
  targetId:    string;
  totalCost:   number;
  pathNodeIds: string[];
  costs:       number[];
  hops:        number;
}

/**
 * Finds the shortest (minimum total weight) path between two nodes using
 * the GDS Dijkstra algorithm.
 *
 * @param sourceNodeId  `id` property of the source node  (e.g. "default:nginx-lb")
 * @param targetNodeId  `id` property of the target node  (e.g. "production:db-credentials")
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// ALGORITHM 3 — DFS CYCLE DETECTION (privilege escalation loops)
//
// A cycle in the RBAC graph means a service account can reach a role that
// can exec back into the pod using that same service account — a privilege
// escalation loop.
//
// Example detected in mock data:
//   production:frontend-pod
//     → [USES_SERVICE_ACCOUNT] → production:frontend-sa
//     → [BINDS_TO]             → production:pod-executor
//     → [CAN_EXEC_INTO]        → production:frontend-pod   ← back to start!
// ─────────────────────────────────────────────────────────────────────────────

interface CycleRow {
  cycleNodeIds:      string[];
  relationshipTypes: string[];
  cycleLength:       number;
}

/**
 * Detects privilege escalation cycles in the RBAC graph.
 *
 * @param maxDepth  Maximum cycle length to search (default 8 to prevent runaway)
 * @param limit     Maximum number of unique cycles to return
 */
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
    LIMIT $limit
  `, { limit });

  return rows as CycleResult[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ALGORITHM 4 — BETWEENNESS CENTRALITY (GDS)
//
// Betweenness centrality = how many shortest paths pass through a node.
// A high score means this node is a chokepoint: compromising it gives the
// attacker leverage over many attack paths simultaneously.
//
// Defenders should prioritise hardening high-betweenness nodes.
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * Returns the top-N nodes ranked by betweenness centrality.
 * These are the most critical nodes to defend — removing or hardening them
 * breaks the largest number of attack paths.
 *
 * @param topN  Number of nodes to return (default 10)
 */
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
    LIMIT $topN
  `, { projection: PROJECTION_NAME, topN });

  return rows as CriticalNode[];
}

// ─────────────────────────────────────────────────────────────────────────────
// BONUS — BLAST RADIUS QUERY
//
// Given a node id, returns every node reachable from it within N hops.
// Useful for: "if this service account is compromised, what can it reach?"
// ─────────────────────────────────────────────────────────────────────────────

export interface BlastResult {
  reachableNodeId: string;
  name:            string;
  type:            string;
  namespace:       string;
  hops:            number;
  isCrownJewel:    boolean;
  riskScore:       number;
}

/**
 * Returns every node reachable from a given node within `maxHops` hops.
 *
 * @param startNodeId  `id` property of the starting node
 * @param maxHops      Maximum traversal depth (default 8)
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE — runAllAlgorithms()
//
// Runs all four core algorithms in sequence with a single call.
// Used by the test script and can power an API endpoint.
// ─────────────────────────────────────────────────────────────────────────────

export interface AlgorithmResults {
  attackPaths:   PathResult[];
  cycles:        CycleResult[];
  criticalNodes: CriticalNode[];
}

/**
 * Runs BFS, cycle detection, and betweenness centrality in one call.
 * Dijkstra is NOT included here because it requires specific source/target IDs
 * that depend on the loaded graph; use `findShortestPath()` separately.
 */
export async function runAllAlgorithms(): Promise<AlgorithmResults> {
  await ensureProjection();

  const [attackPaths, cycles, criticalNodes] = await Promise.all([
    findAttackPaths(),
    detectCycles(),
    findCriticalNodes(),
  ]);

  return { attackPaths, cycles, criticalNodes };
}
