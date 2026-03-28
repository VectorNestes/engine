import { create } from 'zustand';
import {
  api,
  GraphNode, GraphEdge,
  Vulnerability, AttackPath,
  CriticalResponse, SimulateResponse, ReportResponse,
} from '../lib/api';

type View = 'overview' | 'paths' | 'vulnerabilities' | 'critical' | 'report';

interface AppState {
  // ── Data ──────────────────────────────────────────────────────────────────
  graphNodes:       GraphNode[];
  graphEdges:       GraphEdge[];
  graphMeta:        { totalNodes: number; totalEdges: number; entryPoints: number; crownJewels: number } | null;
  vulnerabilities:  Vulnerability[];
  vulnSummary:      { total: number; critical: number; high: number; medium: number } | null;
  paths:            AttackPath[];
  pathsSummary:     { total: number; critical: number } | null;
  criticalData:     CriticalResponse | null;
  simulateResult:   SimulateResponse | null;
  reportData:       ReportResponse | null;

  // ── UI state ──────────────────────────────────────────────────────────────
  activeView:       View;
  selectedNodeId:   string | null;
  selectedPathIdx:  number | null;
  loading:          Record<string, boolean>;
  errors:           Record<string, string | null>;

  // ── Actions ───────────────────────────────────────────────────────────────
  setView:          (v: View) => void;
  selectNode:       (id: string | null) => void;
  selectPath:       (idx: number | null) => void;
  clearSimulate:    () => void;

  fetchGraph:           () => Promise<void>;
  fetchVulnerabilities: () => Promise<void>;
  fetchPaths:           () => Promise<void>;
  fetchCritical:        () => Promise<void>;
  fetchReport:          () => Promise<void>;
  simulate:             (nodeId: string) => Promise<void>;
}

function setLoading(set: (fn: (s: AppState) => Partial<AppState>) => void, key: string, val: boolean) {
  set((s) => ({ loading: { ...s.loading, [key]: val } }));
}
function setError(set: (fn: (s: AppState) => Partial<AppState>) => void, key: string, msg: string | null) {
  set((s) => ({ errors: { ...s.errors, [key]: msg } }));
}

export const useAppStore = create<AppState>((set, get) => ({
  // ── Initial state ─────────────────────────────────────────────────────────
  graphNodes:      [],
  graphEdges:      [],
  graphMeta:       null,
  vulnerabilities: [],
  vulnSummary:     null,
  paths:           [],
  pathsSummary:    null,
  criticalData:    null,
  simulateResult:  null,
  reportData:      null,

  activeView:      'overview',
  selectedNodeId:  null,
  selectedPathIdx: null,
  loading:         {},
  errors:          {},

  // ── UI actions ─────────────────────────────────────────────────────────────
  setView: (v) => {
    set({ activeView: v, selectedPathIdx: null });
    // Lazy-fetch on first activation
    const s = get();
    if (v === 'paths'          && s.paths.length === 0)        s.fetchPaths();
    if (v === 'vulnerabilities' && s.vulnerabilities.length === 0) s.fetchVulnerabilities();
    if (v === 'critical'       && !s.criticalData)             s.fetchCritical();
    if (v === 'report'         && !s.reportData)               s.fetchReport();
  },

  selectNode:    (id)  => set({ selectedNodeId: id, simulateResult: null }),
  selectPath:    (idx) => set({ selectedPathIdx: idx }),
  clearSimulate: ()    => set({ simulateResult: null }),

  // ── Fetch actions ──────────────────────────────────────────────────────────
  fetchGraph: async () => {
    setLoading(set, 'graph', true);
    setError(set, 'graph', null);
    try {
      const data = await api.getGraph();
      set({
        graphNodes: data.nodes,
        graphEdges: data.edges,
        graphMeta:  data.metadata,
      });
    } catch (e) {
      setError(set, 'graph', (e as Error).message);
    } finally {
      setLoading(set, 'graph', false);
    }
  },

  fetchVulnerabilities: async () => {
    setLoading(set, 'vulns', true);
    setError(set, 'vulns', null);
    try {
      const data = await api.getVulnerabilities();
      set({ vulnerabilities: data.vulnerabilities, vulnSummary: data.summary });
    } catch (e) {
      setError(set, 'vulns', (e as Error).message);
    } finally {
      setLoading(set, 'vulns', false);
    }
  },

  fetchPaths: async () => {
    setLoading(set, 'paths', true);
    setError(set, 'paths', null);
    try {
      const data = await api.getPaths();
      set({ paths: data.paths, pathsSummary: data.summary });
    } catch (e) {
      setError(set, 'paths', (e as Error).message);
    } finally {
      setLoading(set, 'paths', false);
    }
  },

  fetchCritical: async () => {
    setLoading(set, 'critical', true);
    setError(set, 'critical', null);
    try {
      const data = await api.getCriticalNode();
      set({ criticalData: data });
    } catch (e) {
      setError(set, 'critical', (e as Error).message);
    } finally {
      setLoading(set, 'critical', false);
    }
  },

  fetchReport: async () => {
    setLoading(set, 'report', true);
    setError(set, 'report', null);
    try {
      const data = await api.getReport();
      set({ reportData: data });
    } catch (e) {
      setError(set, 'report', (e as Error).message);
    } finally {
      setLoading(set, 'report', false);
    }
  },

  simulate: async (nodeId: string) => {
    setLoading(set, 'simulate', true);
    setError(set, 'simulate', null);
    try {
      const data = await api.simulate(nodeId);
      set({ simulateResult: data });
    } catch (e) {
      setError(set, 'simulate', (e as Error).message);
    } finally {
      setLoading(set, 'simulate', false);
    }
  },
}));
