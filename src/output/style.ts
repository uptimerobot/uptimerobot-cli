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
  ARCHIVED: MUTED,
  DOWN: BAD,
  LOOKS_DOWN: WARN,
  NOT_DELIVERED: BAD,
  OFFLINE: MUTED,
  Ongoing: BAD,
  PAUSED: MUTED,
  PENDING: WARN,
  PUBLISHED: OK,
  Resolved: OK,
  STARTED: OK,
  SUCCESS: OK,
  UP: OK,
  active: OK,
  error: BAD,
  paused: MUTED,
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
