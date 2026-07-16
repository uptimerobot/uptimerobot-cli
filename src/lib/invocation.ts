import { createInterface } from 'node:readline/promises';
import type { OperationDefinition } from './types.js';

export type ExecutionEnvironment = 'ci' | 'local';
export type InvocationMode = 'agent' | 'human';

export function isCI(): boolean {
  return /^(1|true|yes)$/i.test(process.env.CI ?? '');
}

export function detectInvocationMode(agentFlag: boolean): InvocationMode {
  if (agentFlag) return 'agent';
  if (process.env.UPTIMEROBOT_AGENT !== undefined) {
    return /^(1|true|yes)$/i.test(process.env.UPTIMEROBOT_AGENT) ? 'agent' : 'human';
  }
  return ['CLAUDECODE', 'CODEX_SANDBOX', 'CURSOR_AGENT'].some((name) => process.env[name])
    ? 'agent'
    : 'human';
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
