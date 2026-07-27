import { emitKeypressEvents } from 'node:readline';
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

/**
 * Prompts for a secret on stderr with masked echo. Returns undefined when
 * there is no interactive terminal, so callers can fail with guidance instead.
 */
export async function promptSecret(question: string): Promise<string | undefined> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) return undefined;
  process.stderr.write(question);
  return new Promise((resolve) => {
    let secret = '';
    const finish = (value: string | undefined, exitCode?: number) => {
      process.stdin.setRawMode(false);
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.pause();
      process.stderr.write('\n');
      if (exitCode !== undefined) process.exit(exitCode);
      resolve(value);
    };
    const onKeypress = (str: string, key: { ctrl?: boolean; name?: string }) => {
      if (key.ctrl && key.name === 'c') return finish(undefined, 130);
      if (key.name === 'return') return finish(secret.trim() || undefined);
      if (key.name === 'backspace') {
        if (secret.length > 0) {
          secret = [...secret].slice(0, -1).join('');
          process.stderr.write('\b \b');
        }
        return;
      }
      if (str === '' || str < ' ') return; // arrows, escape sequences, control keys
      secret += str;
      process.stderr.write('*'.repeat([...str].length));
    };
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', onKeypress);
  });
}
