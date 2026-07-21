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
      if (isSensitiveName(key)) {
        redacted.push(formatPath(childPath));
        return [key, REDACTED];
      }
      return [key, redactValue(child, childPath, redacted)];
    }),
  );
}

function isSensitiveName(name: string): boolean {
  const normalized = name.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return [
    'apikey',
    'authorization',
    'cookie',
    'credential',
    'password',
    'passphrase',
    'privatekey',
    'secret',
    'token',
  ].some((suffix) => normalized.endsWith(suffix));
}

function formatPath(segments: readonly string[]): string {
  return segments.reduce(
    (path, segment) =>
      /^\d+$/.test(segment) ? `${path}[${segment}]` : path ? `${path}.${segment}` : segment,
    '',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
