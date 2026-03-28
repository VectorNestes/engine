import { Router, Request, Response, NextFunction } from 'express';
import { z }            from 'zod';

import { runQuery }     from '../../db/neo4j-client';
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
    const rows = await runQuery<VulnRow>(`
      MATCH (n:K8sNode) WHERE n.riskScore >= $minRisk

      OPTIONAL MATCH (n)-[outR]->(outTarget:K8sNode)
      WITH n,
        collect(
          CASE WHEN outR IS NOT NULL THEN {
            relType:   type(outR),
            toId:      outTarget.id,
            toType:    outTarget.type,
            toName:    outTarget.name,
            weight:    outR.weight,
            verbs:     outR.verbs,
            resources: outR.resources
          } END
        ) AS rawOut

      OPTIONAL MATCH (inSrc:K8sNode)-[inR]->(n)
      WITH n, rawOut,
        collect(
          CASE WHEN inR IS NOT NULL THEN {
            relType:  type(inR),
            fromId:   inSrc.id,
            fromType: inSrc.type,
            fromName: inSrc.name,
            weight:   inR.weight
          } END
        ) AS rawIn

      RETURN
        n.id           AS id,
        n.type         AS type,
        n.name         AS name,
        n.namespace    AS namespace,
        n.riskScore    AS riskScore,
        n.isEntryPoint AS isEntryPoint,
        n.isCrownJewel AS isCrownJewel,
        n.image        AS image,
        n.cve          AS cve,
        [e IN rawOut WHERE e IS NOT NULL] AS outEdges,
        [e IN rawIn  WHERE e IS NOT NULL] AS inEdges

      ORDER BY n.riskScore DESC
    `, { minRisk });

    const vulnerabilities = rows.map((row) => {
      const node: ExplainerNode = {
        id:           row.id,
        type:         row.type,
        name:         row.name,
        namespace:    row.namespace,
        riskScore:    row.riskScore,
        isEntryPoint: row.isEntryPoint,
        isCrownJewel: row.isCrownJewel,
        image:        row.image,
        cve:          row.cve,
      };

      const outEdges = (row.outEdges ?? []) as OutEdge[];
      const inEdges  = (row.inEdges  ?? []) as InEdge[];

      return {
        nodeId:      row.id,
        type:        row.type,
        namespace:   row.namespace,
        riskScore:   row.riskScore,
        isEntryPoint: row.isEntryPoint,
        isCrownJewel: row.isCrownJewel,
        cves:        row.cve ?? [],
        reason:      summariseRisk(node, outEdges, inEdges),
        explanation: explainNode(node, outEdges, inEdges),
        connections: {
          out: outEdges.length,
          in:  inEdges.length,
        },
      };
    });

    res.json({
      vulnerabilities,
      summary: {
        total:          vulnerabilities.length,
        critical:       vulnerabilities.filter((v) => v.riskScore >= 8).length,
        high:           vulnerabilities.filter((v) => v.riskScore >= 6 && v.riskScore < 8).length,
        medium:         vulnerabilities.filter((v) => v.riskScore >= minRisk && v.riskScore < 6).length,
        entryPoints:    vulnerabilities.filter((v) => v.isEntryPoint).length,
        crownJewels:    vulnerabilities.filter((v) => v.isCrownJewel).length,
        withCves:       vulnerabilities.filter((v) => v.cves.length > 0).length,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
