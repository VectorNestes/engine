import Graph from 'graphology';
import * as fs from 'fs';
import * as path from 'path';
import { GraphData, GraphNode, GraphEdge, LoaderStats } from './types';

// The global in-memory graph singleton
let graph = new Graph({ type: 'directed', multi: true });

export function getGraph(): Graph {
  return graph;
}

export function clearGraph(): void {
  graph.clear();
  console.log('  ✔ In-memory graph cleared');
}

function resolveGraphPath(override?: string): string {
  if (override) {
    if (!fs.existsSync(override)) {
      throw new Error(`Graph file not found at specified path: ${override}`);
    }
    return override;
  }

  const candidates = [
    path.resolve(__dirname, '..', '..', 'data', 'cluster-graph.json'),
    path.resolve(__dirname, '..', 'data', 'cluster-graph.json'),
    path.resolve(__dirname, 'data', 'cluster-graph.json'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(
    `cluster-graph.json not found. Tried:\n` +
    candidates.map((c) => `  • ${c}`).join('\n') +
    `\n\nRun "npm run scan:mock" first to generate the file.`
  );
}

export function loadGraph(graphPath?: string, wipe = false): LoaderStats {
  const start = Date.now();

  const resolvedPath = resolveGraphPath(graphPath);
  console.log(`\n  → Reading graph from: ${resolvedPath}`);

  const raw: GraphData = JSON.parse(fs.readFileSync(resolvedPath, 'utf8')) as GraphData;
  console.log(`  → Parsed: ${raw.nodes.length} nodes, ${raw.edges.length} edges`);

  if (wipe) {
    clearGraph();
  } else {
    // If not wiping, recreate anyway or just clear?
    // In-memory usually just resets.
    graph.clear();
  }

  console.log('\n  Loading nodes into memory...');
  let totalNodes = 0;
  for (const n of raw.nodes) {
    if (!graph.hasNode(n.id)) {
      graph.addNode(n.id, {
        id: n.id,
        type: n.type,
        name: n.name,
        namespace: n.namespace,
        riskScore: n.riskScore,
        isEntryPoint: n.isEntryPoint,
        isCrownJewel: n.isCrownJewel,
        image: n.image ?? null,
        cve: n.cve ?? []
      });
      totalNodes++;
    }
  }

  console.log('\n  Loading edges into memory...');
  let totalEdges = 0;
  for (const e of raw.edges) {
    if (graph.hasNode(e.from) && graph.hasNode(e.to)) {
      // For networkx / graphology compatibility
      graph.addEdge(e.from, e.to, {
        type: e.type,
        weight: e.weight || 1, // Fallback weight if 0
        verbs: e.verbs ?? [],
        resources: e.resources ?? []
      });
      totalEdges++;
    }
  }

  const durationMs = Date.now() - start;

  console.log('\n  ' + '─'.repeat(50));
  console.log(`  ✔ Nodes loaded  : ${totalNodes}`);
  console.log(`  ✔ Edges loaded  : ${totalEdges}`);
  console.log(`  ✔ Duration      : ${durationMs}ms`);
  console.log(`  ✔ Memory Graph ready ✅`);
  console.log('  ' + '─'.repeat(50));

  return { nodesLoaded: totalNodes, edgesLoaded: totalEdges, indexesCreated: 0, durationMs };
}
