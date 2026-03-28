import { useAppStore } from '../store/useAppStore';
import { RiskBadge } from '../components/RiskBadge';

export function CriticalNodeView() {
  const { criticalData, simulateResult, loading, errors, selectNode, simulate } = useAppStore();

  const top  = criticalData?.criticalNodes?.[0] ?? null;
  const elim = criticalData?.pathElimination ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Info panel — full height */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>

        {loading['critical'] && (
          <div style={{ height: 100, borderRadius: 12, background: '#121212', animation: 'pulse 1.5s ease infinite' }} />
        )}

        {errors['critical'] && (
          <div style={{ padding: '8px 12px', borderLeft: '2px solid #FF3B3B', background: '#FF3B3B10', color: '#FF3B3B', fontSize: 12 }}>
            {errors['critical']}
          </div>
        )}

        {!loading['critical'] && !top && !errors['critical'] && (
          <div style={{ textAlign: 'center', padding: 16, fontSize: 12, color: '#555555' }}>No data. Run ingest first.</div>
        )}

        {top && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>

            {/* Node info */}
            <div style={{ flex: 1, minWidth: 200, padding: 14, background: '#121212', border: '1px solid #1F1F1F', borderTop: '2px solid #FF6A00', borderRadius: 12 }}>
              <div style={{ fontSize: 9, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>
                Critical Node
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <RiskBadge score={top.riskScore} size="sm" />
              </div>
              <div
                onClick={() => selectNode(top.nodeId)}
                style={{ fontFamily: 'monospace', fontSize: 13, color: '#EAEAEA', cursor: 'pointer', transition: 'color 0.15s' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#FF6A00')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#EAEAEA')}
              >
                {top.name || top.nodeId}
              </div>
              <div style={{ fontSize: 11, color: '#555555', marginTop: 3 }}>{top.type} · {top.namespace}</div>
              <div style={{ fontSize: 11, color: '#555555', marginTop: 8 }}>
                Betweenness:{' '}
                <span style={{ fontFamily: 'monospace', color: '#888888' }}>{top.betweennessScore.toFixed(2)}</span>
              </div>
            </div>

            {/* Path elimination */}
            {elim && (
              <div style={{ flex: 1, minWidth: 180, padding: 14, background: '#121212', border: '1px solid #1F1F1F', borderRadius: 12 }}>
                <div style={{ fontSize: 9, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
                  Path Elimination
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <ERow label="Total paths"   value={elim.totalPaths} />
                  <ERow label="Paths blocked" value={elim.pathsEliminated} highlight={elim.pathsEliminated > 0} />
                  <ERow label="Paths remain"  value={elim.pathsRemaining} />
                  <ERow label="Reduction"     value={`${elim.reductionPercent}%`} />
                </div>
              </div>
            )}

            {/* Simulate */}
            <div style={{ flex: 1, minWidth: 180, padding: 14, background: '#121212', border: '1px solid #1F1F1F', borderRadius: 12 }}>
              <div style={{ fontSize: 9, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
                Simulate Removal
              </div>
              <button
                onClick={() => simulate(top.nodeId)}
                disabled={loading['simulate']}
                style={{
                  width: '100%',
                  padding: '8px 0',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  background: 'transparent',
                  border: '1px solid #1F1F1F',
                  borderRadius: 8,
                  color: '#888888',
                  cursor: loading['simulate'] ? 'not-allowed' : 'pointer',
                  opacity: loading['simulate'] ? 0.4 : 1,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!loading['simulate']) {
                    (e.currentTarget as HTMLElement).style.borderColor = '#FF6A00';
                    (e.currentTarget as HTMLElement).style.color = '#FF6A00';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = '#1F1F1F';
                  (e.currentTarget as HTMLElement).style.color = '#888888';
                }}
              >
                {loading['simulate'] ? 'Running...' : 'Simulate'}
              </button>

              {errors['simulate'] && (
                <p style={{ fontSize: 11, color: '#FF3B3B', marginTop: 8 }}>{errors['simulate']}</p>
              )}

              {simulateResult && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <ERow label="Before" value={simulateResult.results.baselinePathCount} />
                  <ERow label="After"  value={simulateResult.results.filteredPathCount} />
                  <ERow
                    label="Impact"
                    value={`−${simulateResult.results.pathsEliminated} (${simulateResult.results.reductionPercent}%)`}
                    highlight={simulateResult.results.pathsEliminated > 0}
                  />
                  <div style={{
                    fontSize: 10,
                    fontFamily: 'monospace',
                    paddingTop: 6,
                    borderTop: '1px solid #1F1F1F',
                    color: simulateResult.results.reductionPercent >= 50
                      ? '#FF3B3B'
                      : simulateResult.results.pathsEliminated > 0
                      ? '#FFA726'
                      : '#555555',
                  }}>
                    {simulateResult.results.verdict}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

function ERow({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: '#555555' }}>{label}</span>
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: highlight ? '#FF3B3B' : '#888888' }}>{value}</span>
    </div>
  );
}
