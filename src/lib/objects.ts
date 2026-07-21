/**
 * Shared record and dotted-path helpers. Keep these behavior-compatible with
 * the request compiler: path traversal treats arrays as values, not records.
 */

/** Any non-null object, including arrays and class instances such as Error. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A plain object: non-null and not an array. */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function valueAtPath(target: Readonly<Record<string, unknown>>, path: string): unknown {
  let value: unknown = target;
  for (const segment of path.split('.')) {
    if (!isPlainRecord(value)) return undefined;
    value = value[segment];
  }
  return value;
}

export function assignPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.').filter(Boolean);
  if (segments.length === 0) throw new Error('A field path is required.');
  let cursor = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = cursor[segment];
    if (!isPlainRecord(existing)) cursor[segment] = {};
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments.at(-1)!] = value;
}
