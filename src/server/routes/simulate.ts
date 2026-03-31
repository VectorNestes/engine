import { Router, Request, Response, NextFunction } from 'express';

import { SimulateInputSchema } from '../../schemas/index';
import { findAttackPaths } from '../../db/algorithms';

const router = Router();

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = SimulateInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors });
    return;
  }

  const { nodeId, maxHops } = parsed.data;

  try {
    const start = Date.now();

    const [allPaths, filteredPaths] = await Promise.all([
      findAttackPaths(maxHops, 10000),             // Baseline
      findAttackPaths(maxHops, 10000, nodeId),     // Simulated removal
    ]);

    const elapsed         = Date.now() - start;
    const baselineCount   = allPaths.length;
    const filteredCount   = filteredPaths.length;
    const eliminated      = baselineCount - filteredCount;
    const reductionPct    =
      baselineCount > 0
        ? Math.round((eliminated / baselineCount) * 1000) / 10
        : 0;

    res.json({
      simulation: {
        nodeId,
        maxHops,
        graphMutated:      false,
        durationMs:        elapsed,
      },
      results: {
        baselinePathCount:  baselineCount,
        filteredPathCount:  filteredCount,
        pathsEliminated:    eliminated,
        reductionPercent:   reductionPct,
        verdict:
          eliminated === 0 ? 'LOW IMPACT — node is not a chokepoint'
          : reductionPct >= 50 ? 'HIGH IMPACT — hardening this node breaks most attack paths'
          : 'MEDIUM IMPACT — hardening this node reduces attack surface',
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
