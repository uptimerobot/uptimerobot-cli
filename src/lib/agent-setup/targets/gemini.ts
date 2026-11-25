import { join } from 'node:path';
import type { AgentTargetDefinition } from '../registry.js';

/**
 * The Gemini CLI keeps `settings.json` and its saved login in `~/.gemini`,
 * merges a per-repository `.gemini/` on top, and reads a root GEMINI.md.
 * It does not honour XDG_CONFIG_HOME.
 */
export const geminiTarget: AgentTargetDefinition = {
  binaries: ['gemini'],
  id: 'gemini',
  label: 'Gemini CLI',
  /** No confirmed non-interactive way to open Gemini on a prompt with local skills. */
  launch: null,
  projectConfigPaths: ({ cwd }) => [join(cwd, '.gemini'), join(cwd, 'GEMINI.md')],
  /**
   * No install command could be established. `gemini skills install <url>` is
   * real and documented, but every documented example points at a repository
   * that *is* one skill, and nothing states how a repository holding
   * twenty-four of them under `skills/` is handled. Emitting it would be a
   * guess about the argument, not about the verb.
   */
  skillsInstaller: undefined,
  userConfigPaths: ({ probe }) => [join(probe.homeDirectory, '.gemini')],
};
