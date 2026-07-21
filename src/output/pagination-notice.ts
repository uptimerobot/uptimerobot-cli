import type { OutputFormat } from './resolve-format.js';

export interface PaginationNotice {
  message: string;
  stream: 'stderr';
}

export function paginationNotice(
  format: OutputFormat,
  normalizedResult: unknown,
): PaginationNotice | undefined {
  if ((format !== 'table' && format !== 'plain') || !isRecord(normalizedResult)) return undefined;
  const cursor = normalizedResult.nextCursor;
  if (typeof cursor !== 'string' || cursor.length === 0) return undefined;

  return {
    message: `More results are available. Next cursor: ${printableCursor(cursor)}`,
    stream: 'stderr',
  };
}

function printableCursor(cursor: string): string {
  return Array.from(cursor, (character) => {
    if (character === '\n') return '\\n';
    if (character === '\r') return '\\r';
    if (character === '\t') return '\\t';
    const codePoint = character.codePointAt(0)!;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      return `\\u${codePoint.toString(16).padStart(4, '0')}`;
    }
    return character;
  }).join('');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
