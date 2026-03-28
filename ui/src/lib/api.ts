async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`GET ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`POST ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface GraphNode {
  id: string;
  type: string;
  name: string;
  namespace: string;
  riskScore: number;
  isEntryPoint: boolean;
  isCrownJewel: boolean;
  image: string | null;
  cve: string[];
}

export interface GraphEdge {
  from: string;
  to: string;
  type: string;
  weight: number;
  verbs: string[];
  resources: string[];
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    totalNodes: number;
    totalEdges: number;
    entryPoints: number;
    crownJewels: number;
    retrievedAt: string;
  };
}

export interface Vulnerability {
  nodeId: string;
  type: string;
  namespace: string;
  riskScore: number;
  isEntryPoint: boolean;
  isCrownJewel: boolean;
  cves: string[];
  reason: string;
  explanation: string;
  connections: { out: number; in: number };
}

export interface VulnsResponse {
  vulnerabilities: Vulnerability[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    entryPoints: number;
    crownJewels: number;
    withCves: number;
  };
}

export interface AttackPath {
  nodes: string[];
  riskScore: number;
  entryPoint: string;
  crownJewel: string;
  hops: number;
  totalWeight: number;
  description: string;
}

export interface PathsResponse {
  paths: AttackPath[];
  summary: {
    total: number;
    critical: number;
    uniqueEntryPoints: number;
    uniqueCrownJewels: number;
    avgHops: number;
  };
}

export interface CriticalNodeResult {
  nodeId: string;
  name: string;
  type: string;
  namespace: string;
  betweennessScore: number;
  isEntryPoint: boolean;
  isCrownJewel: boolean;
  riskScore: number;
}

export interface CriticalResponse {
  criticalNodes: CriticalNodeResult[];
  pathElimination: {
    nodeId: string;
    totalPaths: number;
    pathsEliminated: number;
    pathsRemaining: number;
    reductionPercent: number;
    note: string;
  } | null;
}

export interface SimulateResponse {
  simulation: {
    nodeId: string;
    maxHops: number;
    graphMutated: boolean;
    durationMs: number;
  };
  results: {
    baselinePathCount: number;
    filteredPathCount: number;
    pathsEliminated: number;
    reductionPercent: number;
    verdict: string;
  };
}

export interface ReportResponse {
  report: unknown;
  formatted: string;
}

export const api = {
  getGraph:           () => get<GraphResponse>('/api/graph'),
  getVulnerabilities: () => get<VulnsResponse>('/api/vulnerabilities'),
  getPaths:           () => get<PathsResponse>('/api/paths'),
  getCriticalNode:    () => get<CriticalResponse>('/api/critical-node'),
  getReport:          () => get<ReportResponse>('/api/report'),
  simulate:           (nodeId: string) =>
    post<SimulateResponse>('/api/simulate', { nodeId }),
};
