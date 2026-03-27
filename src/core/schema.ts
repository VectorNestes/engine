import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export const NodeTypeEnum = z.enum([
  'Pod',
  'ServiceAccount',
  'Role',
  'ClusterRole',
  'Secret',
  'ConfigMap',
  'Database',
  'Service',
]);

export const EdgeTypeEnum = z.enum([
  'USES_SERVICE_ACCOUNT',
  'BINDS_TO',
  'HAS_ACCESS',
  'EXPOSES',
  'MOUNTS_SECRET',
  'READS_CONFIGMAP',
  'CAN_EXEC_INTO',
]);

// ─────────────────────────────────────────────────────────────────────────────
// NODE SCHEMA
// ─────────────────────────────────────────────────────────────────────────────

export const NodeSchema = z.object({
  /** Unique identifier: "namespace:name" */
  id: z.string().min(1, 'Node id must not be empty'),
  type: NodeTypeEnum,
  name: z.string().min(1, 'Node name must not be empty'),
  /** "cluster" for cluster-scoped resources */
  namespace: z.string(),
  /** 0–10; higher = more dangerous */
  riskScore: z.number().min(0).max(10),
  /** True if directly reachable from outside the cluster */
  isEntryPoint: z.boolean(),
  /** True if compromising this node is critical (secrets, prod DBs) */
  isCrownJewel: z.boolean(),
  /** CVE identifiers discovered via NVD enrichment */
  cve: z.array(z.string()).optional(),
  /** Container image (Pod nodes only) */
  image: z.string().optional(),
  labels: z.record(z.string()).optional(),
  annotations: z.record(z.string()).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// EDGE SCHEMA
// ─────────────────────────────────────────────────────────────────────────────

export const EdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: EdgeTypeEnum,
  /** Privilege severity: 0 = read-only, 10 = full admin */
  weight: z.number().min(0).max(10),
  /** RBAC verbs that grant this access */
  verbs: z.array(z.string()).optional(),
  /** Kubernetes resource types involved */
  resources: z.array(z.string()).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// ATTACK PATH SCHEMA
// ─────────────────────────────────────────────────────────────────────────────

export const AttackPathSchema = z.object({
  /** Ordered list of node IDs from entry point to crown jewel */
  path: z.array(z.string()),
  /** Average risk score across path nodes */
  riskScore: z.number().min(0).max(10),
  entryPoint: z.string(),
  crownJewel: z.string(),
  /** Number of hops (edges) in the path */
  hops: z.number().int().nonnegative(),
});

// ─────────────────────────────────────────────────────────────────────────────
// GRAPH SCHEMA
// ─────────────────────────────────────────────────────────────────────────────

export const GraphSchema = z.object({
  nodes: z.array(NodeSchema).min(1, 'Graph must contain at least one node'),
  edges: z.array(EdgeSchema),
  attackPaths: z.array(AttackPathSchema).optional(),
  metadata: z
    .object({
      generatedAt: z.string(),
      clusterContext: z.string().optional(),
      totalNodes: z.number().int().nonnegative(),
      totalEdges: z.number().int().nonnegative(),
      totalAttackPaths: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type NodeType = z.infer<typeof NodeTypeEnum>;
export type EdgeType = z.infer<typeof EdgeTypeEnum>;
export type Node = z.infer<typeof NodeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type AttackPath = z.infer<typeof AttackPathSchema>;
export type Graph = z.infer<typeof GraphSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates a graph object against the Zod schema.
 * Prints a summary and throws a readable error on failure.
 */
export function validateGraph(graph: unknown): Graph {
  const result = GraphSchema.safeParse(graph);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  • ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Schema validation failed:\n${errors}`);
  }

  const g = result.data;
  const crownJewelCount = g.nodes.filter((n) => n.isCrownJewel).length;
  const entryPointCount = g.nodes.filter((n) => n.isEntryPoint).length;
  const cveEnriched = g.nodes.filter((n) => (n.cve?.length ?? 0) > 0).length;

  console.log('  ✔ Graph validated successfully');
  console.log(`  ✔ Node count        : ${g.nodes.length}`);
  console.log(`  ✔ Edge count        : ${g.edges.length}`);
  console.log(`  ✔ Entry points      : ${entryPointCount}`);
  console.log(`  ✔ Crown jewels      : ${crownJewelCount}`);
  console.log(`  ✔ CVE-enriched pods : ${cveEnriched}`);
  if (g.attackPaths) {
    console.log(`  ✔ Attack paths      : ${g.attackPaths.length}`);
  }

  return g;
}
