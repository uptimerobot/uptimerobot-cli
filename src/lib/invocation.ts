import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { select } from '@inquirer/prompts';

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

export function confirmationAvailable(mode: InvocationMode): boolean {
  return mode === 'human' && process.stdin.isTTY === true && process.stdout.isTTY === true;
}

export async function requestConfirmation(summary: string, mode: InvocationMode): Promise<boolean> {
  if (!confirmationAvailable(mode)) return false;
  // An input that already ended will never emit the close the race below
  // waits on; it is the same no, decided before the question is printed.
  if (process.stdin.readableEnded) return false;
  const reader = createInterface({ input: process.stdin, output: process.stderr });
  try {
    // An input that ends before an answer (Ctrl-D, Ctrl-C, a closed stdin) is a
    // no, not a hang: the question would otherwise never settle.
    const answer = await Promise.race([
      reader.question(`${summary}. Continue? [y/N] `),
      new Promise<string>((resolve) => reader.once('close', () => resolve(''))),
    ]);
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    reader.close();
  }
}

/** One entry in a {@link promptSelection} list. */
export interface SelectionChoice<T extends string> {
  /** What the user reads. */
  name: string;
  /** What the caller gets back. */
  value: T;
  /** Shown under the list while the entry is highlighted. */
  description?: string;
}

/**
 * Asks the user to pick from a list, with arrow-key navigation.
 *
 * Returns undefined rather than throwing in the two cases a caller has to
 * handle anyway: no interactive terminal, and the user backing out with Escape
 * or Ctrl-C. A caller that gets undefined should say what it needs and exit,
 * exactly as it would have without a prompt at all.
 *
 * Rendered on stderr, like every other prompt here, so a redirected stdout
 * still receives only the command's real output.
 */
export async function promptSelection<T extends string>(
  message: string,
  choices: readonly SelectionChoice<T>[],
  options: { default?: T; mode?: InvocationMode } = {},
): Promise<T | undefined> {
  if (!confirmationAvailable(options.mode ?? 'human')) return undefined;
  try {
    return await select(
      {
        choices: [...choices],
        message,
        ...(options.default === undefined ? {} : { default: options.default }),
      },
      { output: process.stderr },
    );
  } catch (error) {
    // Ctrl-C and Escape are answers, not failures: the caller falls back to
    // telling the user how to choose non-interactively.
    //
    // Matched on the name rather than the class, because the class lives in
    // `@inquirer/core` — a transitive dependency of `@inquirer/prompts`, not
    // one this package declares. Importing it to get an `instanceof` would
    // mean depending on something we never asked for, and it would break the
    // day the prompts package bumps its own dependency.
    if (error instanceof Error && error.name === 'ExitPromptError') return undefined;
    throw error;
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
