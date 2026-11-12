import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { posix, win32 } from 'node:path';
import type { AgentTarget } from '../agent-targets.js';
import { AGENT_TARGET_DEFINITIONS } from './registry.js';

/**
 * Opening the resolved coding agent on the scan, the last thing `uptimerobot
 * init` does on an interactive run.
 *
 * Every seam is injectable and nothing here ever executes a binary to find out
 * whether it exists — the same rule cli-invocation.ts and registry.ts follow,
 * for the same reason: an onboarding command must not run whatever happens to
 * sit on a user's PATH. Nothing in this module throws; a missing binary is
 * `undefined` and a failed spawn is a non-zero exit code, so `init` can always
 * fall back to the printed hint.
 */

/** Where a local skills checkout is named, when one is not passed explicitly. */
export const SKILLS_DIRECTORY_ENVIRONMENT_VARIABLE = 'UPTIMEROBOT_SKILLS_DIR';

/** Windows' documented default when PATHEXT is unset. */
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

/** A resolved command line, ready to hand to spawn as `command` plus `args`. */
export interface LaunchPlan {
  args: string[];
  command: string;
}

export interface PlanLaunchOptions {
  /** Where UPTIMEROBOT_SKILLS_DIR is read from. Defaults to the process env. */
  env?: Readonly<Record<string, string | undefined>>;
  /** An explicit skills directory; wins over the environment when non-empty. */
  skillsDir?: string;
}

/**
 * Builds the command that opens `target` on `prompt`, or null when the target
 * has no confirmed interactive launch command (everything but Claude Code).
 *
 * Pure: it decides the argument vector and resolves the skills directory, but
 * touches neither PATH nor the process. `init` calls it for every resolved
 * target so the machine envelope can describe what a launch would run even on
 * the paths that never spawn.
 */
export function planLaunch(
  target: AgentTarget,
  prompt: string,
  options: PlanLaunchOptions = {},
): LaunchPlan | null {
  const launch = AGENT_TARGET_DEFINITIONS[target].launch;
  if (!launch) return null;

  const { env = process.env, skillsDir } = options;
  const resolvedSkillsDir = firstNonEmpty(skillsDir, env[SKILLS_DIRECTORY_ENVIRONMENT_VARIABLE]);
  return {
    args: launch.args(prompt, { skillsDir: resolvedSkillsDir }),
    command: launch.binary,
  };
}

export interface ResolveAgentBinaryOptions {
  /** Where PATH, Path and PATHEXT are read from. Defaults to the process env. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Reports whether a candidate path is an executable file. */
  isExecutableFile?: (path: string) => Promise<boolean>;
  /** Decides the PATH separator and whether PATHEXT applies. */
  platform?: NodeJS.Platform;
}

/**
 * The first executable named `name` on PATH, or undefined when none is found.
 *
 * Existence and the executable bit only, never execution — a broken symlink,
 * an unreadable directory or a name shared with a directory all mean "not
 * found". Mirrors resolveCliInvocation's PATH walk so the two agree about what
 * counts as installed. Never throws.
 */
export async function resolveAgentBinary(
  name: string,
  options: ResolveAgentBinaryOptions = {},
): Promise<string | undefined> {
  const {
    env = process.env,
    isExecutableFile = isExecutableFileOnDisk,
    platform = process.platform,
  } = options;

  try {
    const windows = platform === 'win32';
    // The platform is a parameter, not a runtime fact, so Windows resolution can
    // be exercised from a POSIX test run — which is why the join is explicit.
    const path = windows ? win32 : posix;
    // Windows spells the variable inconsistently across shells and launchers.
    const directories = (env.PATH ?? env.Path ?? '')
      .split(windows ? ';' : ':')
      .filter((directory) => directory.length > 0);

    for (const directory of directories) {
      for (const candidate of executableNames(name, env, platform)) {
        const candidatePath = path.join(directory, candidate);
        // One unreadable entry must not end the search or surface as a crash.
        if (await isExecutableFile(candidatePath).catch(() => false)) return candidatePath;
      }
    }
  } catch {
    // A missing or unreadable PATH is indistinguishable from an absent binary.
    return undefined;
  }
  return undefined;
}

/** A subset of ChildProcess: enough to await one interactive session. */
export interface LaunchChildProcess {
  once(
    event: 'close',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
  once(event: 'error', listener: (error: Error) => void): this;
}

export type LaunchSpawn = (
  command: string,
  args: readonly string[],
  options: { stdio: 'inherit' },
) => LaunchChildProcess;

export interface LaunchAgentOptions {
  /** Injected in tests so the planned command is asserted, never run. */
  spawn?: LaunchSpawn;
}

/**
 * Spawns the plan with inherited stdio, so the user lands in the agent's own
 * session, and resolves with its exit code once it closes.
 *
 * Never rejects. A session that ran resolves with its exit code (an exit by
 * signal counts as 1). A session that never started, whether spawn threw or
 * emitted `error`, resolves with `undefined`, which is what lets `init` tell
 * "the agent failed" from "nothing opened, print the hint instead".
 */
export function launchAgent(
  plan: LaunchPlan,
  options: LaunchAgentOptions = {},
): Promise<number | undefined> {
  const spawnProcess = options.spawn ?? defaultSpawn;
  return new Promise((resolve) => {
    try {
      const child = spawnProcess(plan.command, plan.args, { stdio: 'inherit' });
      child.once('error', () => resolve(undefined));
      child.once('close', (code) => resolve(code ?? 1));
    } catch {
      resolve(undefined);
    }
  });
}

const defaultSpawn: LaunchSpawn = (command, args, options) => spawn(command, args, options);

/** The first value that is a non-empty string once trimmed, else undefined. */
function firstNonEmpty(...values: readonly (string | undefined)[]): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

/** Windows resolves a bare command name through PATHEXT; POSIX does not. */
function executableNames(
  name: string,
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform,
): readonly string[] {
  if (platform !== 'win32') return [name];
  const extensions = (env.PATHEXT ?? DEFAULT_PATHEXT)
    .split(';')
    .map((extension) => extension.trim())
    .filter((extension) => extension.length > 0);
  return [name, ...extensions.map((extension) => `${name}${extension}`)];
}

/**
 * Existence and the executable bit, never execution. Windows has no executable
 * bit, so the mode check degrades to existence there — which is what PATHEXT
 * already decides.
 */
async function isExecutableFileOnDisk(path: string): Promise<boolean> {
  try {
    // stat follows symlinks, so a symlinked binary counts and a dangling one
    // does not. Directories are searchable, not runnable.
    if (!(await stat(path)).isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
