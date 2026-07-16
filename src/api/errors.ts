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
    code: typeof object.code === 'string' ? object.code : `HTTP_${status}`,
    ...(object.details !== undefined ? { details: object.details } : {}),
    message,
    status,
  };
}

export function exitCodeFor(status: number): number {
  if (status === 401) return 4;
  if (status === 403) return 5;
  if (status === 404) return 6;
  if (status === 429) return 7;
  return 1;
}
