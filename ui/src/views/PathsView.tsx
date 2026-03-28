import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';

export function PathsView() {
  const { paths, pathsSummary, selectedPathIdx, selectPath, loading, errors, graphEdges } = useAppStore();

  const selectedPath = selectedPathIdx !== null ? paths[selectedPathIdx] : null;

  const { highlightedNodes, highlightedEdges } = useMemo(() => {
    if (!selectedPath) return { highlightedNodes: new Set<string>(), highlightedEdges: new Set<string>() };

    const nodeSet = new Set(selectedPath.nodes);
    const edgeSet = new Set<string>();

    for (let i = 0; i < selectedPath.nodes.length - 1; i++) {
      edgeSet.add(`${selectedPath.nodes[i]}-${selectedPath.nodes[i + 1]}`);
    }

    graphEdges.forEach((e, idx) => {
      if (nodeSet.has(e.from) && nodeSet.has(e.to)) {
        edgeSet.add(`${e.from}-${e.to}-${idx}`);
      }
    });

    return { highlightedNodes: nodeSet, highlightedEdges: edgeSet };
  }, [selectedPath, graphEdges]);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#0B0B0B',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid #1F1F1F', flexShrink: 0 }}>
          <div style={{ fontSize: 14, color: '#EAEAEA', fontWeight: 500, marginBottom: 6 }}>Attack Paths</div>
          {pathsSummary && (
            <div style={{ display: 'flex', gap: 16 }}>
              <Stat label="Total"    value={String(pathsSummary.total)} />
              {pathsSummary.critical > 0 && (
                <Stat label="Critical" value={String(pathsSummary.critical)} danger />
              )}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 0, maxWidth: 900, width: '100%', alignSelf: 'center', boxSizing: 'border-box' }}>

          {loading['paths'] && Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ height: 180, borderRadius: 16, background: '#121212', animation: 'pulse 1.5s ease infinite' }} />
          ))}

          {errors['paths'] && (
            <div style={{ padding: '8px 12px', borderLeft: '2px solid #FF3B3B', background: '#FF3B3B10', color: '#FF3B3B', fontSize: 12, borderRadius: 4 }}>
              {errors['paths']}
            </div>
          )}

          {!loading['paths'] && paths.length === 0 && !errors['paths'] && (
            <div style={{ textAlign: 'center', padding: 40, fontSize: 12, color: '#555555' }}>No attack paths found.</div>
          )}

          {paths.map((path, idx) => {
            const active    = selectedPathIdx === idx;
            const isCrit    = path.riskScore >= 8;
            const isHigh    = path.riskScore >= 5;
            const riskColor = isCrit ? '#FF3B3B' : isHigh ? '#FF6A00' : '#4CAF50';
            const riskLabel = isCrit ? 'CRITICAL' : isHigh ? 'HIGH' : 'MEDIUM';

            return (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column' }}>
                <button
                  onClick={() => selectPath(active ? null : idx)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: 0, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                >
                  <PathCard
                    index={idx}
                    nodes={path.nodes}
                    description={path.description}
                    riskScore={path.riskScore}
                    riskColor={riskColor}
                    riskLabel={riskLabel}
                    active={active}
                  />
                </button>
                {idx < paths.length - 1 && (
                  <div style={{ position: 'relative', height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{
                      width: '60%',
                      height: 1,
                      background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)',
                      boxShadow: '0 0 6px 1px rgba(255,255,255,0.08)',
                    }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

interface PathCardProps {
  index: number;
  nodes: string[];
  description: string;
  riskScore: number;
  riskColor: string;
  riskLabel: string;
  active: boolean;
}

function PathCard({ index, nodes, description, riskScore, riskColor, riskLabel, active }: PathCardProps) {
  const COLS   = 3;
  const chunks: string[][] = [];
  for (let i = 0; i < nodes.length; i += COLS) {
    chunks.push(nodes.slice(i, i + COLS));
  }

  return (
    <div
      style={{
        background: '#131318',
        border: `1px solid ${active ? '#FF6A00' : '#242428'}`,
        borderLeft: `3px solid ${active ? '#FF6A00' : '#333338'}`,
        borderRadius: 16,
        padding: '16px 18px',
        transition: 'all 0.15s',
        boxShadow: active
          ? '0 0 0 1px #FF6A0015, 0 8px 32px #00000060'
          : '0 2px 12px #00000040',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.borderColor = '#2e2e35';
          (e.currentTarget as HTMLElement).style.borderLeftColor = '#FF6A0050';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.borderColor = '#242428';
          (e.currentTarget as HTMLElement).style.borderLeftColor = '#333338';
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{
          fontSize: 10,
          fontFamily: 'monospace',
          letterSpacing: '0.14em',
          color: active ? '#FF6A00' : '#444450',
          fontWeight: 600,
        }}>
          PATH {String(index + 1).padStart(2, '0')}
        </span>

        <span style={{
          fontSize: 10,
          fontFamily: 'monospace',
          fontWeight: 700,
          letterSpacing: '0.06em',
          color: riskColor,
          background: `${riskColor}18`,
          border: `1.5px solid ${riskColor}`,
          borderRadius: 6,
          padding: '3px 10px',
        }}>
          {riskScore.toFixed(1)} {riskLabel}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {chunks.map((chunk, rowIdx) => {
          const globalOffset = rowIdx * COLS;
          return (
            <div key={rowIdx} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
              {chunk.map((n, colIdx) => {
                const globalIdx = globalOffset + colIdx;
                const isFirst   = globalIdx === 0;
                const isLast    = globalIdx === nodes.length - 1;
                const isArrow   = colIdx < chunk.length - 1 || (rowIdx < chunks.length - 1 && colIdx === chunk.length - 1);

                let chipBg     = '#1e1e26';
                let chipBorder = '#2e2e3a';
                let chipColor  = '#9090a0';

                if (isFirst) {
                  chipBg     = '#0e2040';
                  chipBorder = '#1d4ed8';
                  chipColor  = '#60A5FA';
                } else if (isLast) {
                  chipBg     = '#280e0e';
                  chipBorder = '#991b1b';
                  chipColor  = '#F87171';
                } else if (active) {
                  chipBg     = '#1a1520';
                  chipBorder = '#FF6A0035';
                  chipColor  = '#c0a090';
                }

                return (
                  <div key={colIdx} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 12,
                        fontWeight: isFirst || isLast ? 600 : 400,
                        color: chipColor,
                        background: chipBg,
                        border: `1.5px solid ${chipBorder}`,
                        borderRadius: 8,
                        padding: '6px 12px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 148,
                        display: 'block',
                        boxShadow: isFirst
                          ? '0 0 10px #1d4ed820'
                          : isLast
                          ? '0 0 10px #99000020'
                          : 'none',
                      }}
                      title={n}
                    >
                      {n.split(':').pop()}
                    </span>

                    {isArrow && (
                      <span style={{
                        fontSize: 13,
                        color: '#2a5a6a',
                        flexShrink: 0,
                        fontWeight: 300,
                      }}>
                        →
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div style={{
        height: 1,
        background: 'linear-gradient(90deg, #1a6070, #0a2a35 80%, transparent)',
        marginBottom: 14,
        borderRadius: 1,
      }} />

      <p style={{
        margin: 0,
        fontSize: 12,
        color: active ? '#7a8a95' : '#4a5a60',
        lineHeight: 1.7,
        fontFamily: 'system-ui, sans-serif',
      }}>
        {description}
      </p>
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <span style={{ fontSize: 13, color: '#555555' }}>
      {label}{' '}
      <span style={{ fontFamily: 'monospace', color: danger ? '#FF3B3B' : '#888888', fontWeight: 500 }}>{value}</span>
    </span>
  );
}
