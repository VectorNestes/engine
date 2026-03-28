import { Router, Request, Response, NextFunction } from 'express';

import { IngestInputSchema } from '../../schemas/index';
import { ingestCluster }     from '../../services/ingestion.service';
import { loadGraph }         from '../../db/loader';
import { ensureProjection }  from '../../db/queries';

const router = Router();

/**
 * POST /api/ingest
 *
 * Integration core — runs the full 3-step pipeline:
 *   1. ingestCluster()   — Teammate 1: fetch → transform → enrich → write JSON
 *   2. loadGraph()       — Teammate 2: load JSON into Neo4j
 *   3. ensureProjection() — Re-project GDS (MANDATORY — stale projection breaks Dijkstra)
 *
 * Each step has isolated error handling so the client knows exactly where failure occurred.
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  // ── Validate input ────────────────────────────────────────────────────────
  const parsed = IngestInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors });
    return;
  }

  const { source, skipCve, wipe } = parsed.data;

  // ── Step 1: Ingestion (Teammate 1) ────────────────────────────────────────
  let graphPath: string;
  let ingestNodes: number;
  let ingestEdges: number;

  try {
    const result = await ingestCluster({ source, skipCve });
    graphPath    = result.graphPath;
    ingestNodes  = result.nodes;
    ingestEdges  = result.edges;
  } catch (err) {
    res.status(500).json({
      error:  'Ingestion failed',
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // ── Step 2: Load into Neo4j (Teammate 2) ──────────────────────────────────
  let loaderStats: { nodesLoaded: number; edgesLoaded: number; durationMs: number };

  try {
    loaderStats = await loadGraph(graphPath, wipe);
  } catch (err) {
    res.status(500).json({
      error:  'Graph loading failed',
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // ── Step 3: Re-project GDS (ALWAYS after loading) ─────────────────────────
  try {
    await ensureProjection(true);
  } catch (err) {
    res.status(500).json({
      error:  'GDS projection failed',
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  res.json({
    success: true,
    ingest: {
      nodes: ingestNodes,
      edges: ingestEdges,
    },
    neo4j: {
      nodesLoaded: loaderStats.nodesLoaded,
      edgesLoaded: loaderStats.edgesLoaded,
      durationMs:  loaderStats.durationMs,
    },
    gds: { projected: true },
  });
});

export default router;
