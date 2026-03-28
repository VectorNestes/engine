import { Router, Request, Response, NextFunction } from 'express';

import { CriticalQuerySchema } from '../../schemas/index';
import { findCriticalNodes }   from '../../db/queries';
import { runQuery }            from '../../db/neo4j-client';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = CriticalQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.errors });
    return;
  }

  const { topN } = parsed.data;

  try {
    const criticalNodes = await findCriticalNodes(topN);

    if (criticalNodes.length === 0) {
      res.json({ criticalNodes: [], pathElimination: null });
      return;
    }

    const topNode = criticalNodes[0]!;

    const [allPathsRows, filteredPathsRows] = await Promise.all([
      runQuery<{ count: number }>(`
        MATCH p = (s:K8sNode)-[*1..10]->(e:K8sNode)
        WHERE s.isEntryPoint = true AND e.isCrownJewel = true
        RETURN count(p) AS count
      `),
      runQuery<{ count: number }>(`
        MATCH p = (s:K8sNode)-[*1..10]->(e:K8sNode)
        WHERE s.isEntryPoint = true
          AND e.isCrownJewel = true
          AND NONE(n IN nodes(p) WHERE n.id = $id)
        RETURN count(p) AS count
      `, { id: topNode.nodeId }),
    ]);

    const totalPaths      = (allPathsRows[0]?.count as number) ?? 0;
    const pathsWithout    = (filteredPathsRows[0]?.count as number) ?? 0;
    const pathsEliminated = totalPaths - pathsWithout;
    const reductionPct    =
      totalPaths > 0
        ? Math.round((pathsEliminated / totalPaths) * 1000) / 10
        : 0;

    res.json({
      criticalNodes,
      pathElimination: {
        nodeId:           topNode.nodeId,
        totalPaths,
        pathsEliminated,
        pathsRemaining:   pathsWithout,
        reductionPercent: reductionPct,
        note:             'Read-only simulation — no graph was modified',
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
