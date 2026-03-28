import type { ReportData } from './generator';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const W   = 66;
const DIV = '─'.repeat(W);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function header(title: string): string {
  return [
    DIV,
    `  ${title}`,
    DIV,
  ].join('\n');
}

function riskBar(score: number): string {
  const filled = Math.round(score);
  return '[' + '█'.repeat(filled) + '░'.repeat(10 - filled) + `] ${score}/10`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts structured ReportData → human-readable text or raw JSON.
 *
 * Used identically by:
 *   • GET /api/report  (Express route)
 *   • CLI `report` command
 *
 * No logic is duplicated between the two callers.
 */
export function formatReport(data: ReportData, format: 'text' | 'json' = 'text'): string {
  if (format === 'json') {
    return JSON.stringify(data, null, 2);
  }

  const lines: string[] = [];

  // ── Title block ───────────────────────────────────────────────────────────
  lines.push('╔' + '═'.repeat(W) + '╗');
  const titleLine = '  KUBERNETES ATTACK PATH ANALYSIS REPORT';
  lines.push('║' + titleLine + ' '.repeat(W - titleLine.length) + '║');
  lines.push('╚' + '═'.repeat(W) + '╝');
  lines.push('');
  lines.push(`  Generated : ${data.generatedAt}`);
  lines.push('');

  // ── Executive Summary ─────────────────────────────────────────────────────
  const criticalCount = data.attackPaths.filter((p) => p.riskScore >= 7).length;
  const crownJewelsHit = new Set(data.attackPaths.map((p) => p.crownJewel)).size;

  lines.push(header('EXECUTIVE SUMMARY'));
  lines.push(`  Attack Paths Found  : ${data.attackPaths.length}`);
  lines.push(`  Critical (risk ≥ 7) : ${criticalCount}`);
  lines.push(`  Crown Jewels At Risk: ${crownJewelsHit}`);
  lines.push(`  Dijkstra Paths      : ${data.dijkstraPaths.length}`);
  lines.push(`  Privilege Cycles    : ${data.cycles.length}`);
  lines.push(`  Critical Chokepoint : ${data.criticalNode?.nodeId ?? 'none detected'}`);
  lines.push('');

  // ── Attack Paths ──────────────────────────────────────────────────────────
  lines.push(header('ATTACK PATHS  (BFS — all routes, ordered by risk)'));
  if (data.attackPaths.length === 0) {
    lines.push('  No attack paths found. Graph may not be loaded.');
  } else {
    for (let i = 0; i < data.attackPaths.length; i++) {
      const p = data.attackPaths[i]!;
      lines.push(`  Path ${i + 1}  ${riskBar(p.riskScore)}`);
      lines.push(`  Entry  : ${p.entryPoint}`);
      lines.push(`  Target : ${p.crownJewel}`);
      lines.push(`  Route  : ${p.nodeIds.join(' → ')}`);
      lines.push(`  Hops   : ${p.hops}  |  Weight: ${p.totalWeight}`);
      lines.push('');
    }
  }

  // ── Dijkstra Shortest Paths ───────────────────────────────────────────────
  lines.push(header('SHORTEST PATHS  (Dijkstra GDS — minimum-weight route)'));
  if (data.dijkstraPaths.length === 0) {
    lines.push('  No GDS paths found.');
  } else {
    for (let i = 0; i < data.dijkstraPaths.length; i++) {
      const p = data.dijkstraPaths[i]!;
      lines.push(`  Dijkstra ${i + 1}: ${p.sourceId}  →  ${p.targetId}`);
      lines.push(`  Cost   : ${p.totalCost}  |  Hops: ${p.hops}`);
      lines.push(`  Route  : ${p.pathNodeIds.join(' → ')}`);
      lines.push('');
    }
  }

  // ── Blast Radius ──────────────────────────────────────────────────────────
  lines.push(header('BLAST RADIUS  (nodes reachable from each entry point)'));
  if (data.blastRadii.length === 0) {
    lines.push('  No entry points found.');
  } else {
    for (const br of data.blastRadii) {
      const crowns = br.reachable.filter((r) => r.isCrownJewel);
      lines.push(`  ${br.entryPoint}`);
      lines.push(`    Reachable nodes  : ${br.reachable.length}`);
      if (crowns.length > 0) {
        lines.push(`    Crown jewels hit : ${crowns.map((c) => c.reachableNodeId).join(', ')}`);
      }
    }
  }
  lines.push('');

  // ── Privilege Escalation Cycles ───────────────────────────────────────────
  lines.push(header('PRIVILEGE ESCALATION CYCLES'));
  if (data.cycles.length === 0) {
    lines.push('  No cycles detected. ✔');
  } else {
    for (let i = 0; i < data.cycles.length; i++) {
      const c = data.cycles[i]!;
      lines.push(`  Cycle ${i + 1}  (length: ${c.cycleLength})`);
      lines.push(`  Nodes : ${c.cycleNodeIds.join(' → ')}`);
      lines.push(`  Rels  : ${c.relationshipTypes.join(', ')}`);
      lines.push('');
    }
  }

  // ── Critical Node ─────────────────────────────────────────────────────────
  lines.push(header('CRITICAL NODE  (highest betweenness centrality)'));
  if (!data.criticalNode) {
    lines.push('  No critical node data available.');
  } else {
    const cn = data.criticalNode;
    lines.push(`  ID           : ${cn.nodeId}`);
    lines.push(`  Name         : ${cn.name}`);
    lines.push(`  Type         : ${cn.type}  |  Namespace: ${cn.namespace}`);
    lines.push(`  Betweenness  : ${cn.betweennessScore}`);
    lines.push(`  Risk Score   : ${riskBar(cn.riskScore)}`);
    lines.push(`  Entry Point  : ${cn.isEntryPoint}`);
    lines.push(`  Crown Jewel  : ${cn.isCrownJewel}`);
  }
  lines.push('');
  lines.push(DIV);

  return lines.join('\n');
}
