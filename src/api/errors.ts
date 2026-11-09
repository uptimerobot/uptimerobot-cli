import type { CliError } from '../lib/types.js';

export function normalizeApiError(status: number, payload: unknown): CliError {
  const object =
    typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  const rawMessage = typeof payload === 'string' ? payload : (object.message ?? object.error);
  // One line: a message the API breaks across lines would print as a second,
  // misleading line, while the CLI's own messages keep the layout they chose.
  const message = (
    Array.isArray(rawMessage)
      ? rawMessage.map(String).join('; ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : `UptimeRobot API request failed with HTTP ${status}.`
  ).replaceAll(/[\t\n\r]+/g, ' ');
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

/**
 * A failed API call as a thrown value: the normalized error and the exit code
 * it maps to, so a library function can stop on the first failure and a
 * command can report it the way every other command does.
 */
export class ApiFailure extends Error {
  readonly cliError: CliError;
  readonly exitCode: number;

  constructor(cliError: CliError, exitCode: number) {
    super(cliError.message);
    this.name = 'ApiFailure';
    this.cliError = cliError;
    this.exitCode = exitCode;
  }
}

/** The failure for a response the client returned, or a transport error it threw. */
export function apiFailureFrom(error: unknown): ApiFailure;
export function apiFailureFrom(status: number, payload: unknown): ApiFailure;
export function apiFailureFrom(errorOrStatus: unknown, payload?: unknown): ApiFailure {
  if (typeof errorOrStatus === 'number') {
    return new ApiFailure(normalizeApiError(errorOrStatus, payload), exitCodeFor(errorOrStatus));
  }
  const message = errorOrStatus instanceof Error ? errorOrStatus.message : String(errorOrStatus);
  return new ApiFailure({ code: 'NETWORK_ERROR', message }, 1);
}
