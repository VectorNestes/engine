import { Router, Request, Response, NextFunction } from 'express';

import { CriticalQuerySchema } from '../../schemas/index';
import { findCriticalNodes, findAttackPaths }   from '../../db/algorithms';

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

    // Simulate node elimination natively on the memory graph
    const [allPaths, filteredPaths] = await Promise.all([
      findAttackPaths(10, 10000),                      // Get all paths
      findAttackPaths(10, 10000, topNode.nodeId)       // Get paths simulating dropping the critical node
    ]);

    const totalPaths      = allPaths.length;
    const pathsWithout    = filteredPaths.length;
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
