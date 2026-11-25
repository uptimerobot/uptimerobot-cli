import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentTarget } from '../agent-targets.js';
import { claudeCodeTarget } from './targets/claude-code.js';
import { codexTarget } from './targets/codex.js';
import { cursorTarget } from './targets/cursor.js';
import { geminiTarget } from './targets/gemini.js';
import { opencodeTarget } from './targets/opencode.js';

/**
 * Every machine fact detection is allowed to read, as one injectable object.
 * Tests describe a machine instead of inheriting whichever agents the
 * developer running them happens to have installed.
 */
export interface AgentProbe {
  env: Readonly<Record<string, string | undefined>>;
  /** True when the path exists once symlinks have been followed. */
  exists(path: string): Promise<boolean>;
  homeDirectory: string;
  /** True when the path is a file the current user is allowed to execute. */
  isExecutable(path: string): Promise<boolean>;
  platform: NodeJS.Platform;
}

/** What a target module is asked about: one machine and one project directory. */
export interface AgentDetectionContext {
  readonly cwd: string;
  readonly probe: AgentProbe;
}

/**
 * An agent's own way to install the UptimeRobot skills.
 *
 * Only paths that were confirmed to work are recorded. A command that does not
 * exist is worse than no command at all, because the person running it cannot
 * tell our mistake from their broken install — so a target whose installer
 * could not be established carries `undefined` and falls back to a planted
 * AGENTS.md section instead.
 */
export interface SkillsInstaller {
  /** Where the syntax was confirmed, so a stale command can be traced back. */
  readonly documentationUrl: string;
  /** What happens after the steps — a reload, a menu, a caveat worth knowing. */
  readonly followUp?: string;
  /** Verbatim commands, in the order they must run. Never templated. */
  readonly steps: readonly string[];
}

/** What an agent's launch arg-builder may vary on. */
export interface AgentLaunchOptions {
  /** A local skills directory to load, e.g. Claude Code's `--plugin-dir`. */
  readonly skillsDir?: string;
}

/**
 * How to open an agent on the scan, interactively, in the session the user
 * lands in.
 *
 * Only paths confirmed to open an *interactive* session are recorded — never a
 * headless or print mode. Claude Code is the one target with such a flag today,
 * so every other target carries `null` (see each target module). Required
 * rather than optional so a newly registered agent cannot be left silently
 * unlaunchable.
 */
export interface AgentLaunch {
  /** The argument vector after the binary. Fresh array each call. */
  readonly args: (prompt: string, options: AgentLaunchOptions) => string[];
  /** Executable resolved on PATH and run. Never executed to probe for it. */
  readonly binary: string;
}

/**
 * Everything the rest of agent setup needs to know about one coding agent.
 * Adding an agent is a new module here plus its entry in
 * AGENT_TARGET_DEFINITIONS — the Record type makes a missing entry a
 * compile error rather than a silently unsupported target.
 */
export interface AgentTargetDefinition {
  /** Executables looked up on PATH, most specific first. Any one counts. */
  readonly binaries: readonly string[];
  readonly id: AgentTarget;
  /** Name for people; ids stay machine-facing. */
  readonly label: string;
  /**
   * How `uptimerobot init` opens this agent on the scan, or null when no
   * interactive launch command has been confirmed. Required rather than
   * optional so a newly registered agent cannot be left silently undecided.
   */
  readonly launch: AgentLaunch | null;
  /** Absolute paths meaning this repository is already set up for the agent. */
  projectConfigPaths(context: AgentDetectionContext): readonly string[];
  /**
   * How this agent installs the UptimeRobot skills itself, or undefined when
   * no such path has been confirmed. Required rather than optional so a newly
   * registered agent cannot be left silently undecided.
   */
  readonly skillsInstaller: SkillsInstaller | undefined;
  /** Absolute paths meaning the agent is configured for this user. */
  userConfigPaths(context: AgentDetectionContext): readonly string[];
}

/** A detected agent and the signal that found it, so callers can explain it. */
export interface AgentTargetDetection {
  /** Set when the executable was resolved from PATH. */
  binaryPath?: string;
  /** Set when only configuration was found. */
  configPath?: string;
  target: AgentTarget;
}

export const AGENT_TARGET_DEFINITIONS: Readonly<Record<AgentTarget, AgentTargetDefinition>> = {
  'claude-code': claudeCodeTarget,
  codex: codexTarget,
  cursor: cursorTarget,
  gemini: geminiTarget,
  opencode: opencodeTarget,
};

/**
 * The real machine. Overrides replace one fact at a time so a test can keep
 * the genuine filesystem while pointing PATH and the home directory at a
 * temporary tree.
 */
export function systemProbe(overrides: Partial<AgentProbe> = {}): AgentProbe {
  return {
    env: process.env,
    exists: pathExists,
    homeDirectory: homedir(),
    isExecutable: executableFileExists,
    platform: process.platform,
    ...overrides,
  };
}

/**
 * Looks for one agent: an executable on PATH first, then its configuration.
 * The binary is never run — an onboarding command must not execute whatever
 * happens to sit on a user's PATH — so presence is decided by the executable
 * bit alone. Absent, unreadable and broken all mean "not detected"; this
 * never throws.
 */
export async function detectAgentTarget(
  definition: AgentTargetDefinition,
  context: AgentDetectionContext,
): Promise<AgentTargetDetection | undefined> {
  try {
    const binaryPath = await resolveOnPath(definition.binaries, context.probe);
    if (binaryPath !== undefined) return { binaryPath, target: definition.id };

    const configPath = await firstExisting(
      [...definition.userConfigPaths(context), ...definition.projectConfigPaths(context)],
      context.probe,
    );
    return configPath === undefined ? undefined : { configPath, target: definition.id };
  } catch {
    // A probe that fails is indistinguishable from an agent that is absent.
    return undefined;
  }
}

async function resolveOnPath(
  names: readonly string[],
  probe: AgentProbe,
): Promise<string | undefined> {
  const separator = probe.platform === 'win32' ? ';' : ':';
  // Windows spells the variable inconsistently across shells and launchers.
  const directories = (probe.env.PATH ?? probe.env.Path ?? '')
    .split(separator)
    .filter((directory) => directory.length > 0);

  for (const name of names) {
    for (const directory of directories) {
      for (const candidate of executableNames(name, probe)) {
        if (await probe.isExecutable(join(directory, candidate))) {
          return join(directory, candidate);
        }
      }
    }
  }
  return undefined;
}

/** Windows resolves a bare command name through PATHEXT; POSIX does not. */
function executableNames(name: string, probe: AgentProbe): readonly string[] {
  if (probe.platform !== 'win32') return [name];
  const extensions = (probe.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((extension) => extension.trim())
    .filter((extension) => extension.length > 0);
  return [name, ...extensions.map((extension) => `${name}${extension}`)];
}

async function firstExisting(
  paths: readonly string[],
  probe: AgentProbe,
): Promise<string | undefined> {
  for (const path of paths) {
    if (await probe.exists(path)) return path;
  }
  return undefined;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    // Missing, unreadable, or a symlink with no target.
    return false;
  }
}

async function executableFileExists(path: string): Promise<boolean> {
  try {
    // stat follows symlinks, so a symlinked executable counts and a dangling
    // one does not. Directories are searchable, not runnable.
    if (!(await stat(path)).isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
