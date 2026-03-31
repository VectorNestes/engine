import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface KubeList {
  apiVersion: string;
  kind: string;
  items: unknown[];
}

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

const EMPTY_LIST: KubeList = { apiVersion: 'v1', kind: 'List', items: [] };

const KUBECTL_TIMEOUT_MS = 30_000;

function runKubectl(command: string, resourceName: string): KubeList {
  try {
    const raw = execSync(command, {
      encoding: 'utf8',
      timeout: KUBECTL_TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(raw) as KubeList;
  } catch (err) {
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

function resolveMockPath(): string {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'data', 'cluster-graph.json'),
    path.resolve(__dirname, '..', 'data', 'cluster-graph.json'),
    path.resolve(__dirname, 'data', 'cluster-graph.json'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(
    `Mock data file not found. Tried:\n${candidates.map((c) => `  • ${c}`).join('\n')}`
  );
}

export async function fetchClusterData(mockMode = false): Promise<RawClusterData> {
  if (mockMode) {
    const filePath = resolveMockPath();
    console.log(`  → Loading mock cluster data from: ${filePath}`);
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as RawClusterData;
  }

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
