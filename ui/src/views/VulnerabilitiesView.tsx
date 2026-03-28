import { useAppStore } from '../store/useAppStore';
import { GraphCanvas } from '../components/graph/GraphCanvas';
import { RiskBadge } from '../components/RiskBadge';

export function VulnerabilitiesView() {
  const { vulnerabilities, vulnSummary, selectNode, loading, errors } = useAppStore();

  return (
    <div className="flex flex-col h-full">
      {/* Table */}
      <div className="shrink-0 border-b border-[#1e1e2e]" style={{ maxHeight: '280px', overflowY: 'auto' }}>
        {loading['vulns'] && (
          <div className="p-3 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-[#111118] animate-pulse" />
            ))}
          </div>
        )}

        {errors['vulns'] && (
          <div className="m-3 px-3 py-2 border-l-2 border-red-500 bg-red-900/10 text-red-400 text-xs">
            {errors['vulns']}
          </div>
        )}

        {vulnSummary && (
          <div className="flex gap-4 px-3 py-2 border-b border-[#1e1e2e] text-[11px] text-[#64748b]">
            <span>Total: <span className="text-[#94a3b8]">{vulnSummary.total}</span></span>
            {vulnSummary.critical > 0 && <span>Critical: <span className="text-red-400">{vulnSummary.critical}</span></span>}
            {vulnSummary.high > 0    && <span>High: <span className="text-amber-400">{vulnSummary.high}</span></span>}
            {vulnSummary.withCves > 0 && <span>CVEs: <span className="text-[#94a3b8]">{vulnSummary.withCves}</span></span>}
          </div>
        )}

        {!loading['vulns'] && vulnerabilities.length === 0 && !errors['vulns'] && (
          <div className="p-4 text-[#64748b] text-xs text-center">No vulnerabilities above threshold.</div>
        )}

        {vulnerabilities.length > 0 && (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[#1e1e2e] text-[10px] text-[#64748b] uppercase tracking-wider">
                <th className="text-left px-3 py-2 font-normal">Node</th>
                <th className="text-left px-3 py-2 font-normal">Type</th>
                <th className="text-left px-3 py-2 font-normal">Risk</th>
                <th className="text-left px-3 py-2 font-normal">CVEs</th>
                <th className="text-left px-3 py-2 font-normal">Reason</th>
              </tr>
            </thead>
            <tbody>
              {vulnerabilities.map((v) => (
                <tr
                  key={v.nodeId}
                  onClick={() => selectNode(v.nodeId)}
                  className="border-b border-[#1e1e2e] hover:bg-white/[0.02] cursor-pointer group"
                >
                  <td className="px-3 py-2 font-mono text-[11px] text-[#7c3aed] group-hover:text-[#a78bfa] max-w-[140px] truncate">
                    {v.nodeId.split(':').pop()}
                  </td>
                  <td className="px-3 py-2 text-[#64748b]">{v.type}</td>
                  <td className="px-3 py-2"><RiskBadge score={v.riskScore} size="sm" /></td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {v.cves.length > 0
                        ? v.cves.slice(0, 2).map((c) => (
                            <span key={c} className="font-mono text-[9px] px-1 py-0.5 bg-red-900/30 text-red-300 border border-red-900 rounded">{c}</span>
                          ))
                        : <span className="text-[#3a3a4e]">—</span>
                      }
                      {v.cves.length > 2 && <span className="text-[10px] text-[#64748b]">+{v.cves.length - 2}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[#64748b] max-w-[240px]">
                    <span className="line-clamp-2">{v.reason}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Graph (risk-tinted) */}
      <GraphCanvas />
    </div>
  );
}
