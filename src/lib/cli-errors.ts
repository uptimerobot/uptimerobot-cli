import { outputFormatFromEnvironment, requestedFormatFromArgv } from '../output/resolve-format.js';
import { agentEnvironmentDetected } from './invocation.js';
import { isRecord } from './objects.js';
import { redactSecrets } from './redact-secrets.js';
import type { CliError } from './types.js';

const handledErrors = new WeakSet<object>();

interface ErrorMetadata {
  code?: unknown;
  details?: unknown;
  expected?: unknown;
  message?: unknown;
  oclif?: { exit?: unknown };
  path?: unknown;
  status?: unknown;
  suggestions?: unknown;
}

export class CliFailure extends Error {
  readonly cliError: CliError;
  readonly oclif: { exit: number };

  constructor(error: CliError, exitCode: number) {
    super(error.message);
    this.cliError = error;
    this.oclif = { exit: exitCode };
  }
}

/**
 * Redacts the envelope rather than each error's source, because this is the one
 * place a failure becomes output: it covers the API's `details` passthrough,
 * the CLI's own bulk failures, and any error shape added later. The cast holds
 * because only values are replaced and no CliError key is credential-like, so
 * every key survives with its type.
 *
 * Unlike the success path this ignores --reveal-secrets. errorEnvelope also
 * serves failures raised before flags are parsed, and failure output is what
 * gets pasted into bug reports, CI logs, and agent transcripts.
 *
 * Redaction is key-based, so a secret interpolated into a free-text `message`
 * is not covered; only structured content is.
 */
function redactError(error: CliError): CliError {
  return redactSecrets(error).value as CliError;
}

export function errorEnvelope(error: unknown): { error: CliError } {
  if (error instanceof CliFailure) return { error: redactError(error.cliError) };

  const metadata = isRecord(error) ? (error as ErrorMetadata) : {};
  const exitCode = exitCodeForError(error);
  const code =
    typeof metadata.code === 'string' && metadata.code !== 'EEXIT'
      ? metadata.code
      : exitCode === 2
        ? 'INVALID_INPUT'
        : 'CLI_ERROR';
  const message =
    typeof metadata.message === 'string'
      ? metadata.message
      : typeof error === 'string'
        ? error
        : 'The command failed.';

  return {
    error: redactError({
      code,
      ...(metadata.details !== undefined ? { details: metadata.details } : {}),
      ...(typeof metadata.expected === 'string' ? { expected: metadata.expected } : {}),
      message,
      ...(typeof metadata.path === 'string' ? { path: metadata.path } : {}),
      ...(typeof metadata.status === 'number' ? { status: metadata.status } : {}),
      ...(Array.isArray(metadata.suggestions) &&
      metadata.suggestions.every((suggestion) => typeof suggestion === 'string')
        ? { suggestions: metadata.suggestions as string[] }
        : {}),
    }),
  };
}

export function exitCodeForError(error: unknown): number {
  if (!isRecord(error)) return 1;
  const oclifExit = isRecord(error.oclif) ? error.oclif.exit : undefined;
  if (typeof oclifExit === 'number') return oclifExit;
  return typeof error.exitCode === 'number' ? error.exitCode : 1;
}

export function machineOutputRequested(
  argv: readonly string[] = process.argv.slice(2),
  env: Readonly<Record<string, string | undefined>> = process.env,
  stdoutIsTTY = process.stdout.isTTY === true,
): boolean {
  const separator = argv.indexOf('--');
  const options = separator === -1 ? argv : argv.slice(0, separator);
  if (options.includes('--json') || options.includes('--raw')) return true;

  const format = requestedFormatFromArgv(options);
  if (format === 'json' || format === 'jsonl') return true;
  if (format === 'plain' || format === 'table') return false;

  const environmentFormat = outputFormatFromEnvironment(env);
  if (environmentFormat !== undefined) {
    if (environmentFormat === 'json' || environmentFormat === 'jsonl') return true;
    if (environmentFormat === 'plain' || environmentFormat === 'table') return false;
  }

  if (options.includes('--agent')) return true;
  if (agentEnvironmentDetected(env)) return true;
  return !stdoutIsTTY;
}

export function markErrorHandled(error: object): void {
  handledErrors.add(error);
}

export function wasErrorHandled(error: unknown): boolean {
  return isRecord(error) && handledErrors.has(error);
}
