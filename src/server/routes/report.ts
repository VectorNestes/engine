import { Router, Request, Response, NextFunction } from 'express';
import { z }                  from 'zod';

import { generateReport }  from '../../services/report/generator';
import { formatReport }    from '../../services/report/formatter';

const router = Router();

const ReportQuerySchema = z.object({
  format: z.enum(['text', 'json']).default('json'),
});

/**
 * GET /api/report
 *
 * Generates a full attack analysis report by collecting:
 *   • All BFS attack paths
 *   • Dijkstra shortest paths for every entry→crown pair
 *   • Blast radius per entry point
 *   • Privilege escalation cycles
 *   • Critical node (betweenness centrality)
 *
 * Query params:
 *   format — 'json' (default) | 'text'
 *
 * Uses the SAME generator + formatter as the CLI `report` command.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = ReportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.errors });
    return;
  }

  const { format } = parsed.data;

  try {
    const data = await generateReport();

    if (format === 'text') {
      res.type('text/plain').send(formatReport(data, 'text'));
    } else {
      res.json({ report: data, formatted: formatReport(data, 'text') });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
