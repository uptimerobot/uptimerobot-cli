import { access, constants, stat } from 'node:fs/promises';
import { posix, win32 } from 'node:path';

/**
 * How to call this CLI on the machine `init` happens to run on.
 *
 * Setup files are written once and read by the agent forever after, so the
 * invocation is resolved at plant time and templated into every emitted
 * instruction. Someone who ran `npx @uptimerobot/cli init` has no
 * `uptimerobot` on PATH, and must not be left with a repository full of
 * commands their agent cannot run.
 */

/** The bin name declared in package.json (`bin.uptimerobot`). */
export const CLI_BINARY_NAME = 'uptimerobot';

/** The published package name (`name` in package.json), used for the npx form. */
export const CLI_PACKAGE_NAME = '@uptimerobot/cli';

/**
 * Overrides resolution outright, for setups no PATH lookup can describe —
 * a workspace runner such as `pnpm --silent uptimerobot`, or a wrapper script.
 */
export const CLI_COMMAND_ENVIRONMENT_VARIABLE = 'UPTIMEROBOT_CLI_COMMAND';

/** Windows' documented default when PATHEXT is unset. */
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

export type CliInvocationSource = 'npx' | 'override' | 'path';

/** How to invoke this CLI on this machine. */
export interface CliInvocation {
  /** Ready-to-paste prefix, e.g. `uptimerobot` or `npx @uptimerobot/cli`. */
  command: string;
  /** The executable that was found, when resolution came from PATH. */
  resolvedPath?: string;
  /** How `command` was decided — for diagnostics and for tests. */
  source: CliInvocationSource;
}

export interface CliInvocationOptions {
  /** Where PATH, PATHEXT and the override are read from. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Reports whether a candidate path is an executable file. */
  isExecutableFile?: (path: string) => Promise<boolean>;
  /** Decides the PATH separator and whether PATHEXT applies. */
  platform?: NodeJS.Platform;
}

/**
 * Picks the shortest invocation that actually works here: an explicit
 * override, else a bare `uptimerobot` when one sits on PATH, else the npx
 * form. Every seam is injectable so both branches stay testable on a machine
 * that does or does not have the CLI installed.
 *
 * This never throws. A missing PATH, an unreadable directory or a broken
 * symlink falls through to the npx form, which needs nothing installed.
 */
export async function resolveCliInvocation(
  options: CliInvocationOptions = {},
): Promise<CliInvocation> {
  const {
    env = process.env,
    isExecutableFile = isExecutableFileOnDisk,
    platform = process.platform,
  } = options;

  try {
    const override = env[CLI_COMMAND_ENVIRONMENT_VARIABLE]?.trim();
    if (override) return { command: override, source: 'override' };

    for (const candidate of pathCandidates(env, platform)) {
      // One unreadable entry must not end the search, and must never surface
      // as a crash out of an onboarding command.
      const executable = await isExecutableFile(candidate).catch(() => false);
      if (executable) return { command: CLI_BINARY_NAME, resolvedPath: candidate, source: 'path' };
    }
  } catch {
    // Anything unexpected resolves to the form that works without an install.
  }

  return { command: `npx ${CLI_PACKAGE_NAME}`, source: 'npx' };
}

/**
 * Templates a bare subcommand into a full invocation, e.g. `monitors list
 * --json` -> `npx @uptimerobot/cli monitors list --json`.
 *
 * Only the ends are trimmed. Runs of whitespace inside the subcommand are
 * left alone because they can sit inside a quoted argument, and collapsing
 * them would silently rewrite the command.
 */
export function formatInvocation(invocation: CliInvocation, subcommand: string): string {
  const trimmed = subcommand.trim();
  return trimmed ? `${invocation.command} ${trimmed}` : invocation.command;
}

/**
 * Every path a shell would consider for the bin name, in the order the shell
 * would consider it. The platform is a parameter rather than a runtime fact so
 * Windows resolution can be exercised from a POSIX test run.
 */
function* pathCandidates(
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform,
): Generator<string> {
  const windows = platform === 'win32';
  const path = windows ? win32 : posix;
  // A snapshot of a Windows environment loses the case-insensitive lookup
  // `process.env` provides there, so the usual spelling is accepted too.
  const directories = (env.PATH ?? env.Path ?? '').split(windows ? ';' : ':');
  const extensions = windows ? executableExtensions(env) : [''];

  for (const directory of directories) {
    // An empty PATH entry means "the current directory" on POSIX. Honouring
    // that would let a stray ./uptimerobot decide what gets written into the
    // repository's setup files, so it is skipped.
    const trimmed = windows ? directory.trim().replace(/^"|"$/g, '') : directory;
    if (!trimmed) continue;
    for (const extension of extensions) {
      yield path.join(trimmed, `${CLI_BINARY_NAME}${extension}`);
    }
  }
}

/**
 * PATHEXT in shell order, with the extension-less name last: npm plants a
 * bare shell shim beside the `.cmd` one, but cmd.exe runs the `.cmd`.
 */
function executableExtensions(env: Readonly<Record<string, string | undefined>>): string[] {
  const configured = env.PATHEXT?.trim() || DEFAULT_PATHEXT;
  const extensions = configured
    .split(';')
    .map((extension) => extension.trim())
    .filter(Boolean)
    .map((extension) => (extension.startsWith('.') ? extension : `.${extension}`));
  return [...extensions, ''];
}

/**
 * Existence and the executable bit, never execution: setup must not run an
 * arbitrary binary that merely shares a name with this CLI. Windows has no
 * executable bit, so the mode check degrades to existence there — which is
 * what PATHEXT already decides.
 */
async function isExecutableFileOnDisk(path: string): Promise<boolean> {
  try {
    // stat follows symlinks, so a broken link reports missing rather than
    // resolving to a command that cannot run.
    if (!(await stat(path)).isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
