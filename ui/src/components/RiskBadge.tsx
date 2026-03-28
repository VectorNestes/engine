interface Props {
  score: number;
  size?: 'sm' | 'md';
}

export function RiskBadge({ score, size = 'md' }: Props) {
  const color =
    score >= 8 ? 'bg-red-900/60 text-red-300 border-red-800'
    : score >= 5 ? 'bg-amber-900/60 text-amber-300 border-amber-800'
    : 'bg-green-900/60 text-green-300 border-green-800';

  const label =
    score >= 8 ? 'CRITICAL'
    : score >= 5 ? 'HIGH'
    : 'MEDIUM';

  const px = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono border rounded ${px} ${color}`}>
      <span>{score.toFixed(1)}</span>
      <span className="opacity-70">{label}</span>
    </span>
  );
}
