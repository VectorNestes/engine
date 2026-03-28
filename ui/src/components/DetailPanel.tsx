import { useAppStore } from '../store/useAppStore';
import { RiskBadge } from './RiskBadge';

export function DetailPanel() {
  const {
    selectedNodeId, graphNodes, vulnerabilities,
    simulateResult, loading, errors,
    selectNode, simulate,
  } = useAppStore();

  const node = graphNodes.find((n) => n.id === selectedNodeId);
  const vuln = vulnerabilities.find((v) => v.nodeId === selectedNodeId);

  if (!node) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={() => selectNode(null)}
      />

      {/* Panel */}
      <aside
        className="fixed right-0 top-0 bottom-0 z-50 w-[340px] flex flex-col"
        style={{
          background: '#0d0d14',
          borderLeft: '1px solid #1e1e2e',
          animation: 'slideIn 0.18s ease',
        }}
      >
        <style>{`@keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-[#1e1e2e]">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-[#7c3aed] font-mono uppercase tracking-wider mb-1">{node.type}</div>
            <div className="font-mono text-sm text-[#e2e8f0] break-all">{node.name || node.id}</div>
            <div className="text-[11px] text-[#64748b] mt-0.5">{node.namespace}</div>
          </div>
          <button
            onClick={() => selectNode(null)}
            className="ml-3 text-[#64748b] hover:text-[#e2e8f0] text-lg leading-none shrink-0"
          >×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {node.isEntryPoint && <Tag label="Entry Point" color="blue" />}
            {node.isCrownJewel && <Tag label="Crown Jewel" color="amber" />}
            {vuln && <RiskBadge score={vuln.riskScore} />}
          </div>

          {/* Image */}
          {node.image && (
            <Row label="Image">
              <span className="font-mono text-[11px] text-[#94a3b8] break-all">{node.image}</span>
            </Row>
          )}

          {/* CVEs */}
          {(node.cve?.length ?? 0) > 0 && (
            <Section title="CVEs">
              <div className="flex flex-wrap gap-1">
                {node.cve.map((c) => (
                  <span key={c} className="font-mono text-[10px] px-1.5 py-0.5 bg-red-900/30 text-red-300 border border-red-800/50 rounded">
                    {c}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Vulnerability */}
          {vuln && (
            <Section title="Risk Analysis">
              <p className="text-[12px] text-[#94a3b8] leading-relaxed">{vuln.reason}</p>
              {vuln.explanation && vuln.explanation !== vuln.reason && (
                <p className="text-[11px] text-[#64748b] leading-relaxed mt-2">{vuln.explanation}</p>
              )}
              <div className="flex gap-3 mt-2 text-[11px] text-[#64748b]">
                <span>In: {vuln.connections.in}</span>
                <span>Out: {vuln.connections.out}</span>
              </div>
            </Section>
          )}

          {/* Simulate */}
          <Section title="Simulate Removal">
            <p className="text-[11px] text-[#64748b] mb-2">
              Count attack paths blocked if this node is hardened.
            </p>
            <button
              onClick={() => simulate(node.id)}
              disabled={loading['simulate']}
              className="w-full py-1.5 text-xs font-mono border border-[#1e1e2e] text-[#94a3b8] hover:border-[#7c3aed] hover:text-[#e2e8f0] rounded transition-colors disabled:opacity-40"
            >
              {loading['simulate'] ? 'Running...' : 'Simulate Removal'}
            </button>

            {errors['simulate'] && (
              <p className="text-[11px] text-red-400 mt-2">{errors['simulate']}</p>
            )}

            {simulateResult && (
              <div className="mt-3 p-2 rounded bg-[#111118] border border-[#1e1e2e] space-y-1.5">
                <SimRow label="Total paths"    value={simulateResult.results.baselinePathCount} />
                <SimRow label="After removal"  value={simulateResult.results.filteredPathCount} />
                <SimRow
                  label="Eliminated"
                  value={simulateResult.results.pathsEliminated}
                  highlight={simulateResult.results.pathsEliminated > 0}
                />
                <SimRow label="Reduction"      value={`${simulateResult.results.reductionPercent}%`} />
                <div className="pt-1 text-[11px] font-mono border-t border-[#1e1e2e]"
                  style={{ color: simulateResult.results.reductionPercent >= 50 ? '#ef4444' : simulateResult.results.pathsEliminated > 0 ? '#f59e0b' : '#64748b' }}>
                  {simulateResult.results.verdict}
                </div>
              </div>
            )}
          </Section>
        </div>
      </aside>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-[#64748b] mb-0.5">{label}</div>
      {children}
    </div>
  );
}

function Tag({ label, color }: { label: string; color: 'blue' | 'amber' | 'purple' }) {
  const c = color === 'blue' ? 'bg-blue-900/40 text-blue-300 border-blue-800'
    : color === 'amber' ? 'bg-amber-900/40 text-amber-300 border-amber-800'
    : 'bg-purple-900/40 text-purple-300 border-purple-800';
  return <span className={`text-[10px] px-1.5 py-0.5 border rounded font-mono ${c}`}>{label}</span>;
}

function SimRow({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[11px] text-[#64748b]">{label}</span>
      <span className={`text-[11px] font-mono ${highlight ? 'text-red-400' : 'text-[#94a3b8]'}`}>{value}</span>
    </div>
  );
}
