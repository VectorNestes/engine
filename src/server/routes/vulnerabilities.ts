import { Router, Request, Response, NextFunction } from 'express';
import { z }            from 'zod';

import { getGraph }     from '../../db/graphEngine';
import {
  explainNode,
  summariseRisk,
  type ExplainerNode,
  type OutEdge,
  type InEdge,
} from '../../services/risk-explainer';

const router = Router();

const QuerySchema = z.object({
  minRisk: z.coerce.number().min(0).max(10).default(3),
});

interface VulnRow {
  id:           string;
  type:         string;
  name:         string;
  namespace:    string;
  riskScore:    number;
  isEntryPoint: boolean;
  isCrownJewel: boolean;
  image:        string | null;
  cve:          string[] | null;
  outEdges:     OutEdge[];
  inEdges:      InEdge[];
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.errors });
    return;
  }

  const { minRisk } = parsed.data;

  try {
    const graph = getGraph();
    const vulnerabilities: any[] = [];

    graph.forEachNode((node, attrs) => {
      const riskScore = attrs.riskScore as number || 0;
      if (riskScore < minRisk) return;

      const outEdges: OutEdge[] = [];
      const inEdges: InEdge[] = [];

      graph.forEachOutEdge(node, (edge, edgeAttrs, source, target) => {
        const targetAttrs = graph.getNodeAttributes(target);
        outEdges.push({
          relType: edgeAttrs.type as string,
          toId: target,
          toType: targetAttrs.type as string,
          toName: targetAttrs.name as string,
          weight: edgeAttrs.weight as number,
          verbs: edgeAttrs.verbs as string[],
          resources: edgeAttrs.resources as string[]
        });
      });

      graph.forEachInEdge(node, (edge, edgeAttrs, source, target) => {
        const sourceAttrs = graph.getNodeAttributes(source);
        inEdges.push({
          relType: edgeAttrs.type as string,
          fromId: source,
          fromType: sourceAttrs.type as string,
          fromName: sourceAttrs.name as string,
          weight: edgeAttrs.weight as number
        });
      });

      const expNode: ExplainerNode = {
        id: node,
        type: attrs.type as string,
        name: attrs.name as string,
        namespace: attrs.namespace as string,
        riskScore: riskScore,
        isEntryPoint: !!attrs.isEntryPoint,
        isCrownJewel: !!attrs.isCrownJewel,
        image: attrs.image as string,
        cve: attrs.cve as string[],
      };

      vulnerabilities.push({
        nodeId: node,
        type: attrs.type as string,
        namespace: attrs.namespace as string,
        riskScore: riskScore,
        isEntryPoint: !!attrs.isEntryPoint,
        isCrownJewel: !!attrs.isCrownJewel,
        cves: attrs.cve || [],
        reason: summariseRisk(expNode, outEdges, inEdges),
        explanation: explainNode(expNode, outEdges, inEdges),
        connections: {
          out: outEdges.length,
          in: inEdges.length,
        },
      });
    });

    // Order by riskScore DESC
    vulnerabilities.sort((a, b) => b.riskScore - a.riskScore);

    res.json({
      vulnerabilities,
      summary: {
        total:          vulnerabilities.length,
        critical:       vulnerabilities.filter((v) => v.riskScore >= 8).length,
        high:           vulnerabilities.filter((v) => v.riskScore >= 6 && v.riskScore < 8).length,
        medium:         vulnerabilities.filter((v) => v.riskScore >= minRisk && v.riskScore < 6).length,
        entryPoints:    vulnerabilities.filter((v) => v.isEntryPoint).length,
        crownJewels:    vulnerabilities.filter((v) => v.isCrownJewel).length,
        withCves:       vulnerabilities.filter((v) => (v.cves || []).length > 0).length,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
