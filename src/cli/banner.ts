/**
 * banner.ts — VECTORNESTES CLI  ·  Production-grade terminal decorations
 *
 * Provides:
 *   printBanner()      – Big ASCII logo + version line (shown once per command)
 *   ui.*               – Styled log helpers (ok / warn / fail / info / step / section)
 *   progressLine()     – Inline progress spinner / countdown
 *   systemReadyBox()   – Final "system ready" info panel
 */

// ─── ANSI colour / style helpers ─────────────────────────────────────────────

const ESC = '\x1b';

/** Returns true when stdout supports colour (TTY + no CI plain-text env). */
function supportsColor(): boolean {
  return (
    process.stdout.isTTY === true &&
    process.env['NO_COLOR'] === undefined &&
    process.env['TERM'] !== 'dumb'
  );
}

type ColorCode =
  | 'reset'
  | 'bold'
  | 'dim'
  | 'italic'
  | 'underline'
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'brightRed'
  | 'brightGreen'
  | 'brightYellow'
  | 'brightBlue'
  | 'brightMagenta'
  | 'brightCyan'
  | 'brightWhite'
  | 'bgBlack'
  | 'bgBlue'
  | 'bgCyan'
  | 'bgMagenta';

const CODES: Record<ColorCode, string> = {
  reset:         `${ESC}[0m`,
  bold:          `${ESC}[1m`,
  dim:           `${ESC}[2m`,
  italic:        `${ESC}[3m`,
  underline:     `${ESC}[4m`,
  black:         `${ESC}[30m`,
  red:           `${ESC}[31m`,
  green:         `${ESC}[32m`,
  yellow:        `${ESC}[33m`,
  blue:          `${ESC}[34m`,
  magenta:       `${ESC}[35m`,
  cyan:          `${ESC}[36m`,
  white:         `${ESC}[37m`,
  brightRed:     `${ESC}[91m`,
  brightGreen:   `${ESC}[92m`,
  brightYellow:  `${ESC}[93m`,
  brightBlue:    `${ESC}[94m`,
  brightMagenta: `${ESC}[95m`,
  brightCyan:    `${ESC}[96m`,
  brightWhite:   `${ESC}[97m`,
  bgBlack:       `${ESC}[40m`,
  bgBlue:        `${ESC}[44m`,
  bgCyan:        `${ESC}[46m`,
  bgMagenta:     `${ESC}[45m`,
};

function c(...codes: ColorCode[]): string {
  return supportsColor() ? codes.map((k) => CODES[k]).join('') : '';
}
const R = () => c('reset');          // shorthand reset

// ─── ASCII logo ───────────────────────────────────────────────────────────────

const LOGO_LINES = [
  ' ██╗   ██╗███████╗ ██████╗████████╗ ██████╗ ██████╗ ███╗   ██╗███████╗███████╗████████╗███████╗',
  ' ██║   ██║██╔════╝██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗████╗  ██║██╔════╝██╔════╝╚══██╔══╝██╔════╝',
  ' ██║   ██║█████╗  ██║        ██║   ██║   ██║██████╔╝██╔██╗ ██║█████╗  ███████╗   ██║   █████╗  ',
  ' ╚██╗ ██╔╝██╔══╝  ██║        ██║   ██║   ██║██╔══██╗██║╚██╗██║██╔══╝  ╚════██║   ██║   ██╔══╝  ',
  '  ╚████╔╝ ███████╗╚██████╗   ██║   ╚██████╔╝██║  ██║██║ ╚████║███████╗███████║   ██║   ███████╗',
  '   ╚═══╝  ╚══════╝ ╚═════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝   ╚═╝   ╚══════╝',
];

const TAGLINE = 'Kubernetes RBAC Attack-Path Intelligence Platform';
const VERSION = 'v1.0.8';

// Width of the logo (longest line)
const LOGO_W = Math.max(...LOGO_LINES.map((l) => l.length));

/** Centres `text` within `width` columns. */
function centre(text: string, width: number): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + text;
}

// ─── printBanner ─────────────────────────────────────────────────────────────

/**
 * Prints the full VECTORNESTES banner to stdout.
 * Call this **once** at the beginning of every CLI command.
 */
export function printBanner(): void {
  const topBar    = '╔' + '═'.repeat(LOGO_W + 2) + '╗';
  const bottomBar = '╚' + '═'.repeat(LOGO_W + 2) + '╝';
  const sideLine  = (content: string) => `║ ${content.padEnd(LOGO_W)} ║`;

  process.stdout.write('\n');

  // Top border
  process.stdout.write(c('dim', 'cyan') + topBar + R() + '\n');

  // Empty padding row
  process.stdout.write(c('dim', 'cyan') + sideLine('') + R() + '\n');

  // Logo rows — gradient cyan → brightCyan → white
  const logoColors: ColorCode[][] = [
    ['cyan'],
    ['brightCyan'],
    ['brightCyan', 'bold'],
    ['brightWhite', 'bold'],
    ['brightCyan'],
    ['cyan'],
  ];
  LOGO_LINES.forEach((line, i) => {
    const color = logoColors[i] ?? ['cyan'];
    process.stdout.write(
      c('dim', 'cyan') + '║ ' + R() +
      c(...(color as ColorCode[])) + line.padEnd(LOGO_W) + R() +
      c('dim', 'cyan') + ' ║' + R() + '\n',
    );
  });

  // Spacer
  process.stdout.write(c('dim', 'cyan') + sideLine('') + R() + '\n');

  // Tagline
  const tagCentered = centre(TAGLINE, LOGO_W);
  process.stdout.write(
    c('dim', 'cyan') + '║ ' + R() +
    c('dim', 'white') + c('italic') + tagCentered.padEnd(LOGO_W) + R() +
    c('dim', 'cyan') + ' ║' + R() + '\n',
  );

  // Version + build date
  const meta = `${VERSION}  ·  ${new Date().toUTCString()}`;
  const metaCentered = centre(meta, LOGO_W);
  process.stdout.write(
    c('dim', 'cyan') + '║ ' + R() +
    c('dim') + metaCentered.padEnd(LOGO_W) + R() +
    c('dim', 'cyan') + ' ║' + R() + '\n',
  );

  // Empty padding row
  process.stdout.write(c('dim', 'cyan') + sideLine('') + R() + '\n');

  // Bottom border
  process.stdout.write(c('dim', 'cyan') + bottomBar + R() + '\n\n');
}

// ─── Section header ───────────────────────────────────────────────────────────

const SECTION_W = 62;

/** Prints a visually distinct section separator with a title. */
export function printSection(title: string, icon = '▸'): void {
  const bar = '─'.repeat(SECTION_W);
  process.stdout.write('\n');
  process.stdout.write(c('dim', 'cyan') + bar + R() + '\n');
  process.stdout.write(
    `  ${c('brightCyan', 'bold')}${icon}  ${title}${R()}\n`,
  );
  process.stdout.write(c('dim', 'cyan') + bar + R() + '\n');
}

/** Thin divider line. */
export function divider(): void {
  process.stdout.write(c('dim') + '  ' + '─'.repeat(SECTION_W) + R() + '\n');
}

// ─── Log helpers ─────────────────────────────────────────────────────────────

/** ✔  green success line */
export function ok(msg: string): void {
  process.stdout.write(`  ${c('brightGreen', 'bold')}✔${R()}  ${msg}\n`);
}

/** ⚠  yellow warning line */
export function warn(msg: string): void {
  process.stdout.write(`  ${c('brightYellow', 'bold')}⚠${R()}  ${c('yellow')}${msg}${R()}\n`);
}

/** ✖  red error line */
export function fail(msg: string): void {
  process.stderr.write(`  ${c('brightRed', 'bold')}✖${R()}  ${c('red')}${msg}${R()}\n`);
}

/** Plain indented info line. */
export function info(msg: string): void {
  process.stdout.write(`     ${c('dim')}${msg}${R()}\n`);
}

/** Numbered pipeline step. */
export function step(label: string, n?: number): void {
  const prefix = n !== undefined
    ? `${c('dim', 'cyan')}[${n}]${R()} `
    : `${c('brightCyan')}›${R()} `;
  process.stdout.write(`\n  ${prefix}${c('bold')}${label}${R()}\n`);
}

/** Sub-result bullet (→  dim label + bright value). */
export function detail(label: string, value: string | number): void {
  process.stdout.write(
    `     ${c('dim')}→${R()}  ${c('dim')}${label}:${R()}  ${c('brightWhite')}${value}${R()}\n`,
  );
}

/** Error + hint block (e.g. after a failed preflight step). */
export function errorBlock(title: string, hints: string[]): void {
  fail(title);
  hints.forEach((h) => info(h));
}

// ─── Inline progress line ─────────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let _spinIdx = 0;

/**
 * Writes an overwritable progress line.
 * Call repeatedly in a loop; the previous line is replaced via `\r`.
 *
 * @param msg      Status message
 * @param attempt  Current attempt number (shown in parens)
 * @param remaining  Seconds remaining (optional)
 */
export function progressLine(msg: string, attempt?: number, remaining?: number): void {
  const spinner = SPINNER_FRAMES[_spinIdx % SPINNER_FRAMES.length];
  _spinIdx++;

  let suffix = '';
  if (attempt   !== undefined) suffix += `  attempt ${attempt}`;
  if (remaining !== undefined) suffix += `  (${remaining}s left)`;

  const line =
    `\r  ${c('brightCyan')}${spinner}${R()}  ${c('dim')}${msg}${R()}` +
    `${c('dim')}${suffix}${R()}          `;   // trailing spaces clear prev line

  process.stdout.write(line);
}

/** Clear the current progress line (write a blank `\r` then newline). */
export function clearProgress(): void {
  process.stdout.write('\r' + ' '.repeat(80) + '\r');
}

// ─── System-ready panel ───────────────────────────────────────────────────────

export interface ServiceEntry {
  label:   string;
  url:     string;
  status?: 'up' | 'down' | 'partial';
}

/**
 * Renders the final "system ready" panel shown after `start` completes.
 *
 * @param services  Array of { label, url, status }
 * @param mode      'mock' | 'live'
 */
export function systemReadyBox(services: ServiceEntry[], mode: 'mock' | 'live'): void {
  const boxW = 64;
  const top    = '╔' + '═'.repeat(boxW) + '╗';
  const bottom = '╚' + '═'.repeat(boxW) + '╝';
  const row    = (content: string) => `║  ${content.padEnd(boxW - 2)}  ║`;
  const sep    = '╟' + '─'.repeat(boxW) + '╢';

  process.stdout.write('\n');
  process.stdout.write(c('brightGreen', 'bold') + top + R() + '\n');

  // Title
  const title = '  VECTORNESTES  ·  System Ready';
  process.stdout.write(
    c('brightGreen') + '║' + R() +
    c('brightWhite', 'bold') + title.padEnd(boxW + 2) + R() +
    c('brightGreen') + '║' + R() + '\n',
  );

  // Mode badge
  const modeLine =
    mode === 'mock'
      ? `  Mode: ${c('brightYellow')}DEMO (mock data)${R()}`
      : `  Mode: ${c('brightGreen')}LIVE (kubectl)${R()}`;
  process.stdout.write(c('brightGreen') + '║' + R() + modeLine.padEnd(boxW + 2 + 9) + c('brightGreen') + '║' + R() + '\n');

  process.stdout.write(c('brightGreen') + sep + R() + '\n');

  // Service rows
  for (const svc of services) {
    const icon =
      svc.status === 'down'    ? c('red') + '✖' + R() :
      svc.status === 'partial' ? c('yellow') + '⚠' + R() :
                                  c('brightGreen') + '✔' + R();

    const label = `${icon}  ${c('dim')}${svc.label.padEnd(14)}${R()}`;
    const url   = `${c('brightCyan', 'underline')}${svc.url}${R()}`;

    // Manually compute visible-char width (strip ANSI codes for padding)
    const visibleLabel = svc.label.padEnd(14);
    const raw = `     ${visibleLabel}  →  ${svc.url}`;
    const padded = raw.padEnd(boxW + 2);

    // Print with colour
    process.stdout.write(
      c('brightGreen') + '║' + R() +
      `  ${icon}  ${c('dim')}${visibleLabel}${R()}  ${c('dim')}→${R()}  ${url}` +
      ' '.repeat(Math.max(0, boxW - 2 - raw.length + 4)) +
      c('brightGreen') + '║' + R() + '\n',
    );
  }

  process.stdout.write(c('brightGreen') + sep + R() + '\n');

  // Footer hint
  const hint = '  Press Ctrl+C to stop all services.';
  process.stdout.write(
    c('brightGreen') + '║' + R() +
    c('dim') + hint.padEnd(boxW + 2) + R() +
    c('brightGreen') + '║' + R() + '\n',
  );

  process.stdout.write(c('brightGreen', 'bold') + bottom + R() + '\n\n');
}
