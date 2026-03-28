import { Router, Request, Response, NextFunction } from 'express';

import { SimulateInputSchema } from '../../schemas/index';
import { runQuery }            from '../../db/neo4j-client';

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

    const [baselineRows, filteredRows] = await Promise.all([
      runQuery<{ count: number }>(`
        MATCH p = (s:K8sNode)-[*1..${maxHops}]->(e:K8sNode)
        WHERE s.isEntryPoint = true AND e.isCrownJewel = true
        RETURN count(p) AS count
      `),
      runQuery<{ count: number }>(`
        MATCH p = (s:K8sNode)-[*1..${maxHops}]->(e:K8sNode)
        WHERE s.isEntryPoint = true
          AND e.isCrownJewel = true
          AND NONE(n IN nodes(p) WHERE n.id = $id)
        RETURN count(p) AS count
      `, { id: nodeId }),
    ]);

    const elapsed         = Date.now() - start;
    const baselineCount   = (baselineRows[0]?.count as number) ?? 0;
    const filteredCount   = (filteredRows[0]?.count as number) ?? 0;
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
