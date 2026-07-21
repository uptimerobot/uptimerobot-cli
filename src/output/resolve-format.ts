import type { InvocationMode } from '../lib/invocation.js';
import type { FlagValues } from '../lib/types.js';

export type OutputFormat = 'json' | 'jsonl' | 'plain' | 'table';
const OUTPUT_FORMATS = new Set<OutputFormat>(['json', 'jsonl', 'plain', 'table']);

export function resolveFormat(
  flags: FlagValues,
  mode: InvocationMode,
  env: Readonly<Record<string, string | undefined>> = process.env,
): OutputFormat {
  if (flags.raw === true) return 'json';
  if (typeof flags.format === 'string') return flags.format as OutputFormat;
  if (flags.json === true) return 'json';
  const environmentFormat = outputFormatFromEnvironment(env);
  if (environmentFormat) return environmentFormat;
  if (mode === 'agent' || process.stdout.isTTY !== true) return 'json';
  return 'table';
}

export function outputFormatFromEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): OutputFormat | undefined {
  const value = env.UPTIMEROBOT_OUTPUT?.toLowerCase();
  return value && OUTPUT_FORMATS.has(value as OutputFormat) ? (value as OutputFormat) : undefined;
}

export function requestedFormatFromArgv(argv: readonly string[]): string | undefined {
  let format: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value?.startsWith('--format=')) format = value.slice('--format='.length).toLowerCase();
    else if (value === '--format' && argv[index + 1] !== undefined) {
      format = argv[index + 1]?.toLowerCase();
      index += 1;
    }
  }
  return format;
}
