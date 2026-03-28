/**
 * risk-explainer.ts
 *
 * Central engine for generating human-readable security explanations.
 * All reasoning is derived dynamically from:
 *   • RBAC graph topology (edges + connected node types)
 *   • CVE scores and image data
 *   • Node role in the attack graph (entry point / crown jewel)
 *
 * No hardcoded explanation strings — every sentence is built from actual data.
 */

// ─────────────────────────────────────────────────────────────────────────────
// INPUT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ExplainerNode {
  id:           string;
  type:         string;
  name:         string;
  namespace:    string;
  riskScore:    number;
  isEntryPoint: boolean;
  isCrownJewel: boolean;
  image?:       string | null;
  cve?:         string[] | null;
}

export interface OutEdge {
  relType:    string | null;
  toId:       string | null;
  toType:     string | null;
  toName:     string | null;
  weight:     number | null;
  verbs?:     string[] | null;
  resources?: string[] | null;
}

export interface InEdge {
  relType:  string | null;
  fromId:   string | null;
  fromType: string | null;
  fromName: string | null;
  weight:   number | null;
}

export interface PathRelationship {
  type:   string;
  from:   string;
  to:     string;
  weight: number;
  verbs?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function label(name: string | null | undefined, fallback: string): string {
  return name && name.trim() ? `"${name}"` : fallback;
}

function verbList(verbs: string[] | null | undefined): string {
  if (!verbs || verbs.length === 0) return 'access';
  return verbs.slice(0, 4).join('/');
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE EXPLANATION
// Derives reasoning from actual RBAC relationships, CVEs, and topology.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a human-readable security explanation for a single node.
 *
 * @param node     The node being explained
 * @param outEdges Edges originating FROM this node (with connected node metadata)
 * @param inEdges  Edges pointing TO this node (with source node metadata)
 */
export function explainNode(
  node:     ExplainerNode,
  outEdges: OutEdge[],
  inEdges:  InEdge[]
): string {
  const reasons: string[] = [];

  // ── External exposure ──────────────────────────────────────────────────────
  if (node.isEntryPoint) {
    if (node.type === 'Service') {
      reasons.push(
        `Externally accessible service (LoadBalancer/NodePort) — provides a direct network entry point into the cluster for unauthenticated attackers.`
      );
    } else if (node.type === 'Pod') {
      reasons.push(
        `Pod is directly reachable from outside the cluster, making it the primary initial compromise target.`
      );
    }
  }

  // ── Crown jewel impact ────────────────────────────────────────────────────
  if (node.isCrownJewel) {
    if (node.type === 'Secret') {
      reasons.push(
        `Stores sensitive credentials — successful exfiltration exposes authentication tokens, TLS private keys, or database passwords.`
      );
    } else if (node.type === 'Database') {
      reasons.push(
        `Production database — compromise enables complete data exfiltration, data manipulation, and persistent backdoor access.`
      );
    } else {
      reasons.push(
        `Critical cluster asset — compromise of this ${node.type.toLowerCase()} has a high blast radius across dependent services.`
      );
    }
  }

  // ── CVE-based risk ────────────────────────────────────────────────────────
  if (node.cve && node.cve.length > 0) {
    const cveList  = node.cve.slice(0, 3).join(', ');
    const morePart = node.cve.length > 3 ? ` (+${node.cve.length - 3} more)` : '';
    const imgPart  = node.image ? ` in image "${node.image}"` : '';
    reasons.push(
      `${node.cve.length} known CVE(s) detected${imgPart}: ${cveList}${morePart}. ` +
      `These vulnerabilities may allow remote code execution or privilege escalation without authentication.`
    );
  }

  // ── Type-specific RBAC analysis ───────────────────────────────────────────
  switch (node.type) {

    case 'Pod': {
      const saEdges = outEdges.filter((e) => e.relType === 'USES_SERVICE_ACCOUNT');
      if (saEdges.length > 0) {
        const saName = saEdges[0]?.toName ?? 'service account';
        reasons.push(
          `Runs as ServiceAccount ${label(saName, 'a service account')}, inheriting its RBAC permissions — ` +
          `any exploit inside this pod immediately gains those cluster privileges.`
        );
      }
      if (!node.cve?.length && node.riskScore > 7) {
        reasons.push(
          `High risk score (${node.riskScore}/10) indicates dangerous RBAC exposure — ` +
          `this pod's ServiceAccount can reach sensitive resources.`
        );
      }
      break;
    }

    case 'ServiceAccount': {
      const bindEdges    = outEdges.filter((e) => e.relType === 'BINDS_TO');
      const clusterRoles = bindEdges.filter((e) => e.toType === 'ClusterRole');
      const roles        = bindEdges.filter((e) => e.toType === 'Role');

      if (clusterRoles.length > 0) {
        const names = clusterRoles.map((e) => e.toName ?? e.toId ?? 'ClusterRole').join(', ');
        reasons.push(
          `Bound to ClusterRole(s) [${names}] — grants permissions across ALL namespaces, ` +
          `enabling cluster-wide lateral movement after any pod running this identity is compromised.`
        );
      }
      if (roles.length > 0) {
        const names = roles.map((e) => e.toName ?? e.toId ?? 'Role').join(', ');
        reasons.push(
          `Bound to Role(s) [${names}] — any pod using this identity can leverage these ` +
          `namespace-scoped permissions to access sensitive resources.`
        );
      }
      if (bindEdges.length === 0 && node.riskScore > 5) {
        reasons.push(
          `Elevated risk score (${node.riskScore}/10) — this ServiceAccount is on an identified attack path.`
        );
      }
      break;
    }

    case 'Role':
    case 'ClusterRole': {
      const accessEdges = outEdges.filter((e) => e.relType === 'HAS_ACCESS');
      if (accessEdges.length > 0) {
        const secretAccess = accessEdges.filter((e) => e.toType === 'Secret');
        const podAccess    = accessEdges.filter((e) => e.toType === 'Pod');
        const dbAccess     = accessEdges.filter((e) => e.toType === 'Database');
        const otherAccess  = accessEdges.filter(
          (e) => e.toType !== 'Secret' && e.toType !== 'Pod' && e.toType !== 'Database'
        );

        if (secretAccess.length > 0) {
          const verbs = verbList([...new Set(secretAccess.flatMap((e) => e.verbs ?? []))]);
          reasons.push(
            `Grants ${verbs} access to ${secretAccess.length} secret(s) — ` +
            `attackers can directly extract credentials without further privilege escalation.`
          );
        }
        if (podAccess.length > 0) {
          const verbs = verbList([...new Set(podAccess.flatMap((e) => e.verbs ?? []))]);
          reasons.push(
            `Grants ${verbs} access to ${podAccess.length} pod(s) — ` +
            `enables arbitrary code execution inside running production containers.`
          );
        }
        if (dbAccess.length > 0) {
          reasons.push(
            `Has access to ${dbAccess.length} database(s) — ` +
            `permits direct data exfiltration from production storage.`
          );
        }
        if (otherAccess.length > 0) {
          const types = [...new Set(otherAccess.map((e) => e.toType ?? 'resource'))].join(', ');
          reasons.push(
            `Also grants access to: ${types}.`
          );
        }
      }
      if (node.type === 'ClusterRole') {
        reasons.push(
          `ClusterRole scope means these permissions apply cluster-wide — privilege escalation has maximum blast radius.`
        );
      }
      break;
    }

    case 'Secret': {
      const mountedBy  = inEdges.filter((e) => e.relType === 'MOUNTS_SECRET');
      const rbacAccess = inEdges.filter((e) => e.relType === 'HAS_ACCESS');

      if (mountedBy.length > 0) {
        const podNames = mountedBy.map((e) => e.fromName ?? e.fromId ?? 'pod').join(', ');
        reasons.push(
          `Mounted as a filesystem volume into pod(s) [${podNames}] — ` +
          `readable as plaintext files by any process inside those containers.`
        );
      }
      if (rbacAccess.length > 0) {
        reasons.push(
          `Accessible to ${rbacAccess.length} RBAC role(s) — ` +
          `any ServiceAccount bound to those roles can read this secret via the Kubernetes API.`
        );
      }
      break;
    }

    case 'Service': {
      const exposes = outEdges.filter((e) => e.relType === 'EXPOSES');
      if (exposes.length > 0) {
        const podNames = exposes.map((e) => e.toName ?? e.toId ?? 'pod').join(', ');
        reasons.push(
          `Routes traffic directly to pod(s) [${podNames}] — ` +
          `network access through this service reaches the listed pods with no additional barriers.`
        );
      }
      break;
    }

    case 'ConfigMap': {
      const readers = inEdges.filter((e) => e.relType === 'READS_CONFIGMAP');
      if (readers.length > 0) {
        reasons.push(
          `Read by ${readers.length} pod(s) — may contain sensitive configuration such as internal endpoints or credentials stored insecurely.`
        );
      }
      break;
    }
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  if (reasons.length === 0) {
    reasons.push(
      `Risk score ${node.riskScore}/10 — this ${node.type.toLowerCase()} ${label(node.name, '')} ` +
      `lies on an identified attack path and warrants investigation.`
    );
  }

  return reasons.join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH EXPLANATION
// Builds a step-by-step attack narrative from ordered nodes + relationships.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a human-readable narrative describing how an attacker traverses
 * the given attack path from entry point to crown jewel.
 *
 * @param nodes         Ordered list of nodes in the path
 * @param relationships Ordered list of relationships connecting them
 */
export function explainPath(
  nodes:         ExplainerNode[],
  relationships: PathRelationship[]
): string {
  if (nodes.length < 2) return 'Path data insufficient for analysis.';

  const entry  = nodes[0]!;
  const target = nodes[nodes.length - 1]!;
  const steps:  string[] = [];

  // ── Step 1: Entry ─────────────────────────────────────────────────────────
  if (entry.type === 'Service') {
    steps.push(
      `Attacker gains initial access through externally exposed service ${label(entry.name, 'a service')}`
    );
  } else if (entry.type === 'Pod') {
    const cvePart = entry.cve?.length ? ` exploiting ${entry.cve[0]}` : '';
    steps.push(
      `Attacker compromises pod ${label(entry.name, 'an entry pod')}${cvePart}`
    );
  } else {
    steps.push(
      `Attacker compromises ${entry.type.toLowerCase()} ${label(entry.name, '')}`
    );
  }

  // ── Steps 2..N: Traversal ─────────────────────────────────────────────────
  for (let i = 0; i < relationships.length; i++) {
    const rel  = relationships[i]!;
    const next = nodes[i + 1];
    const nextName = next ? label(next.name, next.type.toLowerCase()) : 'next node';

    switch (rel.type) {
      case 'EXPOSES':
        steps.push(`pivots into pod ${nextName} via service routing`);
        break;
      case 'USES_SERVICE_ACCOUNT':
        steps.push(`assumes the identity of ServiceAccount ${nextName}, inheriting its RBAC permissions`);
        break;
      case 'BINDS_TO':
        steps.push(`exploits a Role binding to escalate privileges through ${nextName}`);
        break;
      case 'HAS_ACCESS': {
        const verbs = verbList(rel.verbs);
        const tgt   = next?.type ?? 'resource';
        steps.push(`uses the role's ${verbs} permissions on ${tgt} ${nextName}`);
        break;
      }
      case 'CAN_EXEC_INTO':
        steps.push(`executes arbitrary commands inside pod ${nextName}`);
        break;
      case 'MOUNTS_SECRET':
        steps.push(`reads secret ${nextName} from the pod filesystem`);
        break;
      case 'READS_CONFIGMAP':
        steps.push(`accesses ConfigMap ${nextName} for sensitive configuration data`);
        break;
      default:
        steps.push(`moves to ${next?.type ?? 'node'} ${nextName} via ${rel.type}`);
    }
  }

  // ── Final impact ──────────────────────────────────────────────────────────
  // Only append an impact sentence if the last step didn't already describe it
  const lastRel = relationships[relationships.length - 1];
  const alreadyDescribed = lastRel?.type === 'MOUNTS_SECRET' || lastRel?.type === 'HAS_ACCESS';

  if (!alreadyDescribed) {
    if (target.type === 'Secret') {
      steps.push(
        `successfully exfiltrating credentials from secret ${label(target.name, '')} — full credential compromise achieved`
      );
    } else if (target.type === 'Database') {
      steps.push(
        `reaching database ${label(target.name, '')} and enabling full data exfiltration`
      );
    } else if (target.isCrownJewel) {
      steps.push(
        `compromising critical asset ${label(target.name, '')} — cluster objective achieved`
      );
    }
  }

  return steps.join(' → ') + '.';
}

// ─────────────────────────────────────────────────────────────────────────────
// VULNERABILITY REASON SUMMARY
// Short one-liner for the `reason` field in /api/vulnerabilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a concise one-line reason why a node is considered vulnerable.
 * Derived from the same data as explainNode but optimised for a summary field.
 */
export function summariseRisk(
  node:     ExplainerNode,
  outEdges: OutEdge[],
  inEdges:  InEdge[]
): string {
  if (node.cve && node.cve.length > 0) {
    return `${node.cve.length} CVE(s) in container image — remote exploit risk`;
  }
  if (node.isEntryPoint && node.type === 'Service') {
    return 'Externally exposed service — direct cluster entry point';
  }
  if (node.isCrownJewel) {
    return `Crown jewel ${node.type.toLowerCase()} — high-value target`;
  }

  const hasSecretAccess = outEdges.some(
    (e) => e.relType === 'HAS_ACCESS' && e.toType === 'Secret'
  );
  if (hasSecretAccess) return 'Has RBAC access to secrets — credential theft vector';

  const isClusterRole = outEdges.some((e) => e.toType === 'ClusterRole');
  if (isClusterRole) return 'Bound to ClusterRole — cluster-wide privilege escalation path';

  const bindCount = outEdges.filter((e) => e.relType === 'BINDS_TO').length;
  if (bindCount > 0) return `Bound to ${bindCount} role(s) — RBAC privilege escalation path`;

  const mountedBy = inEdges.filter((e) => e.relType === 'MOUNTS_SECRET').length;
  if (mountedBy > 0) return `Mounted into ${mountedBy} pod(s) — directly readable from filesystem`;

  return `Risk score ${node.riskScore}/10 — on active attack path`;
}
