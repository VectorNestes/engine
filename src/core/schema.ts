import { z } from 'zod';

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

export const NodeSchema = z.object({
  id: z.string().min(1, 'Node id must not be empty'),
  type: NodeTypeEnum,
  name: z.string().min(1, 'Node name must not be empty'),
  namespace: z.string(),
  riskScore: z.number().min(0).max(10),
  isEntryPoint: z.boolean(),
  isCrownJewel: z.boolean(),
  cve: z.array(z.string()).optional(),
  image: z.string().optional(),
  labels: z.record(z.string()).optional(),
  annotations: z.record(z.string()).optional(),
});

export const EdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: EdgeTypeEnum,
  weight: z.number().min(0).max(10),
  verbs: z.array(z.string()).optional(),
  resources: z.array(z.string()).optional(),
});

export const AttackPathSchema = z.object({
  path: z.array(z.string()),
  riskScore: z.number().min(0).max(10),
  entryPoint: z.string(),
  crownJewel: z.string(),
  hops: z.number().int().nonnegative(),
});

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

export type NodeType = z.infer<typeof NodeTypeEnum>;
export type EdgeType = z.infer<typeof EdgeTypeEnum>;
export type Node = z.infer<typeof NodeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type AttackPath = z.infer<typeof AttackPathSchema>;
export type Graph = z.infer<typeof GraphSchema>;

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
