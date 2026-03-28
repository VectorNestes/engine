import { useAppStore } from '../store/useAppStore';

export function ReportView() {
  const { reportData, loading, errors } = useAppStore();

  const copy = () => {
    if (reportData?.formatted) {
      navigator.clipboard.writeText(reportData.formatted).catch(() => {});
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-[#1e1e2e]">
        <span className="text-[11px] text-[#64748b] uppercase tracking-wider">Attack Report</span>
        {reportData && (
          <button
            onClick={copy}
            className="text-[11px] font-mono text-[#64748b] hover:text-[#e2e8f0] transition-colors px-2 py-1 border border-[#1e1e2e] rounded"
          >
            Copy
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading['report'] && (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-4 rounded bg-[#111118] animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
            ))}
          </div>
        )}

        {errors['report'] && (
          <div className="m-4 px-3 py-2 border-l-2 border-red-500 bg-red-900/10 text-red-400 text-xs">
            {errors['report']}
          </div>
        )}

        {!loading['report'] && !reportData && !errors['report'] && (
          <div className="flex items-center justify-center h-full text-[#64748b] text-sm">
            No report data available.
          </div>
        )}

        {reportData?.formatted && (
          <pre
            className="p-4 text-[12px] font-mono text-[#94a3b8] leading-relaxed whitespace-pre-wrap break-words"
            style={{ fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace' }}
          >
            {reportData.formatted}
          </pre>
        )}
      </div>
    </div>
  );
}
