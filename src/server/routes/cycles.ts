import { Router, Request, Response, NextFunction } from 'express';

import { CyclesQuerySchema } from '../../schemas/index';
import { detectCycles }      from '../../db/queries';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = CyclesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.errors });
    return;
  }

  const { maxDepth, limit } = parsed.data;

  try {
    const cycles = await detectCycles(maxDepth, limit);

    res.json({
      cycles,
      summary: {
        total:      cycles.length,
        avgLength:
          cycles.length > 0
            ? Math.round((cycles.reduce((s, c) => s + c.cycleLength, 0) / cycles.length) * 10) / 10
            : 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
