import { Router, Request, Response, NextFunction } from 'express';

import { runQuery } from '../../db/neo4j-client';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [nodesResult, edgesResult] = await Promise.all([
      runQuery<{
        id: string; type: string; name: string; namespace: string;
        riskScore: number; isEntryPoint: boolean; isCrownJewel: boolean;
        image: string | null; cve: string[];
      }>(`
        MATCH (n:K8sNode) AQ.Ab8RN6IDrFDTiOIGWD65asoJ0AOO5fTcFliVNoxxtZT83wueNg
        RETURN
          n.id           AS id,
          n.type         AS type,
          n.name         AS name,
          n.namespace    AS namespace,
          n.riskScore    AS riskScore,
          n.isEntryPoint AS isEntryPoint,
          n.isCrownJewel AS isCrownJewel,
          n.image        AS image,
          n.cve          AS cve
        ORDER BY n.riskScore DESC
      `),
      runQuery<{
        from: string; to: string; type: string;
        weight: number; verbs: string[]; resources: string[];
      }>(`
        MATCH (a:K8sNode)-[r]->(b:K8sNode)
        RETURN
          a.id       AS from,
          b.id       AS to,
          type(r)    AS type,
          r.weight   AS weight,
          r.verbs    AS verbs,
          r.resources AS resources
      `),
    ]);

    res.json({
      nodes:    nodesResult,
      edges:    edgesResult,
      metadata: {
        totalNodes:       nodesResult.length,
        totalEdges:       edgesResult.length,
        entryPoints:      nodesResult.filter((n) => n.isEntryPoint).length,
        crownJewels:      nodesResult.filter((n) => n.isCrownJewel).length,
        retrievedAt:      new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
