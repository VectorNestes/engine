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

export const EDGE_TYPES: readonly EdgeType[] = [
  'USES_SERVICE_ACCOUNT',
  'BINDS_TO',
  'HAS_ACCESS',
  'EXPOSES',
  'MOUNTS_SECRET',
  'READS_CONFIGMAP',
  'CAN_EXEC_INTO',
] as const;

export interface CveEntry {
  cveId: string;
  cvssScore: number;
  description?: string;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  namespace: string;
  riskScore: number;
  isEntryPoint: boolean;
  isCrownJewel: boolean;
  image?: string;
  cve?: string[];
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: EdgeType;
  weight: number;
  verbs?: string[];
  resources?: string[];
}

export interface AttackPathEntry {
  path: string[];
  riskScore: number;
  entryPoint: string;
  crownJewel: string;
  hops: number;
}

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

export interface PathRelationship {
  type: string;
  weight: number;
  from: string;
  to: string;
}

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

export interface DijkstraResult {
  sourceId: string;
  targetId: string;
  totalCost: number;
  pathNodeIds: string[];
  costs: number[];
  hops: number;
}

export interface CycleResult {
  cycleNodeIds: string[];
  relationshipTypes: string[];
  cycleLength: number;
}

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

export interface LoaderStats {
  nodesLoaded: number;
  edgesLoaded: number;
  indexesCreated: number;
  durationMs: number;
}

export interface TestSummary {
  attackPathsFound: number;
  shortestPathHops: number | null;
  cyclesFound: number;
  criticalNodesTop: string;
  allPassed: boolean;
}
