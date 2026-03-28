import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface K8sNodeData {
  label: string;
  nodeType: string;
  riskScore: number;
  isEntryPoint: boolean;
  isCrownJewel: boolean;
  hasCve: boolean;
  highlighted: boolean;
  dimmed: boolean;
  isCritical: boolean;
  [key: string]: unknown;
}

const TYPE_COLORS: Record<string, { border: string }> = {
  Pod:            { border: '#3B82F6' },
  ServiceAccount: { border: '#A855F7' },
  ClusterRole:    { border: '#EC4899' },
  Role:           { border: '#EC4899' },
  Namespace:      { border: '#22C55E' },
  Secret:         { border: '#FFA726' },
  Node:           { border: '#555555' },
};

function getBorderColor(type: string, riskScore: number, highlighted: boolean, isCritical: boolean): string {
  if (highlighted) return '#FF6A00';
  if (isCritical)  return '#FFA726';
  if (riskScore >= 8) return '#FF3B3B';
  if (riskScore >= 5) return '#FFA726';
  return (TYPE_COLORS[type] ?? { border: '#1F1F1F' }).border;
}

export const CustomNode = memo(({ data }: NodeProps) => {
  const d = data as K8sNodeData;
  const borderColor = getBorderColor(d.nodeType, d.riskScore, d.highlighted, d.isCritical);

  const glowColor = d.highlighted
    ? '#FF6A0030'
    : d.isCritical
    ? '#FFA72630'
    : d.riskScore >= 8
    ? '#FF3B3B20'
    : 'transparent';

  return (
    <div
      style={{
        background: '#121212',
        border: `1.5px solid ${borderColor}`,
        borderRadius: 6,
        minWidth: 164,
        maxWidth: 200,
        padding: '7px 10px',
        opacity: d.dimmed ? 0.2 : 1,
        boxShadow: glowColor !== 'transparent' ? `0 0 0 2px ${glowColor}, 0 0 12px ${glowColor}` : 'none',
        transition: 'opacity 0.2s, box-shadow 0.2s, border-color 0.2s',
        position: 'relative',
      }}
    >
      <Handle type="target" position={Position.Left}  style={{ background: borderColor, width: 5, height: 5, border: 'none' }} />
      <Handle type="source" position={Position.Right} style={{ background: borderColor, width: 5, height: 5, border: 'none' }} />

      {/* CVE dot */}
      {d.hasCve && (
        <span
          title="Has CVEs"
          style={{
            position: 'absolute', top: 5, right: 5,
            width: 5, height: 5, borderRadius: '50%',
            background: '#FF3B3B',
          }}
        />
      )}

      {/* Type badge */}
      <div style={{ fontSize: 9, color: borderColor, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3, opacity: 0.9 }}>
        {d.isEntryPoint ? '⤳ ' : ''}{d.isCrownJewel ? '★ ' : ''}{d.nodeType}
      </div>

      {/* Label */}
      <div style={{ fontSize: 11, color: '#EAEAEA', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {d.label}
      </div>

      {/* Risk score */}
      {d.riskScore > 0 && (
        <div style={{
          fontSize: 9,
          marginTop: 3,
          fontFamily: 'monospace',
          color: d.riskScore >= 8 ? '#FF3B3B' : d.riskScore >= 5 ? '#FFA726' : '#4CAF50',
        }}>
          risk {d.riskScore.toFixed(1)}
        </div>
      )}
    </div>
  );
});

CustomNode.displayName = 'CustomNode';
