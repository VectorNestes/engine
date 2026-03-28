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
        style={{ position: 'fixed', inset: 0, zIndex: 40 }}
        onClick={() => selectNode(null)}
      />

      {/* Panel */}
      <aside
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          zIndex: 50,
          width: 340,
          display: 'flex',
          flexDirection: 'column',
          background: '#0B0B0B',
          borderLeft: '1px solid #1F1F1F',
          animation: 'panelSlideIn 0.18s ease',
        }}
      >
        <style>{`
          @keyframes panelSlideIn {
            from { transform: translateX(24px); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
        `}</style>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid #1F1F1F' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#FF6A00', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 5 }}>
              {node.type}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#EAEAEA', wordBreak: 'break-all', lineHeight: 1.4 }}>
              {node.name || node.id}
            </div>
            {node.namespace && (
              <div style={{ fontSize: 11, color: '#555555', marginTop: 3 }}>{node.namespace}</div>
            )}
          </div>
          <button
            onClick={() => selectNode(null)}
            style={{ marginLeft: 12, fontSize: 18, color: '#555555', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: 2, flexShrink: 0 }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#EAEAEA')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#555555')}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {node.isEntryPoint && <Tag label="Entry Point" color="blue" />}
            {node.isCrownJewel && <Tag label="Crown Jewel" color="amber" />}
            {vuln && <RiskBadge score={vuln.riskScore} />}
          </div>

          {/* Image */}
          {node.image && (
            <InfoBox>
              <Label>Image</Label>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#888888', wordBreak: 'break-all' }}>{node.image}</span>
            </InfoBox>
          )}

          {/* CVEs */}
          {(node.cve?.length ?? 0) > 0 && (
            <InfoBox>
              <Label>CVEs</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {node.cve.map((c) => (
                  <span
                    key={c}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 10,
                      padding: '2px 6px',
                      background: '#FF3B3B18',
                      color: '#FF3B3B',
                      border: '1px solid #FF3B3B30',
                      borderRadius: 4,
                    }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </InfoBox>
          )}

          {/* Risk Analysis */}
          {vuln && (
            <InfoBox>
              <Label>Risk Analysis</Label>
              <p style={{ fontSize: 12, color: '#888888', lineHeight: 1.6, margin: 0 }}>{vuln.reason}</p>
              {vuln.explanation && vuln.explanation !== vuln.reason && (
                <p style={{ fontSize: 11, color: '#555555', lineHeight: 1.6, margin: '8px 0 0' }}>{vuln.explanation}</p>
              )}
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#555555' }}>
                <span>In: <span style={{ color: '#888888', fontFamily: 'monospace' }}>{vuln.connections.in}</span></span>
                <span>Out: <span style={{ color: '#888888', fontFamily: 'monospace' }}>{vuln.connections.out}</span></span>
              </div>
            </InfoBox>
          )}

          {/* Simulate Removal */}
          <InfoBox>
            <Label>Simulate Removal</Label>
            <p style={{ fontSize: 11, color: '#555555', marginBottom: 10, marginTop: 0 }}>
              Count attack paths blocked if this node is hardened.
            </p>
            <button
              onClick={() => simulate(node.id)}
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
              {loading['simulate'] ? 'Running...' : 'Simulate Removal'}
            </button>

            {errors['simulate'] && (
              <p style={{ fontSize: 11, color: '#FF3B3B', marginTop: 8 }}>{errors['simulate']}</p>
            )}

            {simulateResult && (
              <div style={{ marginTop: 12, padding: 12, background: '#121212', border: '1px solid #1F1F1F', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SimRow label="Total paths"   value={simulateResult.results.baselinePathCount} />
                <SimRow label="After removal" value={simulateResult.results.filteredPathCount} />
                <SimRow label="Eliminated"    value={simulateResult.results.pathsEliminated} highlight={simulateResult.results.pathsEliminated > 0} />
                <SimRow label="Reduction"     value={`${simulateResult.results.reductionPercent}%`} />
                <div style={{
                  paddingTop: 8,
                  borderTop: '1px solid #1F1F1F',
                  fontSize: 11,
                  fontFamily: 'monospace',
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
          </InfoBox>
        </div>
      </aside>
    </>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#121212', border: '1px solid #1F1F1F', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'monospace', marginBottom: 2 }}>
      {children}
    </div>
  );
}

function Tag({ label, color }: { label: string; color: 'blue' | 'amber' | 'orange' }) {
  const styles = {
    blue:   { bg: '#3B82F620', color: '#60A5FA', border: '#3B82F640' },
    amber:  { bg: '#FFA72620', color: '#FFA726',  border: '#FFA72640' },
    orange: { bg: '#FF6A0020', color: '#FF6A00',  border: '#FF6A0040' },
  }[color];

  return (
    <span style={{
      fontSize: 10,
      padding: '2px 8px',
      background: styles.bg,
      color: styles.color,
      border: `1px solid ${styles.border}`,
      borderRadius: 4,
      fontFamily: 'monospace',
    }}>
      {label}
    </span>
  );
}

function SimRow({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: '#555555' }}>{label}</span>
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: highlight ? '#FF3B3B' : '#888888' }}>{value}</span>
    </div>
  );
}
