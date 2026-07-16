import type { InvocationMode } from '../lib/invocation.js';
import type { FlagValues } from '../lib/types.js';

export type OutputFormat = 'json' | 'jsonl' | 'plain' | 'table';

export function resolveFormat(flags: FlagValues, mode: InvocationMode): OutputFormat {
  if (flags.raw === true) return 'json';
  if (typeof flags.format === 'string') return flags.format as OutputFormat;
  if (flags.json === true || process.env.UPTIMEROBOT_OUTPUT === 'json') return 'json';
  if (mode === 'agent' || process.stdout.isTTY !== true) return 'json';
  return 'table';
}
