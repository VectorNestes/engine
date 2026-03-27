import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Raw output from kubectl get <resource> -A -o json */
export interface KubeList {
  apiVersion: string;
  kind: string;
  items: unknown[];
}

/** Structured raw cluster data as fetched from kubectl */
export interface RawClusterData {
  pods: KubeList;
  serviceAccounts: KubeList;
  roles: KubeList;
  clusterRoles: KubeList;
  roleBindings: KubeList;
  clusterRoleBindings: KubeList;
  secrets: KubeList;
  configMaps: KubeList;
  services: KubeList;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_LIST: KubeList = { apiVersion: 'v1', kind: 'List', items: [] };

const KUBECTL_TIMEOUT_MS = 30_000;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes a single kubectl command and returns the parsed JSON.
 * On failure, logs a warning and returns an empty list — never crashes.
 */
function runKubectl(command: string, resourceName: string): KubeList {
  try {
    const raw = execSync(command, {
      encoding: 'utf8',
      timeout: KUBECTL_TIMEOUT_MS,
      // Pipe all three streams so kubectl's stderr never reaches the terminal.
      // stdout is returned as a string; stderr is captured silently.
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(raw) as KubeList;
  } catch (err) {
    // Extract the first meaningful line from stderr if available, otherwise
    // fall back to the generic Error message.
    let msg = 'unknown error';
    if (err instanceof Error) {
      const detail = (err as NodeJS.ErrnoException & { stderr?: string }).stderr;
      const firstLine = (detail ?? err.message)
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 0 && !l.startsWith('E0') && !l.startsWith('W0'));
      msg = firstLine ?? err.message.split('\n')[0];
    }
    console.warn(`  ⚠️  Failed to fetch ${resourceName}: ${msg}`);
    return { ...EMPTY_LIST, kind: `${resourceName}List` };
  }
}

/** Resolves the path to the mock data file, supporting both ts-node and compiled dist. */
function resolveMockPath(): string {
  // When running via ts-node: __dirname = src/cli or src/core
  // When running compiled:    __dirname = dist/cli or dist/core
  const candidates = [
    path.resolve(__dirname, '../data/mock-cluster-graph.json'),   // ts-node from src/core
    path.resolve(__dirname, '../../src/data/mock-cluster-graph.json'), // compiled from dist/core
    path.resolve(process.cwd(), 'src/data/mock-cluster-graph.json'),
    path.resolve(process.cwd(), 'data/mock-cluster-graph.json'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(
    `Mock data file not found. Tried:\n${candidates.map((c) => `  • ${c}`).join('\n')}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches raw Kubernetes cluster data.
 *
 * @param mockMode  When true, loads data from the bundled mock JSON file
 *                  and skips all kubectl calls entirely.
 */
export async function fetchClusterData(mockMode = false): Promise<RawClusterData> {
  if (mockMode) {
    const filePath = resolveMockPath();
    console.log(`  → Loading mock cluster data from: ${filePath}`);
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as RawClusterData;
  }

  // ── Live kubectl mode ──────────────────────────────────────────────────────
  const resources: Array<[keyof RawClusterData, string, string]> = [
    ['pods',                 'kubectl get pods -A -o json',                 'pods'],
    ['serviceAccounts',      'kubectl get serviceaccounts -A -o json',      'serviceAccounts'],
    ['roles',                'kubectl get roles -A -o json',                'roles'],
    ['clusterRoles',         'kubectl get clusterroles -A -o json',         'clusterRoles'],
    ['roleBindings',         'kubectl get rolebindings -A -o json',         'roleBindings'],
    ['clusterRoleBindings',  'kubectl get clusterrolebindings -A -o json',  'clusterRoleBindings'],
    ['secrets',              'kubectl get secrets -A -o json',              'secrets'],
    ['configMaps',           'kubectl get configmaps -A -o json',           'configMaps'],
    ['services',             'kubectl get services -A -o json',             'services'],
  ];

  const result = {} as RawClusterData;

  for (const [key, command, label] of resources) {
    console.log(`  → Fetching ${label}...`);
    result[key] = runKubectl(command, label);
  }

  return result;
}
