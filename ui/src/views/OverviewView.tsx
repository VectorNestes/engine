import { useAppStore } from '../store/useAppStore';
import { GraphCanvas } from '../components/graph/GraphCanvas';

export function OverviewView() {
  const { graphMeta, vulnSummary, loading, errors } = useAppStore();

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar */}
      {(graphMeta || loading['graph']) && (
        <div className="shrink-0 flex gap-3 p-3 border-b border-[#1e1e2e]">
          {loading['graph']
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 w-36 rounded bg-[#111118] animate-pulse" />
              ))
            : graphMeta && (
                <>
                  <StatCard label="Nodes"       value={graphMeta.totalNodes} />
                  <StatCard label="Edges"       value={graphMeta.totalEdges} />
                  <StatCard label="Entry Points" value={graphMeta.entryPoints} accent="blue" />
                  <StatCard label="Crown Jewels" value={graphMeta.crownJewels} accent="amber" />
                  {vulnSummary && (
                    <StatCard label="Vulnerabilities" value={vulnSummary.total} accent={vulnSummary.critical > 0 ? 'red' : undefined} />
                  )}
                  {vulnSummary && vulnSummary.critical > 0 && (
                    <StatCard label="Critical" value={vulnSummary.critical} accent="red" />
                  )}
                </>
              )
          }
        </div>
      )}

      {/* Error */}
      {errors['graph'] && (
        <div className="shrink-0 mx-3 mt-3 px-3 py-2 border-l-2 border-red-500 bg-red-900/10 text-red-400 text-xs">
          {errors['graph']}
        </div>
      )}

      {/* Graph */}
      <GraphCanvas />
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: 'red' | 'blue' | 'amber' }) {
  const borderColor = accent === 'red' ? 'border-red-800' : accent === 'blue' ? 'border-blue-800' : accent === 'amber' ? 'border-amber-800' : 'border-[#1e1e2e]';
  const textColor   = accent === 'red' ? 'text-red-400'   : accent === 'blue' ? 'text-blue-400'   : accent === 'amber' ? 'text-amber-400'   : 'text-[#e2e8f0]';

  return (
    <div className={`px-3 py-2 rounded bg-[#111118] border ${borderColor} min-w-[80px]`}>
      <div className="text-[10px] text-[#64748b] uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-mono mt-0.5 ${textColor}`}>{value}</div>
    </div>
  );
}
