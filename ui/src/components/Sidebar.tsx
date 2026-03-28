import { useAppStore } from '../store/useAppStore';

type View = 'overview' | 'paths' | 'vulnerabilities' | 'critical' | 'report';

const NAV: { id: View; label: string; icon: string }[] = [
  { id: 'overview',        label: 'Overview',       icon: '⬡' },
  { id: 'paths',           label: 'Attack Paths',   icon: '⤳' },
  { id: 'vulnerabilities', label: 'Vulnerabilities',icon: '⚠' },
  { id: 'critical',        label: 'Critical Node',  icon: '◉' },
  { id: 'report',          label: 'Report',         icon: '≡' },
];

export function Sidebar() {
  const { activeView, setView, graphMeta, vulnSummary } = useAppStore();

  return (
    <aside className="w-[168px] shrink-0 flex flex-col border-r border-[#1e1e2e] bg-[#0d0d14]">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-[#1e1e2e]">
        <div className="text-[11px] font-mono text-[#7c3aed] tracking-widest uppercase">K8s-AV</div>
        <div className="text-[10px] text-[#64748b] mt-0.5">Attack Path Visualizer</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3">
        {NAV.map(({ id, label, icon }) => {
          const active = activeView === id;
          return (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-[13px] transition-colors
                ${active
                  ? 'border-l-2 border-[#7c3aed] text-[#e2e8f0] bg-[#7c3aed]/5'
                  : 'border-l-2 border-transparent text-[#64748b] hover:text-[#94a3b8] hover:bg-white/[0.02]'
                }`}
            >
              <span className="text-[15px] w-4 text-center shrink-0">{icon}</span>
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Stats footer */}
      <div className="px-4 py-3 border-t border-[#1e1e2e] space-y-1.5">
        {graphMeta && (
          <>
            <StatRow label="Nodes"  value={graphMeta.totalNodes} />
            <StatRow label="Edges"  value={graphMeta.totalEdges} />
          </>
        )}
        {vulnSummary && (
          <StatRow
            label="Vulns"
            value={vulnSummary.total}
            danger={vulnSummary.critical > 0}
          />
        )}
      </div>
    </aside>
  );
}

function StatRow({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[#64748b]">{label}</span>
      <span className={`text-[11px] font-mono ${danger ? 'text-red-400' : 'text-[#94a3b8]'}`}>
        {value}
      </span>
    </div>
  );
}
