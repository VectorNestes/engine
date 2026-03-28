import { useAppStore } from '../store/useAppStore';
import { GraphCanvas } from '../components/graph/GraphCanvas';

export function OverviewView() {
  const { graphMeta, vulnSummary, loading, errors } = useAppStore();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Summary cards */}
      {(graphMeta || loading['graph']) && (
        <div style={{ flexShrink: 0, display: 'flex', gap: 10, padding: '14px 16px', borderBottom: '1px solid #1F1F1F' }}>
          {loading['graph']
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ height: 72, width: 120, borderRadius: 12, background: '#121212', animation: 'pulse 1.5s ease infinite' }} />
              ))
            : graphMeta && (
                <>
                  <StatCard label="Nodes"         value={graphMeta.totalNodes} />
                  <StatCard label="Edges"          value={graphMeta.totalEdges} />
                  <StatCard label="Entry Points"   value={graphMeta.entryPoints}  accent="blue" />
                  <StatCard label="Crown Jewels"   value={graphMeta.crownJewels}  accent="orange" />
                  {vulnSummary && (
                    <StatCard
                      label="Vulnerabilities"
                      value={vulnSummary.total}
                      accent={vulnSummary.critical > 0 ? 'red' : undefined}
                    />
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
        <div style={{ flexShrink: 0, margin: '12px 16px 0', padding: '8px 12px', borderLeft: '2px solid #FF3B3B', background: '#FF3B3B10', color: '#FF3B3B', fontSize: 12 }}>
          {errors['graph']}
        </div>
      )}

      {/* Graph container */}
      <div style={{ flex: 1, minHeight: 0, padding: 12, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0, background: '#121212', border: '1px solid #1F1F1F', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <GraphCanvas />
        </div>
      </div>
    </div>
  );
}

type Accent = 'red' | 'blue' | 'orange' | undefined;

function StatCard({ label, value, accent }: { label: string; value: number; accent?: Accent }) {
  const color = accent === 'red' ? '#FF3B3B' : accent === 'blue' ? '#60A5FA' : accent === 'orange' ? '#FF6A00' : '#EAEAEA';
  const borderTop = accent ? `2px solid ${color}` : '2px solid #1F1F1F';

  return (
    <div
      style={{
        minWidth: 100,
        padding: '12px 14px',
        background: '#121212',
        border: '1px solid #1F1F1F',
        borderTop,
        borderRadius: 12,
      }}
    >
      <div style={{ fontSize: 9, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontFamily: 'monospace', fontWeight: 600, color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}
