import { isRecord } from './objects.js';
import { isSensitiveFieldName } from './sensitive-fields.js';

const REDACTED = '[REDACTED]';

export interface RedactedRequestPreview {
  body: unknown;
  redacted: readonly string[];
}

export function redactRequestPreview(body: unknown): RedactedRequestPreview {
  const redacted: string[] = [];
  return { body: redactValue(body, [], redacted), redacted };
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
