import type { CliError } from '../lib/types.js';

export function normalizeApiError(status: number, payload: unknown): CliError {
  const object =
    typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  const rawMessage = typeof payload === 'string' ? payload : (object.message ?? object.error);
  const message = Array.isArray(rawMessage)
    ? rawMessage.map(String).join('; ')
    : typeof rawMessage === 'string'
      ? rawMessage
      : `UptimeRobot API request failed with HTTP ${status}.`;
  return {
    // Derived from the transport status, never from the body: an upstream code
    // is optional, undocumented, and absent from openapi.yaml, so reporting it
    // as `code` left the vocabulary depending on which endpoint answered. The
    // raw value is kept beside it, verbatim and uninterpreted.
    ...(typeof object.code === 'string' ? { apiCode: object.code } : {}),
    code: `HTTP_${status}`,
    ...(object.details !== undefined ? { details: object.details } : {}),
    message,
    status,
  };
}

/**
 * Maps an HTTP status onto the CLI's exit code contract. A request the server
 * rejected as invalid exits 2, the same code locally caught invalid input
 * produces, so a caller can tell "the request was wrong, do not retry it" from
 * a generic failure that retrying may clear. Conflicts get their own code
 * because the request is well formed and only the current server state refuses
 * it, which a caller resolves differently.
 */
export function exitCodeFor(status: number): number {
  if (status === 400) return 2;
  if (status === 401) return 4;
  if (status === 403) return 5;
  if (status === 404) return 6;
  if (status === 409) return 8;
  if (status === 422) return 2;
  if (status === 429) return 7;
  return 1;
}
