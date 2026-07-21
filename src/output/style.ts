export type PaintStyle = 'bold' | 'dim' | 'green' | 'red' | 'yellow';

export interface StatusGlyph {
  glyph: string;
  style: PaintStyle;
}

const ANSI_RESET = '\u001B[0m';

const ANSI_CODES: Record<PaintStyle, string> = {
  bold: '\u001B[1m',
  dim: '\u001B[2m',
  green: '\u001B[32m',
  red: '\u001B[31m',
  yellow: '\u001B[33m',
};

const OK: StatusGlyph = { glyph: '●', style: 'green' };
const BAD: StatusGlyph = { glyph: '✗', style: 'red' };
const WARN: StatusGlyph = { glyph: '▲', style: 'yellow' };
const MUTED: StatusGlyph = { glyph: '◌', style: 'dim' };

// Exact-match on the casing the API emits; unknown values must pass through unstyled.
const STATUS_GLYPHS: Record<string, StatusGlyph> = {
  Active: OK,
  Archived: MUTED,
  CantSend: MUTED,
  DOWN: BAD,
  ENABLED: OK,
  InQueue: MUTED,
  LOOKS_DOWN: BAD,
  NOT_DELIVERED: BAD,
  NotActivated: WARN,
  Offline: MUTED,
  Ongoing: BAD,
  PAUSED: MUTED,
  Paused: MUTED,
  Pending: WARN,
  Published: OK,
  Resolved: OK,
  STARTED: MUTED,
  SUCCESS: OK,
  Sent: OK,
  ToMigrate: WARN,
  UP: OK,
  active: OK,
  error: BAD,
  paused: MUTED,
  success: OK,
};

export function colorEnabled(): boolean {
  const noColor = process.env.NO_COLOR;
  if (noColor !== undefined && noColor !== '') return false;
  const forceColor = process.env.FORCE_COLOR;
  if (forceColor !== undefined && forceColor !== '') return forceColor !== '0';
  return process.stdout.isTTY === true;
}

export function paint(style: PaintStyle, text: string): string {
  if (!colorEnabled()) return text;
  return `${ANSI_CODES[style]}${text}${ANSI_RESET}`;
}

export function statusGlyph(value: string): StatusGlyph | undefined {
  return STATUS_GLYPHS[value];
}
