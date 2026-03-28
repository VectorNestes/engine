interface Props {
  score: number;
  size?: 'sm' | 'md';
}

export function RiskBadge({ score, size = 'md' }: Props) {
  const isCritical = score >= 8;
  const isHigh     = score >= 5;

  const color  = isCritical ? '#FF3B3B' : isHigh ? '#FFA726' : '#4CAF50';
  const bg     = isCritical ? '#FF3B3B15' : isHigh ? '#FFA72615' : '#4CAF5015';
  const border = isCritical ? '#FF3B3B35' : isHigh ? '#FFA72635' : '#4CAF5035';
  const label  = isCritical ? 'CRITICAL' : isHigh ? 'HIGH' : 'MEDIUM';

  const pad   = size === 'sm' ? '1px 6px' : '3px 10px';
  const fsize = size === 'sm' ? 9 : 10;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: fsize,
        fontFamily: 'monospace',
        padding: pad,
        background: bg,
        color,
        border: `1px solid ${border}`,
        borderRadius: 4,
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {score.toFixed(1)} <span style={{ opacity: 0.75 }}>{label}</span>
    </span>
  );
}
