import { Router, Request, Response, NextFunction } from 'express';
import { getGraph } from '../../db/graphEngine';
import { GraphNode, GraphEdge } from '../../db/types';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const graph = getGraph();
    console.log('API /api/graph hit! Graph order:', graph.order);

    const nodesResult: any[] = [];
    const edgesResult: any[] = [];

    graph.forEachNode((node, attributes) => {
      nodesResult.push({
        id: node,
        type: attributes.type,
        name: attributes.name,
        namespace: attributes.namespace,
        riskScore: attributes.riskScore,
        isEntryPoint: attributes.isEntryPoint,
        isCrownJewel: attributes.isCrownJewel,
        image: attributes.image,
        cve: attributes.cve
      });
    });

    // Sort nodes manually by riskScore DESC
    nodesResult.sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));

    graph.forEachEdge((edge, attributes, source, target) => {
      edgesResult.push({
        from: source,
        to: target,
        type: attributes.type,
        weight: attributes.weight,
        verbs: attributes.verbs,
        resources: attributes.resources
      });
    });

    res.json({
      nodes:    nodesResult,
      edges:    edgesResult,
      metadata: {
        totalNodes:       nodesResult.length,
        totalEdges:       edgesResult.length,
        entryPoints:      nodesResult.filter((n) => n.isEntryPoint).length,
        crownJewels:      nodesResult.filter((n) => n.isCrownJewel).length,
        retrievedAt:      new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
