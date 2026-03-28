import { useAppStore } from '../store/useAppStore';
import { RiskBadge } from '../components/RiskBadge';

export function CriticalNodeView() {
  const { criticalData, simulateResult, loading, errors, selectNode, simulate } = useAppStore();

  const top  = criticalData?.criticalNodes?.[0] ?? null;
  const elim = criticalData?.pathElimination ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

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
          <div style={{ background: '#121212', border: '1px solid #1F1F1F', borderTop: '2px solid #FF6A00', borderRadius: 12, overflow: 'hidden' }}>

            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1F1F1F' }}>
              <div style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>
                Critical Node
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <RiskBadge score={top.riskScore} size="sm" />
              </div>
              <div
                onClick={() => selectNode(top.nodeId)}
                style={{ fontFamily: 'monospace', fontSize: 15, color: '#EAEAEA', cursor: 'pointer', transition: 'color 0.15s' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#FF6A00')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#EAEAEA')}
              >
                {top.name || top.nodeId}
              </div>
              <div style={{ fontSize: 13, color: '#555555', marginTop: 3 }}>{top.type} · {top.namespace}</div>
              <div style={{ fontSize: 13, color: '#555555', marginTop: 8 }}>
                Betweenness:{' '}
                <span style={{ fontFamily: 'monospace', color: '#888888' }}>{top.betweennessScore.toFixed(2)}</span>
              </div>
            </div>

            {elim && (
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #1F1F1F' }}>
                <div style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
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

            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
                Simulate Removal
              </div>
              <button
                onClick={() => simulate(top.nodeId)}
                disabled={loading['simulate']}
                style={{
                  width: '100%',
                  padding: '10px 0',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  background: loading['simulate'] ? '#FF6A0010' : '#FF6A0022',
                  border: '1px solid #FF6A0055',
                  borderRadius: 8,
                  color: '#FF6A00',
                  cursor: loading['simulate'] ? 'not-allowed' : 'pointer',
                  opacity: loading['simulate'] ? 0.5 : 1,
                  transition: 'all 0.15s',
                  boxShadow: '0 0 12px #FF6A0020',
                }}
                onMouseEnter={(e) => {
                  if (!loading['simulate']) {
                    (e.currentTarget as HTMLElement).style.background = '#FF6A0035';
                    (e.currentTarget as HTMLElement).style.borderColor = '#FF6A00AA';
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 0 20px #FF6A0040';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = '#FF6A0022';
                  (e.currentTarget as HTMLElement).style.borderColor = '#FF6A0055';
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 0 12px #FF6A0020';
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
                    fontSize: 12,
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
      <span style={{ fontSize: 13, color: '#555555' }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: 'monospace', color: highlight ? '#FF3B3B' : '#888888' }}>{value}</span>
    </div>
  );
}
