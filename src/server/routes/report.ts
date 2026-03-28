import { Router, Request, Response, NextFunction } from 'express';
import { z }                  from 'zod';

import { generateReport }  from '../../services/report/generator';
import { formatReport }    from '../../services/report/formatter';

const router = Router();

const ReportQuerySchema = z.object({
  format: z.enum(['text', 'json']).default('json'),
});

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
