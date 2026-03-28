import { useAppStore } from '../store/useAppStore';

type View = 'overview' | 'paths' | 'vulnerabilities' | 'critical' | 'report';

const NAV: { id: View; label: string; icon: string }[] = [
  { id: 'overview',        label: 'Overview',        icon: '⬡' },
  { id: 'paths',           label: 'Attack Paths',    icon: '⤳' },
  { id: 'vulnerabilities', label: 'Vulnerabilities', icon: '⚠' },
  { id: 'critical',        label: 'Critical Node',   icon: '◉' },
  { id: 'report',          label: 'Report',          icon: '≡' },
];

export function Sidebar() {
  const { activeView, setView, graphMeta, vulnSummary } = useAppStore();

  return (
    <aside
      style={{ width: 192, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#0B0B0B', borderRight: '1px solid #1F1F1F' }}
    >
      {/* Logo */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid #1F1F1F' }}>
        <div style={{ fontSize: 14, fontFamily: 'monospace', color: '#FF6A00', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }}>
          K8s-AV
        </div>
        <div style={{ fontSize: 12, color: '#888888', marginTop: 3 }}>Attack Path Visualizer</div>
      </div>

      {/* Section label */}
      <div style={{ padding: '16px 16px 8px', fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        Navigation
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px' }}>
        {NAV.map(({ id, label, icon }) => {
          const active = activeView === id;
          return (
            <button
              key={id}
              onClick={() => setView(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 10px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
                textAlign: 'left',
                transition: 'all 0.15s',
                background: active ? '#FF6A0012' : 'transparent',
                color: active ? '#FF6A00' : '#888888',
                fontWeight: active ? 500 : 400,
                boxShadow: active ? 'inset 2px 0 0 #FF6A00' : 'none',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = '#FFFFFF08';
                  (e.currentTarget as HTMLElement).style.color = '#EAEAEA';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = '#888888';
                }
              }}
            >
              <span style={{ fontSize: 16, width: 16, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Stats footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #1F1F1F', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 2 }}>
          Cluster Stats
        </div>
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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: '#555555' }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: 'monospace', color: danger ? '#FF3B3B' : '#888888' }}>{value}</span>
    </div>
  );
}
