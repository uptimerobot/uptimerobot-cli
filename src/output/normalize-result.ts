export function normalizeResult(payload: unknown): unknown {
  if (Array.isArray(payload)) return { items: payload, nextCursor: null };
  if (!isRecord(payload) || !Array.isArray(payload.data)) return payload;

  return {
    items: payload.data,
    nextCursor:
      cursorFromNextLink(payload.nextLink) ??
      cursorFromValue(payload.nextCursor) ??
      cursorFromValue(payload.nextCursorId),
  };
}

function cursorFromNextLink(nextLink: unknown): string | null {
  if (typeof nextLink !== 'string') return null;
  try {
    return new URL(nextLink, 'https://api.uptimerobot.com').searchParams.get('cursor');
  } catch {
    return null;
  }
}

function cursorFromValue(value: unknown): string | null {
  if (typeof value === 'string') return value.length > 0 ? value : null;
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
