import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { GraphCanvas } from '../components/graph/GraphCanvas';
import { RiskBadge } from '../components/RiskBadge';

export function PathsView() {
  const { paths, pathsSummary, selectedPathIdx, selectPath, loading, errors, graphEdges } = useAppStore();

  const selectedPath = selectedPathIdx !== null ? paths[selectedPathIdx] : null;

  // Build sets of highlighted node/edge IDs for the selected path
  const { highlightedNodes, highlightedEdges } = useMemo(() => {
    if (!selectedPath) return { highlightedNodes: new Set<string>(), highlightedEdges: new Set<string>() };

    const nodeSet = new Set(selectedPath.nodes);
    const edgeSet = new Set<string>();

    for (let i = 0; i < selectedPath.nodes.length - 1; i++) {
      edgeSet.add(`${selectedPath.nodes[i]}-${selectedPath.nodes[i + 1]}`);
    }

    // Also match by index since edge IDs include an index
    graphEdges.forEach((e, idx) => {
      if (nodeSet.has(e.from) && nodeSet.has(e.to)) {
        edgeSet.add(`${e.from}-${e.to}-${idx}`);
      }
    });

    return { highlightedNodes: nodeSet, highlightedEdges: edgeSet };
  }, [selectedPath, graphEdges]);

  return (
    <div className="flex flex-col h-full">
      {/* Path list */}
      <div className="shrink-0 border-b border-[#1e1e2e]" style={{ maxHeight: '220px', overflowY: 'auto' }}>
        {loading['paths'] && (
          <div className="p-3 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded bg-[#111118] animate-pulse" />
            ))}
          </div>
        )}

        {errors['paths'] && (
          <div className="m-3 px-3 py-2 border-l-2 border-red-500 bg-red-900/10 text-red-400 text-xs">
            {errors['paths']}
          </div>
        )}

        {!loading['paths'] && paths.length === 0 && !errors['paths'] && (
          <div className="p-4 text-[#64748b] text-xs text-center">No attack paths found.</div>
        )}

        {pathsSummary && (
          <div className="flex gap-4 px-3 py-2 border-b border-[#1e1e2e] text-[11px] text-[#64748b]">
            <span>Total: <span className="text-[#94a3b8]">{pathsSummary.total}</span></span>
            {pathsSummary.critical > 0 && (
              <span>Critical: <span className="text-red-400">{pathsSummary.critical}</span></span>
            )}
          </div>
        )}

        {paths.map((path, idx) => (
          <button
            key={idx}
            onClick={() => selectPath(selectedPathIdx === idx ? null : idx)}
            className={`w-full text-left px-3 py-2.5 border-b border-[#1e1e2e] transition-colors ${
              selectedPathIdx === idx ? 'bg-[#7c3aed]/10 border-l-2 border-l-[#7c3aed]' : 'hover:bg-white/[0.02]'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#64748b] overflow-hidden">
                {path.nodes.map((n, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="text-[#94a3b8] truncate" style={{ maxWidth: 80 }}>{n.split(':').pop()}</span>
                    {i < path.nodes.length - 1 && <span className="text-[#3a3a4e] shrink-0">→</span>}
                  </span>
                ))}
              </div>
              <RiskBadge score={path.riskScore} size="sm" />
            </div>
            <div className="text-[11px] text-[#64748b] line-clamp-2">{path.description}</div>
          </button>
        ))}
      </div>

      {/* Graph */}
      <GraphCanvas
        highlightedNodeIds={highlightedNodes}
        highlightedEdgeKeys={highlightedEdges}
      />
    </div>
  );
}
