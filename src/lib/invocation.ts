import { createInterface } from 'node:readline/promises';
import type { OperationDefinition } from './types.js';

export type ExecutionEnvironment = 'ci' | 'local';
export type InvocationMode = 'agent' | 'human';

/** Environment variables set by known coding-agent runtimes. */
export const AGENT_ENVIRONMENT_VARIABLES = ['CLAUDECODE', 'CODEX_SANDBOX', 'CURSOR_AGENT'] as const;

export function isCI(): boolean {
  return /^(1|true|yes)$/i.test(process.env.CI ?? '');
}

/**
 * The single source of truth for agent-driven execution. UPTIMEROBOT_AGENT is
 * an explicit override in both directions; otherwise a known agent runtime's
 * environment marker decides.
 */
export function agentEnvironmentDetected(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const override = env.UPTIMEROBOT_AGENT;
  if (override !== undefined) return /^(1|true|yes)$/i.test(override);
  return AGENT_ENVIRONMENT_VARIABLES.some((name) => env[name]);
}

export function detectInvocationMode(
  agentFlag: boolean,
  env: Readonly<Record<string, string | undefined>> = process.env,
): InvocationMode {
  return agentFlag || agentEnvironmentDetected(env) ? 'agent' : 'human';
}

export async function requestConfirmation(
  operation: OperationDefinition,
  mode: InvocationMode,
): Promise<boolean> {
  if (mode === 'agent' || !process.stdin.isTTY || !process.stdout.isTTY) return false;
  const reader = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await reader.question(`${operation.summary}. Continue? [y/N] `);
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    reader.close();
  }
}
