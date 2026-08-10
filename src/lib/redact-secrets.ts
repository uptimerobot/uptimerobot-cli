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

  const contextual = contextualSensitiveKeys(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      const childPath = [...path, key];
      if (isSensitiveFieldName(key) || contextual.has(key)) {
        redacted.push(formatPath(childPath));
        return [key, REDACTED];
      }
      return [key, redactValue(child, childPath, redacted)];
    }),
  );
}

const NO_KEYS: ReadonlySet<string> = new Set();
const HEARTBEAT_SECRET_KEYS: ReadonlySet<string> = new Set(['pingUrl', 'url']);

/**
 * Fields that carry a secret because of the record they sit in rather than what
 * they are called. A heartbeat monitor's `url` is the token its ping endpoint
 * is built from, and `pingUrl` is that endpoint: anyone holding either can
 * report the heartbeat, so a leak keeps a dead service looking alive with no
 * alert and nothing on the monitor to show for it. Every other monitor type
 * uses `url` for a target address, which is not a secret — hence the type
 * check rather than a name added to sensitive-fields.ts.
 */
function contextualSensitiveKeys(record: Record<string, unknown>): ReadonlySet<string> {
  return record.type === 'HEARTBEAT' ? HEARTBEAT_SECRET_KEYS : NO_KEYS;
}

function formatPath(segments: readonly string[]): string {
  return segments.reduce(
    (path, segment) =>
      /^\d+$/.test(segment) ? `${path}[${segment}]` : path ? `${path}.${segment}` : segment,
    '',
  );
}
