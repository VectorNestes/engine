import { jsPDF } from 'jspdf';
import { useAppStore } from '../store/useAppStore';

export function ReportView() {
  const { reportData, loading, errors } = useAppStore();

  const copy = () => {
    if (reportData?.formatted) {
      navigator.clipboard.writeText(reportData.formatted).catch(() => {});
    }
  };

  const downloadPdf = () => {
    if (!reportData?.formatted) return;

    // ── 1. Sanitise: strip all chars the built-in Courier font can't render ──
    const sanitise = (s: string) =>
      s
        .replace(/[╔╗╚╝║]/g, '')          // box corners / sides
        .replace(/═+/g, (m) => '='.repeat(m.length))
        .replace(/─+/g, (m) => '-'.repeat(m.length))
        .replace(/█/g, '#')
        .replace(/░/g, '.')
        .replace(/[→]/g, '->')
        .replace(/[≥]/g, '>=')
        .replace(/[✔]/g, 'OK')
        .replace(/[^\x00-\x7F]/g, '?');   // catch-all for remaining non-ASCII

    // ── 2. Classify each source line ────────────────────────────────────────
    type LineKind = 'blank' | 'divider' | 'title-box' | 'section' | 'path-header' | 'kv' | 'text';

    interface ParsedLine { kind: LineKind; raw: string; clean: string }

    const rawLines = reportData.formatted.split('\n');

    const parsed: ParsedLine[] = rawLines.map((raw) => {
      const clean   = sanitise(raw);
      const trimmed = raw.trim();

      if (!trimmed)                                            return { kind: 'blank',       raw, clean };
      if (/^[═─=\-]{10,}/.test(trimmed))                      return { kind: 'divider',     raw, clean };
      if (/^[╔║╚]/.test(trimmed))                             return { kind: 'title-box',   raw, clean };
      if (/^\s{2}[A-Z][A-Z\s()\/\-,]{4,}$/.test(raw) &&
          !/^\s{2}(Entry|Target|Route|Hops|Cost|Nodes|Rels|Dijkstra|ID|Name|Type|Betweenness|Risk|Crown|Entry|Attack|Crown|Dijkstra|Privilege|Reachable|Generated)/.test(raw))
                                                               return { kind: 'section',     raw, clean };
      if (/^\s{2}(Path|Dijkstra|Cycle)\s+\d+/.test(raw))      return { kind: 'path-header', raw, clean };
      if (/^\s{2,}\w[\w\s]{1,20}:\s/.test(raw))               return { kind: 'kv',          raw, clean };
      return                                                          { kind: 'text',         raw, clean };
    });

    // ── 3. Build PDF ─────────────────────────────────────────────────────────
    const doc    = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW  = doc.internal.pageSize.getWidth();
    const pageH  = doc.internal.pageSize.getHeight();
    const ML     = 48;    // margin left
    const MR     = 48;    // margin right
    const bodyW  = pageW - ML - MR;
    const date   = new Date().toISOString().slice(0, 10);

    // colours (RGB)
    const C = {
      bg:      [11, 11, 11]   as [number,number,number],
      orange:  [255, 106, 0]  as [number,number,number],
      white:   [220, 220, 220]as [number,number,number],
      muted:   [136, 136, 136]as [number,number,number],
      dim:     [72,  72,  72] as [number,number,number],
      faint:   [35,  35,  35] as [number,number,number],
      key:     [100, 100, 100]as [number,number,number],
      danger:  [255, 59,  59] as [number,number,number],
    };

    let y       = 0;
    let pageNum = 1;

    // ── helpers ──────────────────────────────────────────────────────
    const fill = (c: [number,number,number]) => doc.setFillColor(...c);
    const text = (c: [number,number,number]) => doc.setTextColor(...c);
    const draw = (c: [number,number,number]) => doc.setDrawColor(...c);

    const drawBg = () => { fill(C.bg); doc.rect(0, 0, pageW, pageH, 'F'); };

    const drawPageHeader = () => {
      drawBg();
      // orange top strip
      fill(C.orange);
      doc.rect(0, 0, pageW, 3, 'F');
      // left accent line
      fill(C.orange);
      doc.rect(ML - 12, 24, 2, pageH - 48, 'F');
    };

    const drawFooter = () => {
      text(C.faint);
      doc.setFont('courier', 'normal');
      doc.setFontSize(7);
      doc.text(`K8s Attack Path Visualizer  |  ${date}`, ML, pageH - 20);
      doc.text(`${pageNum}`, pageW - MR, pageH - 20, { align: 'right' });
    };

    const newPage = () => {
      drawFooter();
      doc.addPage();
      pageNum++;
      drawPageHeader();
      y = 56;
    };

    const ensureSpace = (needed: number) => {
      if (y + needed > pageH - 40) newPage();
    };

    // ── cover page ───────────────────────────────────────────────────
    drawPageHeader();
    y = 52;

    // Title
    doc.setFont('courier', 'bold');
    doc.setFontSize(22);
    text(C.white);
    doc.text('K8s Attack Path Report', ML, y);
    y += 26;

    // Subtitle row
    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    text(C.dim);
    doc.text(`Generated ${date}   |   Kubernetes RBAC Attack Path Visualizer`, ML, y);
    y += 18;

    // Full-width divider under header
    draw(C.faint);
    doc.setLineWidth(0.4);
    doc.line(ML, y, pageW - MR, y);
    y += 14;

    // ── render body lines ────────────────────────────────────────────
    for (const pl of parsed) {
      switch (pl.kind) {

        case 'blank':
          y += 6;
          break;

        case 'divider': {
          ensureSpace(10);
          draw(C.faint);
          doc.setLineWidth(0.3);
          doc.line(ML, y - 1, pageW - MR, y - 1);
          y += 8;
          break;
        }

        case 'title-box':
          // skip — we already drew a nicer cover header
          break;

        case 'section': {
          ensureSpace(32);
          y += 6;
          // orange pill background
          const label = pl.clean.trim();
          fill(C.orange);
          doc.roundedRect(ML, y - 10, bodyW, 16, 2, 2, 'F');
          doc.setFont('courier', 'bold');
          doc.setFontSize(8);
          text(C.bg);
          doc.text(label, ML + 8, y);
          y += 14;
          break;
        }

        case 'path-header': {
          ensureSpace(22);
          y += 4;
          // strip the risk bar text, parse score
          const riskMatch = pl.raw.match(/([\d.]+)\/10/);
          const score     = riskMatch ? parseFloat(riskMatch[1]) : 0;
          const riskColor = score >= 8 ? C.danger : score >= 5 ? C.orange : [76, 175, 80] as [number,number,number];

          // label (Path N / Dijkstra N / Cycle N)
          const labelMatch = pl.clean.trim().match(/^(\w+\s+\d+)/);
          const pathLabel  = labelMatch ? labelMatch[1] : pl.clean.trim();

          doc.setFont('courier', 'bold');
          doc.setFontSize(8.5);
          text(C.white);
          doc.text(pathLabel, ML, y);

          // score badge
          if (score > 0) {
            const badge = `${score.toFixed(1)} / 10`;
            doc.setFont('courier', 'bold');
            doc.setFontSize(7.5);
            text(riskColor);
            doc.text(badge, pageW - MR, y, { align: 'right' });

            // mini bar: 10 segments
            const barW   = 60;
            const barH   = 4;
            const barX   = pageW - MR - barW - 48;
            const barY   = y - barH;
            const filled = Math.round(score);
            fill(C.faint);
            doc.roundedRect(barX, barY, barW, barH, 1, 1, 'F');
            fill(riskColor);
            doc.roundedRect(barX, barY, barW * (filled / 10), barH, 1, 1, 'F');
          }

          y += 14;
          break;
        }

        case 'kv': {
          ensureSpace(14);
          // split "  Key   : value" into key + value parts
          const colonIdx = pl.clean.indexOf(':');
          const key   = colonIdx > -1 ? pl.clean.slice(0, colonIdx + 1).trim() : pl.clean.trim();
          const value = colonIdx > -1 ? pl.clean.slice(colonIdx + 1).trim()    : '';

          doc.setFont('courier', 'normal');
          doc.setFontSize(8);

          // key
          text(C.key);
          doc.text(key, ML + 8, y);

          // value (wrap if long)
          text(C.muted);
          const keyWidth   = doc.getTextWidth(key + '  ');
          const valueLines = doc.splitTextToSize(value, bodyW - keyWidth - 8) as string[];
          doc.text(valueLines[0] ?? '', ML + 8 + keyWidth, y);
          for (let vi = 1; vi < valueLines.length; vi++) {
            y += 12;
            ensureSpace(12);
            doc.text(valueLines[vi], ML + 8 + keyWidth, y);
          }
          y += 13;
          break;
        }

        default: {
          // generic text — wrap to page width
          ensureSpace(13);
          doc.setFont('courier', 'normal');
          doc.setFontSize(8);
          text(C.muted);
          const wrapped = doc.splitTextToSize(pl.clean.trimEnd(), bodyW - 8) as string[];
          for (const wl of wrapped) {
            ensureSpace(13);
            doc.text(wl, ML + 8, y);
            y += 13;
          }
          break;
        }
      }
    }

    drawFooter();
    doc.save(`k8s-attack-report-${date}.pdf`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 14, gap: 12 }}>

      {/* Header box */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 9, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Attack Report</div>
        </div>
        {reportData && (
          <div style={{ display: 'flex', gap: 8 }}>
            <ActionButton onClick={copy} label="Copy" />
            <ActionButton onClick={downloadPdf} label="Download PDF" primary />
          </div>
        )}
      </div>

      {/* Content box */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          background: '#121212',
          border: '1px solid #1F1F1F',
          borderTop: '2px solid #FF6A00',
          borderRadius: 16,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {loading['report'] && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  style={{ height: 14, borderRadius: 6, background: '#1F1F1F', animation: 'pulse 1.5s ease infinite', width: `${55 + Math.random() * 45}%` }}
                />
              ))}
            </div>
          )}

          {errors['report'] && (
            <div style={{ padding: '8px 12px', borderLeft: '2px solid #FF3B3B', background: '#FF3B3B10', color: '#FF3B3B', fontSize: 12 }}>
              {errors['report']}
            </div>
          )}

          {!loading['report'] && !reportData && !errors['report'] && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555555', fontSize: 13 }}>
              No report data available.
            </div>
          )}

          {reportData?.formatted && (
            <pre
              style={{
                margin: 0,
                fontSize: 12,
                fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
                color: '#888888',
                lineHeight: 1.75,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {reportData.formatted}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({ onClick, label, primary }: { onClick: () => void; label: string; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 10,
        fontFamily: 'monospace',
        color: primary ? '#FF6A00' : '#555555',
        background: primary ? '#FF6A0012' : 'transparent',
        border: `1px solid ${primary ? '#FF6A0050' : '#1F1F1F'}`,
        borderRadius: 6,
        padding: '4px 14px',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = '#FF6A00';
        (e.currentTarget as HTMLElement).style.color = '#FF6A00';
        (e.currentTarget as HTMLElement).style.background = '#FF6A0018';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = primary ? '#FF6A0050' : '#1F1F1F';
        (e.currentTarget as HTMLElement).style.color = primary ? '#FF6A00' : '#555555';
        (e.currentTarget as HTMLElement).style.background = primary ? '#FF6A0012' : 'transparent';
      }}
    >
      {label}
    </button>
  );
}
