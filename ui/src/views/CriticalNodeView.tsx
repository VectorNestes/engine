import { useAppStore } from '../store/useAppStore';
import { GraphCanvas } from '../components/graph/GraphCanvas';
import { RiskBadge } from '../components/RiskBadge';

export function CriticalNodeView() {
  const {
    criticalData, simulateResult, loading, errors,
    selectNode, simulate,
  } = useAppStore();

  const top = criticalData?.criticalNodes?.[0] ?? null;
  const elim = criticalData?.pathElimination ?? null;

  return (
    <div className="flex flex-col h-full">
      {/* Info panel */}
      <div className="shrink-0 border-b border-[#1e1e2e] p-3">
        {loading['critical'] && (
          <div className="h-24 rounded bg-[#111118] animate-pulse" />
        )}

        {errors['critical'] && (
          <div className="px-3 py-2 border-l-2 border-red-500 bg-red-900/10 text-red-400 text-xs">
            {errors['critical']}
          </div>
        )}

        {!loading['critical'] && !top && !errors['critical'] && (
          <div className="text-[#64748b] text-xs text-center py-4">No data. Run ingest first.</div>
        )}

        {top && (
          <div className="flex gap-4 flex-wrap">
            {/* Node info */}
            <div className="flex-1 min-w-[200px] p-3 rounded bg-[#111118] border border-[#f59e0b]/40">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-[#f59e0b] font-mono uppercase tracking-wider">Critical Node</span>
                <RiskBadge score={top.riskScore} size="sm" />
              </div>
              <div
                className="font-mono text-sm text-[#e2e8f0] cursor-pointer hover:text-[#a78bfa] transition-colors"
                onClick={() => selectNode(top.nodeId)}
              >
                {top.name || top.nodeId}
              </div>
              <div className="text-[11px] text-[#64748b] mt-0.5">{top.type} · {top.namespace}</div>
              <div className="text-[11px] text-[#64748b] mt-1.5">
                Betweenness score: <span className="text-[#94a3b8] font-mono">{top.betweennessScore.toFixed(2)}</span>
              </div>
            </div>

            {/* Path elimination */}
            {elim && (
              <div className="flex-1 min-w-[200px] p-3 rounded bg-[#111118] border border-[#1e1e2e]">
                <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-2">Path Elimination (read-only)</div>
                <div className="space-y-1.5">
                  <ERow label="Total paths"    value={elim.totalPaths} />
                  <ERow label="Paths blocked"  value={elim.pathsEliminated} highlight={elim.pathsEliminated > 0} />
                  <ERow label="Paths remain"   value={elim.pathsRemaining} />
                  <ERow label="Reduction"      value={`${elim.reductionPercent}%`} />
                </div>
              </div>
            )}

            {/* Simulate button */}
            {top && (
              <div className="flex-1 min-w-[180px] p-3 rounded bg-[#111118] border border-[#1e1e2e]">
                <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-2">Simulate Removal</div>
                <button
                  onClick={() => simulate(top.nodeId)}
                  disabled={loading['simulate']}
                  className="w-full py-1.5 text-xs font-mono border border-[#1e1e2e] text-[#94a3b8] hover:border-[#7c3aed] hover:text-[#e2e8f0] rounded transition-colors disabled:opacity-40"
                >
                  {loading['simulate'] ? 'Running...' : 'Simulate'}
                </button>

                {errors['simulate'] && (
                  <p className="text-[11px] text-red-400 mt-2">{errors['simulate']}</p>
                )}

                {simulateResult && (
                  <div className="mt-2 space-y-1">
                    <ERow label="Before" value={simulateResult.results.baselinePathCount} />
                    <ERow label="After"  value={simulateResult.results.filteredPathCount} />
                    <ERow
                      label="Impact"
                      value={`−${simulateResult.results.pathsEliminated} (${simulateResult.results.reductionPercent}%)`}
                      highlight={simulateResult.results.pathsEliminated > 0}
                    />
                    <div className="text-[10px] font-mono pt-1"
                      style={{ color: simulateResult.results.reductionPercent >= 50 ? '#ef4444' : simulateResult.results.pathsEliminated > 0 ? '#f59e0b' : '#64748b' }}>
                      {simulateResult.results.verdict}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Graph — critical node highlighted */}
      <GraphCanvas criticalNodeId={top?.nodeId ?? null} />
    </div>
  );
}

function ERow({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-[11px] text-[#64748b]">{label}</span>
      <span className={`text-[11px] font-mono ${highlight ? 'text-red-400' : 'text-[#94a3b8]'}`}>{value}</span>
    </div>
  );
}
