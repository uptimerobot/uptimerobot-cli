import { outputFormatFromEnvironment, requestedFormatFromArgv } from '../output/resolve-format.js';
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

export function errorEnvelope(error: unknown): { error: CliError } {
  if (error instanceof CliFailure) return { error: error.cliError };

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
    error: {
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
    },
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
  if (
    env.UPTIMEROBOT_AGENT === undefined &&
    ['CLAUDECODE', 'CODEX_SANDBOX', 'CURSOR_AGENT'].some((name) => env[name])
  )
    return true;
  if (/^(1|true|yes)$/i.test(env.UPTIMEROBOT_AGENT ?? '')) return true;
  return !stdoutIsTTY;
}

export function markErrorHandled(error: object): void {
  handledErrors.add(error);
}

export function wasErrorHandled(error: unknown): boolean {
  return isRecord(error) && handledErrors.has(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
