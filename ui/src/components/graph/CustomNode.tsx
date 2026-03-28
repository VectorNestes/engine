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

const TYPE_COLORS: Record<string, { bg: string; border: string }> = {
  Pod:            { bg: '#1e3a5f', border: '#3b82f6' },
  ServiceAccount: { bg: '#2d1b4e', border: '#7c3aed' },
  ClusterRole:    { bg: '#4a1942', border: '#ec4899' },
  Role:           { bg: '#4a1942', border: '#ec4899' },
  Namespace:      { bg: '#1a2e1a', border: '#22c55e' },
  Secret:         { bg: '#3b2000', border: '#f59e0b' },
  Node:           { bg: '#1a1a2e', border: '#64748b' },
};

function getColors(type: string, riskScore: number, highlighted: boolean) {
  if (highlighted) return { bg: '#1e1a2e', border: '#7c3aed' };
  const base = TYPE_COLORS[type] ?? { bg: '#111118', border: '#1e1e2e' };
  if (riskScore >= 8) return { ...base, border: '#ef4444' };
  if (riskScore >= 5) return { ...base, border: '#f59e0b' };
  return base;
}

export const CustomNode = memo(({ data }: NodeProps) => {
  const d = data as K8sNodeData;
  const { bg, border } = getColors(d.nodeType, d.riskScore, d.highlighted);

  return (
    <div
      style={{
        background: bg,
        border: `1.5px solid ${d.isCritical ? '#f59e0b' : border}`,
        borderRadius: 6,
        minWidth: 160,
        maxWidth: 200,
        padding: '6px 10px',
        opacity: d.dimmed ? 0.25 : 1,
        outline: d.isCritical ? '2px solid #f59e0b55' : 'none',
        outlineOffset: 2,
        transition: 'opacity 0.2s, border-color 0.2s',
        position: 'relative',
      }}
    >
      <Handle type="target" position={Position.Left}  style={{ background: border, width: 6, height: 6 }} />
      <Handle type="source" position={Position.Right} style={{ background: border, width: 6, height: 6 }} />

      {/* CVE dot */}
      {d.hasCve && (
        <span
          title="Has CVEs"
          style={{
            position: 'absolute', top: 4, right: 4,
            width: 6, height: 6, borderRadius: '50%',
            background: '#ef4444',
          }}
        />
      )}

      {/* Type badge */}
      <div style={{ fontSize: 9, color: border, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
        {d.isEntryPoint ? '⤳ ' : ''}{d.isCrownJewel ? '★ ' : ''}{d.nodeType}
      </div>

      {/* ID */}
      <div style={{ fontSize: 11, color: '#e2e8f0', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {d.label}
      </div>

      {/* Risk score */}
      {d.riskScore > 0 && (
        <div style={{ fontSize: 9, color: d.riskScore >= 8 ? '#ef4444' : d.riskScore >= 5 ? '#f59e0b' : '#22c55e', marginTop: 2, fontFamily: 'monospace' }}>
          risk {d.riskScore.toFixed(1)}
        </div>
      )}
    </div>
  );
});

CustomNode.displayName = 'CustomNode';
