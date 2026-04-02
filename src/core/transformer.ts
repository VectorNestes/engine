import { Node, Edge, Graph, NodeType } from './schema';
import { RawClusterData } from './fetcher';

const DANGEROUS_CAPABILITIES = [
  'SYS_ADMIN', 'NET_ADMIN', 'SYS_PTRACE', 'SYS_MODULE',
  'DAC_OVERRIDE', 'DAC_READ_SEARCH', 'FOWNER', 'SETUID', 'SETGID',
  'NET_RAW', 'SYS_RAWIO', 'MKNOD', 'AUDIT_WRITE',
];

interface PodSecurityFlags {
  isPrivileged: boolean;
  hasDockerSock: boolean;
  hasHostPath: string | null;   // the mount path, or null
  hostNetwork: boolean;
  hostPID: boolean;
  hasDangerousCap: boolean;
  runAsRoot: boolean;
}

function inspectPodSecurity(spec: Record<string, unknown>): PodSecurityFlags {
  const containers = ((spec['containers'] as unknown[] | undefined) ?? []) as Array<Record<string, unknown>>;
  const initContainers = ((spec['initContainers'] as unknown[] | undefined) ?? []) as Array<Record<string, unknown>>;
  const allContainers = [...containers, ...initContainers];

  let isPrivileged = false;
  let hasDockerSock = false;
  let hasHostPath: string | null = null;
  let hasDangerousCap = false;
  let runAsRoot = false;

  for (const c of allContainers) {
    const sc = (c['securityContext'] ?? {}) as Record<string, unknown>;
    if (sc['privileged'] === true) isPrivileged = true;

    const caps = (sc['capabilities'] ?? {}) as Record<string, unknown>;
    const addCaps = (caps['add'] as string[] | undefined) ?? [];
    if (addCaps.some((cap) => DANGEROUS_CAPABILITIES.includes(cap))) hasDangerousCap = true;

    const runAsUser = sc['runAsUser'];
    if (runAsUser === 0) runAsRoot = true;
    if (sc['runAsNonRoot'] === false) runAsRoot = true;

    const envs = ((c['env'] as unknown[] | undefined) ?? []) as Array<Record<string, unknown>>;
    for (const env of envs) {
      const val = (env['value'] as string | undefined) ?? '';
      if (val.includes('docker.sock')) hasDockerSock = true;
    }
  }

  const volumes = ((spec['volumes'] as unknown[] | undefined) ?? []) as Array<Record<string, unknown>>;
  for (const vol of volumes) {
    const hp = vol['hostPath'] as Record<string, unknown> | undefined;
    if (hp?.['path']) {
      const p = hp['path'] as string;
      if (p === '/var/run/docker.sock') {
        hasDockerSock = true;
      } else {
        hasHostPath = p;
      }
    }
  }

  const hostNetwork = spec['hostNetwork'] === true;
  const hostPID = spec['hostPID'] === true;

  return { isPrivileged, hasDockerSock, hasHostPath, hostNetwork, hostPID, hasDangerousCap, runAsRoot };
}

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

  // Track pod security flags for edge generation later
  const podSecurityMap = new Map<string, PodSecurityFlags>();

  const podItems = safeItems(raw.pods);
  for (const item of podItems) {
    const { name, namespace, labels, annotations } = safeMeta(item);
    const pod = item as Record<string, unknown>;
    const spec = (pod['spec'] ?? {}) as Record<string, unknown>;
    const containers = (spec['containers'] as unknown[] | undefined) ?? [];
    const firstContainer = (containers[0] ?? {}) as Record<string, unknown>;
    const image = (firstContainer['image'] as string | undefined) ?? '';

    const secFlags = inspectPodSecurity(spec);
    const isDangerous =
      secFlags.isPrivileged ||
      secFlags.hasDockerSock ||
      secFlags.hasHostPath !== null ||
      secFlags.hostNetwork ||
      secFlags.hostPID ||
      secFlags.hasDangerousCap;

    const podId = makeId(namespace, name);
    podSecurityMap.set(podId, secFlags);

    addNode({
      id: podId,
      type: 'Pod',
      name,
      namespace,
      riskScore: isDangerous ? 7 : 0,
      isEntryPoint: isDangerous,
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

  // Synthetic SA inference: pods may reference SAs that were not returned by
  // kubectl (e.g. kubernetes-dashboard SA missing from manifests).  Create a
  // placeholder node so traversal can continue through it.
  for (const item of podItems) {
    const { namespace } = safeMeta(item);
    const pod = item as Record<string, unknown>;
    const spec = (pod['spec'] ?? {}) as Record<string, unknown>;
    const saName = (spec['serviceAccountName'] as string | undefined) ?? 'default';
    const saId = makeId(namespace, saName);
    if (!hasNode(saId) && saName !== 'default') {
      addNode({
        id: saId,
        type: 'ServiceAccount',
        name: saName,
        namespace,
        riskScore: 3,
        isEntryPoint: false,
        isCrownJewel: false,
        annotations: { 'k8s-av/synthetic': 'true' },
      });
    }
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

  // ── Issue 3: Non-RBAC security edges from pod security flags ─────────────
  for (const item of podItems) {
    const { name: podName, namespace } = safeMeta(item);
    const podId = makeId(namespace, podName);
    const flags = podSecurityMap.get(podId);
    if (!flags) continue;

    // Each dangerous pod gets edges to itself encoding the escape vector.
    // Weight values per spec: privileged=9, docker.sock=9, hostPath=7-9,
    // hostNetwork=6, hostPID=7, dangerous caps=7, runAsRoot=5 (amplifier).
    if (flags.isPrivileged) {
      edgeSet.add({ from: podId, to: podId, type: 'PRIVILEGED_CONTAINER_ESCAPE', weight: 9 });
    }
    if (flags.hasDockerSock) {
      edgeSet.add({ from: podId, to: podId, type: 'DOCKER_SOCKET_ESCAPE', weight: 9 });
    }
    if (flags.hasHostPath !== null) {
      const sensitiveHostPaths = ['/etc', '/proc', '/sys', '/root', '/var/lib/kubelet', '/run/secrets'];
      const isSensitive = sensitiveHostPaths.some((p) => flags.hasHostPath!.startsWith(p));
      edgeSet.add({ from: podId, to: podId, type: 'HOST_PATH_MOUNT', weight: isSensitive ? 9 : 7 });
    }
    if (flags.hostNetwork) {
      edgeSet.add({ from: podId, to: podId, type: 'HOST_NETWORK_NAMESPACE', weight: 6 });
    }
    if (flags.hostPID) {
      edgeSet.add({ from: podId, to: podId, type: 'HOST_PID_NAMESPACE', weight: 7 });
    }
    if (flags.hasDangerousCap) {
      edgeSet.add({ from: podId, to: podId, type: 'DANGEROUS_CAPABILITIES', weight: 7 });
    }
    if (flags.runAsRoot) {
      edgeSet.add({ from: podId, to: podId, type: 'RUN_AS_ROOT', weight: 5 });
    }
  }

  // ── Issue 2: AUTH_BYPASS edge for pods with --enable-skip-login arg ───────
  for (const item of podItems) {
    const { name: podName, namespace } = safeMeta(item);
    const pod = item as Record<string, unknown>;
    const spec = (pod['spec'] ?? {}) as Record<string, unknown>;
    const containers = ((spec['containers'] as unknown[] | undefined) ?? []) as Array<Record<string, unknown>>;

    for (const c of containers) {
      const args = ((c['args'] as string[] | undefined) ?? []);
      const cmd  = ((c['command'] as string[] | undefined) ?? []);
      const allArgs = [...args, ...cmd];
      if (allArgs.some((a) => a.includes('--enable-skip-login') || a.includes('--disable-auth'))) {
        const podId = makeId(namespace, podName);
        // AUTH_BYPASS edge: pod can skip auth to reach its SA directly
        const saName = (spec['serviceAccountName'] as string | undefined) ?? 'default';
        const saId = makeId(namespace, saName);
        if (hasNode(podId) && hasNode(saId)) {
          edgeSet.add({ from: podId, to: saId, type: 'AUTH_BYPASS', weight: 9 });
        }
      }
    }
  }

  // ── Issue 4: UNRESTRICTED_EGRESS + PLAINTEXT_CREDENTIAL detection ─────────
  // Collect which namespaces have at least one NetworkPolicy with an egress rule.
  const namespacesWithEgressPolicy = new Set<string>();
  const networkPolicies = safeItems((raw as unknown as Record<string, unknown>)['networkPolicies'] ?? { items: [] });
  for (const np of networkPolicies) {
    const { namespace } = safeMeta(np);
    const policy = np as Record<string, unknown>;
    const spec = (policy['spec'] ?? {}) as Record<string, unknown>;
    const egress = spec['egress'] as unknown[] | undefined;
    if (Array.isArray(egress) && egress.length > 0) {
      namespacesWithEgressPolicy.add(namespace);
    }
  }

  // Namespaces with no egress NetworkPolicy get UNRESTRICTED_EGRESS edges
  // between all pods in that namespace (pod → pod lateral movement).
  const podsByNamespace = new Map<string, string[]>();
  for (const item of podItems) {
    const { name, namespace } = safeMeta(item);
    const existing = podsByNamespace.get(namespace) ?? [];
    existing.push(makeId(namespace, name));
    podsByNamespace.set(namespace, existing);
  }

  for (const [ns, podIds] of podsByNamespace.entries()) {
    if (namespacesWithEgressPolicy.has(ns)) continue; // egress policy present, skip
    for (const fromId of podIds) {
      for (const toId of podIds) {
        if (fromId === toId) continue;
        if (hasNode(fromId) && hasNode(toId)) {
          edgeSet.add({ from: fromId, to: toId, type: 'UNRESTRICTED_EGRESS', weight: 5 });
        }
      }
    }
  }

  // PLAINTEXT_CREDENTIAL: detect env vars that look like passwords/tokens/keys
  const credentialEnvPattern = /password|passwd|secret|token|key|api[_-]?key|credential|auth/i;
  for (const item of podItems) {
    const { name: podName, namespace } = safeMeta(item);
    const pod = item as Record<string, unknown>;
    const spec = (pod['spec'] ?? {}) as Record<string, unknown>;
    const containers = ((spec['containers'] as unknown[] | undefined) ?? []) as Array<Record<string, unknown>>;
    const podId = makeId(namespace, podName);

    for (const c of containers) {
      const envs = ((c['env'] as unknown[] | undefined) ?? []) as Array<Record<string, unknown>>;
      for (const env of envs) {
        const envName = (env['name'] as string | undefined) ?? '';
        const envVal  = (env['value'] as string | undefined) ?? '';
        // Only flag literal values (not valueFrom references) that match cred patterns
        if (credentialEnvPattern.test(envName) && envVal.length > 0 && !('valueFrom' in env)) {
          // Edge from pod to any secret whose name matches the credential name
          for (const n of nodes) {
            if (n.type === 'Secret' && n.namespace === namespace) {
              edgeSet.add({ from: podId, to: n.id, type: 'PLAINTEXT_CREDENTIAL', weight: 8 });
            }
          }
          break; // one per container is enough
        }
      }
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
