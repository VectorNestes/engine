import { Router, Request, Response, NextFunction } from 'express';

import { BlastQuerySchema } from '../../schemas/index';
import { getBlastRadius }   from '../../db/algorithms';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = BlastQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.errors });
    return;
  }

  const { nodeId, maxHops } = parsed.data;

  try {
    const reachable = await getBlastRadius(nodeId, maxHops);

    const crownJewelsReached = reachable.filter((r) => r.isCrownJewel);

    res.json({
      nodeId,
      maxHops,
      reachable,
      summary: {
        totalReachable:    reachable.length,
        crownJewelsReached: crownJewelsReached.length,
        crownJewelIds:      crownJewelsReached.map((r) => r.reachableNodeId),
        maxDepthReached:    reachable.length > 0 ? Math.max(...reachable.map((r) => r.hops)) : 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
