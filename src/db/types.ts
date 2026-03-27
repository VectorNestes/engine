// ─────────────────────────────────────────────────────────────────────────────
// src/db/types.ts
//
// Canonical type definitions for the Graph & Algorithms Engine.
// These are the integration contract between:
//   • loader.ts  (writes to Neo4j)
//   • queries.ts (reads from Neo4j / GDS)
//   • API layer  (serves results to frontend)
//
// They intentionally mirror src/core/schema.ts without pulling in Zod so
// this module has zero runtime dependencies.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export type NodeType =
  | 'Pod'
  | 'ServiceAccount'
  | 'Role'
  | 'ClusterRole'
  | 'Secret'
  | 'ConfigMap'
  | 'Service'
  | 'Database';

export type EdgeType =
  | 'USES_SERVICE_ACCOUNT'
  | 'BINDS_TO'
  | 'HAS_ACCESS'
  | 'EXPOSES'
  | 'MOUNTS_SECRET'
  | 'READS_CONFIGMAP'
  | 'CAN_EXEC_INTO';

// All concrete node labels used in Neo4j (also all valid NodeType values).
export const NODE_LABELS: readonly NodeType[] = [
  'Pod',
  'ServiceAccount',
  'Role',
  'ClusterRole',
  'Secret',
  'ConfigMap',
  'Service',
  'Database',
] as const;

// All relationship types stored in Neo4j.
export const EDGE_TYPES: readonly EdgeType[] = [
  'USES_SERVICE_ACCOUNT',
  'BINDS_TO',
  'HAS_ACCESS',
  'EXPOSES',
  'MOUNTS_SECRET',
  'READS_CONFIGMAP',
  'CAN_EXEC_INTO',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// INPUT SHAPES  (what loader.ts reads from cluster-graph.json)
// ─────────────────────────────────────────────────────────────────────────────

export interface CveEntry {
  cveId: string;
  cvssScore: number;
  description?: string;
}

/** A single node as it appears in cluster-graph.json */
export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  namespace: string;
  riskScore: number;
  isEntryPoint: boolean;
  isCrownJewel: boolean;
  image?: string;
  cve?: string[];           // list of CVE IDs (e.g. "CVE-2021-44228")
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

/** A single edge as it appears in cluster-graph.json */
export interface GraphEdge {
  from: string;
  to: string;
  type: EdgeType;
  weight: number;
  verbs?: string[];
  resources?: string[];
}

/** Pre-computed attack path from scan pipeline (stored as metadata) */
export interface AttackPathEntry {
  path: string[];
  riskScore: number;
  entryPoint: string;
  crownJewel: string;
  hops: number;
}

/** Top-level shape of cluster-graph.json */
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  attackPaths?: AttackPathEntry[];
  metadata?: {
    generatedAt: string;
    clusterContext?: string;
    totalNodes: number;
    totalEdges: number;
    totalAttackPaths?: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// QUERY RESULT SHAPES  (what queries.ts returns to callers)
// ─────────────────────────────────────────────────────────────────────────────

/** A node as returned by a Neo4j query (after Integer → number conversion) */
export interface QueryNode {
  id: string;
  type: string;
  name: string;
  namespace: string;
  riskScore: number;
  isEntryPoint: boolean;
  isCrownJewel: boolean;
  image?: string;
  cve?: string[];
}

/** A relationship as returned in path queries */
export interface PathRelationship {
  type: string;
  weight: number;
  from: string;
  to: string;
}

/**
 * Result of a single BFS attack path found in Neo4j.
 * Returned by `findAttackPaths()`.
 */
export interface PathResult {
  entryPoint: string;
  crownJewel: string;
  nodeIds: string[];
  nodes: QueryNode[];
  relationships: PathRelationship[];
  totalWeight: number;
  hops: number;
  riskScore: number;
}

/**
 * Result of Dijkstra shortest-path query.
 * Returned by `findShortestPath()`.
 */
export interface DijkstraResult {
  sourceId: string;
  targetId: string;
  totalCost: number;
  pathNodeIds: string[];
  costs: number[];
  hops: number;
}

/**
 * A detected cycle (privilege escalation loop).
 * Returned by `detectCycles()`.
 */
export interface CycleResult {
  cycleNodeIds: string[];
  relationshipTypes: string[];
  cycleLength: number;
}

/**
 * A node ranked by betweenness centrality (most critical chokepoints).
 * Returned by `findCriticalNodes()`.
 */
export interface CriticalNode {
  nodeId: string;
  name: string;
  type: string;
  namespace: string;
  betweennessScore: number;
  isEntryPoint: boolean;
  isCrownJewel: boolean;
  riskScore: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// OPERATIONAL TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Statistics returned by loader.ts after ingestion */
export interface LoaderStats {
  nodesLoaded: number;
  edgesLoaded: number;
  indexesCreated: number;
  durationMs: number;
}

/** Summary returned by the full test run in test.ts */
export interface TestSummary {
  attackPathsFound: number;
  shortestPathHops: number | null;
  cyclesFound: number;
  criticalNodesTop: string;
  allPassed: boolean;
}
