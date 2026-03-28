import { Node, Edge, Graph, NodeType } from './schema';
import { RawClusterData } from './fetcher';

interface KubeMetadata {
  name: string;
  namespace: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

interface RoleRule {
  apiGroups: string[];
  resources: string[];
  verbs: string[];
}

const CROWN_JEWEL_SECRET_PATTERNS = [
  'credential', 'password', 'passwd', 'key', 'token', 'cert',
  'tls', 'db', 'database', 'jwt', 'secret', 'private', 'admin',
];

const CROWN_JEWEL_LABELS = ['crown-jewel', 'sensitive', 'critical'];

const MOCK_DB_NODES: Array<{ name: string; namespace: string }> = [
  { name: 'production-postgres', namespace: 'production' },
  { name: 'production-redis', namespace: 'production' },
];

const makeId = (namespace: string, name: string): string =>
  `${namespace}:${name}`;

const safeItems = (resource: unknown): unknown[] => {
  if (!resource || typeof resource !== 'object') return [];
  const r = resource as Record<string, unknown>;
  return Array.isArray(r['items']) ? (r['items'] as unknown[]) : [];
};

function safeMeta(item: unknown): KubeMetadata {
  const obj = (item ?? {}) as Record<string, unknown>;
  const meta = (obj['metadata'] ?? {}) as Record<string, unknown>;
  return {
    name: (meta['name'] as string | undefined) ?? 'unknown',
    namespace: (meta['namespace'] as string | undefined) ?? 'cluster',
    labels: (meta['labels'] as Record<string, string> | undefined) ?? {},
    annotations: (meta['annotations'] as Record<string, string> | undefined) ?? {},
  };
}

function verbsToWeight(verbs: string[]): number {
  if (!verbs || verbs.length === 0) return 1;
  if (verbs.includes('*')) return 10;
  if (verbs.some((v) => ['delete', 'deletecollection'].includes(v))) return 9;
  if (verbs.some((v) => ['create', 'update', 'patch'].includes(v))) return 7;
  if (verbs.includes('list')) return 4;
  if (verbs.some((v) => ['get', 'watch'].includes(v))) return 3;
  return 2;
}

function selectorMatches(
  selector: Record<string, string>,
  labels: Record<string, string>
): boolean {
  if (!selector || Object.keys(selector).length === 0) return false;
  return Object.entries(selector).every(([k, v]) => labels[k] === v);
}

function isSecretCrownJewel(
  name: string,
  labels: Record<string, string>
): boolean {
  const lowerName = name.toLowerCase();
  if (CROWN_JEWEL_PATTERNS_match(lowerName)) return true;
  for (const label of CROWN_JEWEL_LABELS) {
    if (labels[label] === 'true') return true;
  }
  return false;
}

function CROWN_JEWEL_PATTERNS_match(name: string): boolean {
  return CROWN_JEWEL_SECRET_PATTERNS.some((p) => name.includes(p));
}

class EdgeSet {
  private keys = new Set<string>();
  private edges: Edge[] = [];

  add(edge: Edge): void {
    const key = `${edge.from}→${edge.to}→${edge.type}`;
    if (!this.keys.has(key)) {
      this.keys.add(key);
      this.edges.push(edge);
    }
  }

  toArray(): Edge[] {
    return this.edges;
  }
}

export function transformToGraph(raw: RawClusterData): Graph {
  const nodes: Node[] = [];
  const nodeSet = new Set<string>();
  const edgeSet = new EdgeSet();

  function addNode(node: Node): void {
    if (!nodeSet.has(node.id)) {
      nodes.push(node);
      nodeSet.add(node.id);
    }
  }

  function hasNode(id: string): boolean {
    return nodeSet.has(id);
  }

  const podItems = safeItems(raw.pods);
  for (const item of podItems) {
    const { name, namespace, labels, annotations } = safeMeta(item);
    const pod = item as Record<string, unknown>;
    const spec = (pod['spec'] ?? {}) as Record<string, unknown>;
    const containers = (spec['containers'] as unknown[] | undefined) ?? [];
    const firstContainer = (containers[0] ?? {}) as Record<string, unknown>;
    const image = (firstContainer['image'] as string | undefined) ?? '';

    addNode({
      id: makeId(namespace, name),
      type: 'Pod',
      name,
      namespace,
      riskScore: 0,
      isEntryPoint: false,
      isCrownJewel: false,
      image,
      labels,
      annotations,
      cve: [],
    });
  }

  const saItems = safeItems(raw.serviceAccounts);
  for (const item of saItems) {
    const { name, namespace } = safeMeta(item);
    if (name === 'default' && namespace === 'kube-system') continue;

    addNode({
      id: makeId(namespace, name),
      type: 'ServiceAccount',
      name,
      namespace,
      riskScore: 0,
      isEntryPoint: false,
      isCrownJewel: false,
    });
  }

  const roleItems = safeItems(raw.roles);
  for (const item of roleItems) {
    const { name, namespace } = safeMeta(item);
    addNode({
      id: makeId(namespace, name),
      type: 'Role',
      name,
      namespace,
      riskScore: 0,
      isEntryPoint: false,
      isCrownJewel: false,
    });
  }

  const crItems = safeItems(raw.clusterRoles);
  for (const item of crItems) {
    const { name } = safeMeta(item);
    if (name.startsWith('system:')) continue;

    addNode({
      id: makeId('cluster', name),
      type: 'ClusterRole',
      name,
      namespace: 'cluster',
      riskScore: 0,
      isEntryPoint: false,
      isCrownJewel: false,
    });
  }

  const secretItems = safeItems(raw.secrets);
  for (const item of secretItems) {
    const { name, namespace, labels } = safeMeta(item);
    const secret = item as Record<string, unknown>;
    const secretType = (secret['type'] as string | undefined) ?? '';

    if (secretType === 'kubernetes.io/service-account-token') continue;
    if (name.startsWith('sh.helm.release')) continue;

    const isCrownJewel = isSecretCrownJewel(name, labels);

    addNode({
      id: makeId(namespace, name),
      type: 'Secret',
      name,
      namespace,
      riskScore: isCrownJewel ? 8 : 4,
      isEntryPoint: false,
      isCrownJewel,
      labels,
    });
  }

  const cmItems = safeItems(raw.configMaps);
  for (const item of cmItems) {
    const { name, namespace, labels } = safeMeta(item);
    if (name === 'kube-root-ca.crt') continue;
    if (namespace === 'kube-system' && !name.includes('user')) continue;

    addNode({
      id: makeId(namespace, name),
      type: 'ConfigMap',
      name,
      namespace,
      riskScore: 2,
      isEntryPoint: false,
      isCrownJewel: false,
      labels,
    });
  }

  const serviceItems = safeItems(raw.services ?? { items: [] });
  for (const item of serviceItems) {
    const { name, namespace, labels } = safeMeta(item);
    const svc = item as Record<string, unknown>;
    const spec = (svc['spec'] ?? {}) as Record<string, unknown>;
    const serviceType = (spec['type'] as string | undefined) ?? 'ClusterIP';

    if (serviceType !== 'LoadBalancer' && serviceType !== 'NodePort') continue;

    addNode({
      id: makeId(namespace, name),
      type: 'Service',
      name,
      namespace,
      riskScore: 6,
      isEntryPoint: true,
      isCrownJewel: false,
      labels,
    });
  }

  for (const db of MOCK_DB_NODES) {
    const id = makeId(db.namespace, db.name);
    if (!hasNode(id)) {
      addNode({
        id,
        type: 'Database',
        name: db.name,
        namespace: db.namespace,
        riskScore: 9,
        isEntryPoint: false,
        isCrownJewel: true,
      });
    }
  }

  for (const item of podItems) {
    const { name: podName, namespace } = safeMeta(item);
    const pod = item as Record<string, unknown>;
    const spec = (pod['spec'] ?? {}) as Record<string, unknown>;
    const saName = (spec['serviceAccountName'] as string | undefined) ?? 'default';

    const podId = makeId(namespace, podName);
    const saId = makeId(namespace, saName);

    if (hasNode(podId) && hasNode(saId)) {
      edgeSet.add({
        from: podId,
        to: saId,
        type: 'USES_SERVICE_ACCOUNT',
        weight: 5,
      });
    }
  }

  for (const item of serviceItems) {
    const { name: svcName, namespace } = safeMeta(item);
    const svc = item as Record<string, unknown>;
    const spec = (svc['spec'] ?? {}) as Record<string, unknown>;
    const serviceType = (spec['type'] as string | undefined) ?? 'ClusterIP';

    if (serviceType !== 'LoadBalancer' && serviceType !== 'NodePort') continue;

    const svcId = makeId(namespace, svcName);
    if (!hasNode(svcId)) continue;

    const selector = (spec['selector'] as Record<string, string> | undefined) ?? {};

    for (const podItem of podItems) {
      const { name: podName, namespace: podNs, labels } = safeMeta(podItem);
      if (podNs !== namespace) continue;
      if (!selectorMatches(selector, labels)) continue;

      const podId = makeId(podNs, podName);
      if (hasNode(podId)) {
        edgeSet.add({
          from: svcId,
          to: podId,
          type: 'EXPOSES',
          weight: 7,
        });
      }
    }
  }

  const rbItems = safeItems(raw.roleBindings);
  for (const item of rbItems) {
    const { namespace } = safeMeta(item);
    const rb = item as Record<string, unknown>;
    const subjects = ((rb['subjects'] as unknown[] | undefined) ?? []) as Array<
      Record<string, unknown>
    >;
    const roleRef = (rb['roleRef'] ?? {}) as Record<string, unknown>;

    if (!roleRef['name']) continue;

    const roleKind = (roleRef['kind'] as string | undefined) ?? 'Role';
    const roleName = roleRef['name'] as string;
    const roleNs = roleKind === 'ClusterRole' ? 'cluster' : namespace;
    const roleId = makeId(roleNs, roleName);

    for (const subject of subjects) {
      if (subject['kind'] !== 'ServiceAccount') continue;
      const subjectNs = (subject['namespace'] as string | undefined) ?? namespace;
      const saId = makeId(subjectNs, subject['name'] as string);

      if (hasNode(saId) && hasNode(roleId)) {
        edgeSet.add({
          from: saId,
          to: roleId,
          type: 'BINDS_TO',
          weight: roleKind === 'ClusterRole' ? 8 : 6,
        });
      }
    }
  }

  const crbItems = safeItems(raw.clusterRoleBindings);
  for (const item of crbItems) {
    const crb = item as Record<string, unknown>;
    const subjects = ((crb['subjects'] as unknown[] | undefined) ?? []) as Array<
      Record<string, unknown>
    >;
    const roleRef = (crb['roleRef'] ?? {}) as Record<string, unknown>;

    if (!roleRef['name']) continue;

    const roleName = roleRef['name'] as string;
    const roleId = makeId('cluster', roleName);

    for (const subject of subjects) {
      if (subject['kind'] !== 'ServiceAccount') continue;
      const subjectNs = (subject['namespace'] as string | undefined) ?? 'default';
      const saId = makeId(subjectNs, subject['name'] as string);

      if (hasNode(saId) && hasNode(roleId)) {
        edgeSet.add({
          from: saId,
          to: roleId,
          type: 'BINDS_TO',
          weight: 8,
        });
      }
    }
  }

  function resolveAccessTargets(
    resources: string[],
    verbs: string[],
    roleNamespace: string
  ): Array<{ id: string; weight: number; edgeType: 'HAS_ACCESS' | 'CAN_EXEC_INTO' }> {
    const targets: Array<{
      id: string;
      weight: number;
      edgeType: 'HAS_ACCESS' | 'CAN_EXEC_INTO';
    }> = [];

    const inNamespace = (ns: string) =>
      roleNamespace === 'cluster' || ns === roleNamespace;

    for (const resource of resources) {
      const r = resource.toLowerCase();

      if (r === 'secrets' || r === '*') {
        const w = verbsToWeight(verbs);
        for (const n of nodes) {
          if (n.type === 'Secret' && inNamespace(n.namespace)) {
            targets.push({ id: n.id, weight: w, edgeType: 'HAS_ACCESS' });
          }
        }
      }

      if (r === 'configmaps' || r === '*') {
        const w = verbsToWeight(verbs);
        for (const n of nodes) {
          if (n.type === 'ConfigMap' && inNamespace(n.namespace)) {
            targets.push({ id: n.id, weight: w, edgeType: 'HAS_ACCESS' });
            if (n.name.toLowerCase().includes('db') || n.name.toLowerCase().includes('database')) {
              for (const db of nodes) {
                if (db.type === 'Database' && inNamespace(db.namespace)) {
                  targets.push({ id: db.id, weight: Math.min(10, w + 1), edgeType: 'HAS_ACCESS' });
                }
              }
            }
          }
        }
      }

      if (r === 'pods/exec' || r === 'pods/exec,pods') {
        if (verbs.includes('create') || verbs.includes('*')) {
          for (const n of nodes) {
            if (n.type === 'Pod' && inNamespace(n.namespace)) {
              targets.push({ id: n.id, weight: 8, edgeType: 'CAN_EXEC_INTO' });
            }
          }
        }
      }

      if (r === '*') {
        for (const n of nodes) {
          if (n.type === 'Database' && inNamespace(n.namespace)) {
            targets.push({ id: n.id, weight: 10, edgeType: 'HAS_ACCESS' });
          }
        }
      }
    }

    return targets;
  }

  function processRules(
    roleId: string,
    rules: RoleRule[],
    roleNamespace: string
  ): void {
    for (const rule of rules) {
      const resources: string[] = rule.resources ?? [];
      const verbs: string[] = rule.verbs ?? [];
      if (resources.length === 0 || verbs.length === 0) continue;

      const targets = resolveAccessTargets(resources, verbs, roleNamespace);
      for (const target of targets) {
        if (target.id !== roleId && hasNode(target.id)) {
          edgeSet.add({
            from: roleId,
            to: target.id,
            type: target.edgeType,
            weight: target.weight,
            verbs,
            resources,
          });
        }
      }
    }
  }

  for (const item of roleItems) {
    const { name, namespace } = safeMeta(item);
    const role = item as Record<string, unknown>;
    const roleId = makeId(namespace, name);
    if (!hasNode(roleId)) continue;
    const rules = ((role['rules'] as unknown[] | undefined) ?? []) as RoleRule[];
    processRules(roleId, rules, namespace);
  }

  for (const item of crItems) {
    const { name } = safeMeta(item);
    if (name.startsWith('system:')) continue;
    const cr = item as Record<string, unknown>;
    const crId = makeId('cluster', name);
    if (!hasNode(crId)) continue;
    const rules = ((cr['rules'] as unknown[] | undefined) ?? []) as RoleRule[];
    processRules(crId, rules, 'cluster');
  }

  const incomingMaxWeight = new Map<string, number>();
  for (const edge of edgeSet.toArray()) {
    const current = incomingMaxWeight.get(edge.to) ?? 0;
    incomingMaxWeight.set(edge.to, Math.max(current, edge.weight));
  }

  for (const node of nodes) {
    if (node.riskScore === 0) {
      const w = incomingMaxWeight.get(node.id) ?? 0;
      node.riskScore = parseFloat(Math.min(10, w * 0.9).toFixed(1));
    }
  }

  return { nodes, edges: edgeSet.toArray() };
}
