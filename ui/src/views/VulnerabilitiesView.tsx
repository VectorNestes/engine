import { useAppStore } from '../store/useAppStore';
import { RiskBadge } from '../components/RiskBadge';

function priorityLabel(score: number): { label: string; color: string; bg: string } {
  if (score >= 8) return { label: 'P0', color: '#FF3B3B', bg: '#FF3B3B18' };
  if (score >= 6) return { label: 'P1', color: '#FF6A00', bg: '#FF6A0018' };
  if (score >= 4) return { label: 'P2', color: '#FFA726', bg: '#FFA72618' };
  return                { label: 'P3', color: '#555555', bg: '#55555518' };
}

export function VulnerabilitiesView() {
  const { vulnerabilities, vulnSummary, selectNode, loading, errors } = useAppStore();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Table panel — fills full height */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>

        {/* Summary bar */}
        {vulnSummary && (
          <div style={{ display: 'flex', gap: 20, padding: '10px 16px', borderBottom: '1px solid #1F1F1F' }}>
            <span style={{ fontSize: 13, color: '#555555' }}>
              Total <span style={{ fontFamily: 'monospace', color: '#888888' }}>{vulnSummary.total}</span>
            </span>
            {vulnSummary.critical > 0 && (
              <span style={{ fontSize: 13, color: '#555555' }}>
                Critical <span style={{ fontFamily: 'monospace', color: '#FF3B3B' }}>{vulnSummary.critical}</span>
              </span>
            )}
            {vulnSummary.high > 0 && (
              <span style={{ fontSize: 13, color: '#555555' }}>
                High <span style={{ fontFamily: 'monospace', color: '#FFA726' }}>{vulnSummary.high}</span>
              </span>
            )}
            {vulnSummary.withCves > 0 && (
              <span style={{ fontSize: 13, color: '#555555' }}>
                CVEs <span style={{ fontFamily: 'monospace', color: '#888888' }}>{vulnSummary.withCves}</span>
              </span>
            )}
          </div>
        )}

        {/* Loading */}
        {loading['vulns'] && (
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 40, borderRadius: 8, background: '#121212', animation: 'pulse 1.5s ease infinite' }} />
            ))}
          </div>
        )}

        {/* Error */}
        {errors['vulns'] && (
          <div style={{ margin: 12, padding: '8px 12px', borderLeft: '2px solid #FF3B3B', background: '#FF3B3B10', color: '#FF3B3B', fontSize: 12 }}>
            {errors['vulns']}
          </div>
        )}

        {/* Empty */}
        {!loading['vulns'] && vulnerabilities.length === 0 && !errors['vulns'] && (
          <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#555555' }}>No vulnerabilities above threshold.</div>
        )}

        {/* Table */}
        {vulnerabilities.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1F1F1F' }}>
                {['Node', 'Type', 'Priority', 'Risk', 'CVEs', 'Reason'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vulnerabilities.map((v, i) => {
                const { label, color, bg } = priorityLabel(v.riskScore);
                return (
                  <tr
                    key={v.nodeId}
                    onClick={() => selectNode(v.nodeId)}
                    style={{
                      borderBottom: '1px solid #1F1F1F',
                      background: i % 2 === 0 ? 'transparent' : '#FFFFFF03',
                      cursor: 'pointer',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#FF6A0008')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? 'transparent' : '#FFFFFF03')}
                  >
                    <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 13, color: '#FF6A00', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.nodeId.split(':').pop()}
                    </td>
                    <td style={{ padding: '9px 14px', color: '#888888', fontSize: 13 }}>{v.type}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 600, color, background: bg, padding: '2px 7px', borderRadius: 4, border: `1px solid ${color}30` }}>
                        {label}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <RiskBadge score={v.riskScore} size="sm" />
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {v.cves.length > 0
                          ? v.cves.slice(0, 2).map((c) => (
                              <span key={c} style={{ fontFamily: 'monospace', fontSize: 11, padding: '2px 6px', background: '#FF3B3B15', color: '#FF3B3B', border: '1px solid #FF3B3B30', borderRadius: 3 }}>
                                {c}
                              </span>
                            ))
                          : <span style={{ color: '#333333' }}>—</span>
                        }
                        {v.cves.length > 2 && (
                          <span style={{ fontSize: 12, color: '#555555' }}>+{v.cves.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '9px 14px', color: '#555555', fontSize: 13, maxWidth: 240 }}>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {v.reason}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
