import { isRecord } from './objects.js';
import { isSensitiveFieldName } from './sensitive-fields.js';

const REDACTED = '[REDACTED]';

export interface RedactedValue {
  /** The input with every credential-like field replaced by a placeholder. */
  value: unknown;
  /** Paths of the replaced fields, in traversal order. */
  redacted: readonly string[];
}

/**
 * Replaces credential-like fields anywhere in a value, recursing through both
 * objects and arrays. Deliberately shape-agnostic: the same pass covers dry-run
 * request bodies and normalized API responses, whose resources nest under
 * `items[]`.
 */
export function redactSecrets(value: unknown): RedactedValue {
  const redacted: string[] = [];
  return { value: redactValue(value, [], redacted), redacted };
}

function redactValue(value: unknown, path: string[], redacted: string[]): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => redactValue(item, [...path, String(index)], redacted));
  }
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      const childPath = [...path, key];
      if (isSensitiveFieldName(key)) {
        redacted.push(formatPath(childPath));
        return [key, REDACTED];
      }
      return [key, redactValue(child, childPath, redacted)];
    }),
  );
}

function formatPath(segments: readonly string[]): string {
  return segments.reduce(
    (path, segment) =>
      /^\d+$/.test(segment) ? `${path}[${segment}]` : path ? `${path}.${segment}` : segment,
    '',
  );
}
