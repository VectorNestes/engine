import { Router, Request, Response, NextFunction } from 'express';

import { PathsQuerySchema } from '../../schemas/index';
import { findAttackPaths }  from '../../db/queries';
import {
  explainPath,
  type ExplainerNode,
  type PathRelationship,
} from '../../services/risk-explainer';

const router = Router();

/**
 * GET /api/paths
 *
 * BFS attack-path discovery across ALL (entryPoint, crownJewel) pairs.
 * Each path includes a `description` field that explains:
 *   • How the attacker enters (entry point type + CVEs)
 *   • How privileges escalate (each RBAC hop)
 *   • What the final impact is (crown jewel compromise)
 *
 * Query params:
 *   maxHops  — max traversal depth    (default 10, max 20)
 *   limit    — max paths to return    (default 50, max 200)
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = PathsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.errors });
    return;
  }

  const { maxHops, limit } = parsed.data;

  try {
    const rawPaths = await findAttackPaths(maxHops, limit);

    const paths = rawPaths.map((p) => {
      // Cast to explainer types — QueryNode is a superset of ExplainerNode
      const explainerNodes = p.nodes as ExplainerNode[];
      const explainerRels  = p.relationships as PathRelationship[];

      return {
        nodes:       p.nodeIds,
        riskScore:   p.riskScore,
        entryPoint:  p.entryPoint,
        crownJewel:  p.crownJewel,
        hops:        p.hops,
        totalWeight: p.totalWeight,
        description: explainPath(explainerNodes, explainerRels),
        // Full node + relationship detail for frontend graph animation
        nodeDetail:  p.nodes,
        edgeDetail:  p.relationships,
      };
    });

    const criticalCount = paths.filter((p) => p.riskScore >= 7).length;

    res.json({
      paths,
      summary: {
        total:             paths.length,
        critical:          criticalCount,
        uniqueEntryPoints: [...new Set(paths.map((p) => p.entryPoint))].length,
        uniqueCrownJewels: [...new Set(paths.map((p) => p.crownJewel))].length,
        avgHops:
          paths.length > 0
            ? Math.round((paths.reduce((s, p) => s + p.hops, 0) / paths.length) * 10) / 10
            : 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
