import { useMemo, useCallback } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  type Node, type Edge,
  BackgroundVariant, MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';

import { CustomNode, type K8sNodeData } from './CustomNode';
import { useAppStore } from '../../store/useAppStore';
import type { GraphNode, GraphEdge } from '../../lib/api';

const NODE_W = 180;
const NODE_H = 54;
const nodeTypes = { k8s: CustomNode };

function applyLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 130 });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } };
  });
}

function buildFlowGraph(
  rawNodes: GraphNode[],
  rawEdges: GraphEdge[],
  selectedNodeId: string | null,
  highlightedNodeIds: Set<string>,
  highlightedEdgeIds: Set<string>,
  criticalNodeId: string | null,
  vulnMap: Map<string, number>,
): { nodes: Node[]; edges: Edge[] } {
  const hasHighlight = highlightedNodeIds.size > 0;

  const nodes: Node[] = rawNodes.map((n) => ({
    id: n.id,
    type: 'k8s',
    position: { x: 0, y: 0 },
    data: {
      label:        n.name || n.id,
      nodeType:     n.type,
      riskScore:    n.riskScore,
      isEntryPoint: n.isEntryPoint,
      isCrownJewel: n.isCrownJewel,
      hasCve:       (n.cve?.length ?? 0) > 0,
      highlighted:  highlightedNodeIds.has(n.id),
      dimmed:       hasHighlight && !highlightedNodeIds.has(n.id) && n.id !== selectedNodeId,
      isCritical:   n.id === criticalNodeId,
      vuln:         vulnMap.get(n.id) ?? null,
    } satisfies K8sNodeData,
  }));

  const edges: Edge[] = rawEdges.map((e, i) => {
    const edgeId = `${e.from}-${e.to}-${i}`;
    const isHighlighted = highlightedEdgeIds.has(edgeId) || highlightedEdgeIds.has(`${e.from}-${e.to}`);
    return {
      id: edgeId,
      source: e.from,
      target: e.to,
      label: e.type,
      animated: isHighlighted,
      style: {
        stroke: isHighlighted ? '#FF6A00' : '#2a2a2a',
        strokeWidth: isHighlighted ? 2 : 1,
        opacity: hasHighlight && !isHighlighted ? 0.1 : 0.6,
        strokeDasharray: isHighlighted ? '6 3' : undefined,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isHighlighted ? '#FF6A00' : '#2a2a2a',
      },
      labelStyle: { fill: '#555555', fontSize: 9 },
      labelBgStyle: { fill: '#0B0B0B' },
    };
  });

  return { nodes: applyLayout(nodes, edges), edges };
}

interface Props {
  highlightedNodeIds?: Set<string>;
  highlightedEdgeKeys?: Set<string>;
  criticalNodeId?: string | null;
}

export function GraphCanvas({
  highlightedNodeIds = new Set(),
  highlightedEdgeKeys = new Set(),
  criticalNodeId = null,
}: Props) {
  const { graphNodes, graphEdges, selectedNodeId, vulnerabilities, selectNode } = useAppStore();

  const vulnMap = useMemo(() => {
    const m = new Map<string, number>();
    vulnerabilities.forEach((v) => m.set(v.nodeId, v.riskScore));
    return m;
  }, [vulnerabilities]);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildFlowGraph(graphNodes, graphEdges, selectedNodeId, highlightedNodeIds, highlightedEdgeKeys, criticalNodeId, vulnMap),
    [graphNodes, graphEdges, selectedNodeId, highlightedNodeIds, highlightedEdgeKeys, criticalNodeId, vulnMap],
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const syncedNodes = useMemo(() => {
    return initialNodes.map((n) => {
      const existing = nodes.find((en) => en.id === n.id);
      return existing ? { ...n, position: existing.position } : n;
    });
  }, [initialNodes]); // eslint-disable-line

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    selectNode(node.id);
  }, [selectNode]);

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  if (graphNodes.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#555555' }}>No cluster data loaded.</div>
          <div style={{ fontSize: 11, color: '#333333', marginTop: 6 }}>
            Run: <span style={{ fontFamily: 'monospace', color: '#FF6A00' }}>npm run ingest</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, borderRadius: 12, overflow: 'hidden' }}>
      <ReactFlow
        nodes={syncedNodes}
        edges={initialEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.08}
        maxZoom={2}
        attributionPosition={undefined}
      >
        <Background variant={BackgroundVariant.Dots} color="#1F1F1F" gap={28} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => {
            const d = n.data as K8sNodeData;
            return d.riskScore >= 8 ? '#FF3B3B' : d.riskScore >= 5 ? '#FFA726' : '#3B82F6';
          }}
          maskColor="#0B0B0BCC"
        />
      </ReactFlow>
    </div>
  );
}
