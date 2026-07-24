import { join } from 'node:path';
import type { AgentTargetDefinition } from '../registry.js';

/**
 * The Codex CLI keeps `config.toml` and its saved login under `~/.codex`,
 * relocated by CODEX_HOME.
 *
 * AGENTS.md is deliberately not a signal: Codex, Cursor, OpenCode and Gemini
 * all read it, so it identifies no single agent.
 */
export const codexTarget: AgentTargetDefinition = {
  binaries: ['codex'],
  id: 'codex',
  label: 'Codex CLI',
  /** No confirmed non-interactive way to open Codex on a prompt with local skills. */
  launch: null,
  projectConfigPaths: ({ cwd }) => [join(cwd, '.codex')],
  /**
   * No install command could be established. The UptimeRobot plugin's README
   * documents `codex plugin marketplace add ./`, but OpenAI's own
   * documentation describes a `$skill-installer` prompt inside Codex instead
   * and lists no `codex plugin` subcommand. Two sources disagreeing is not a
   * command worth printing, so Codex takes the AGENTS.md fallback — which it
   * reads natively.
   */
  skillsInstaller: undefined,
  userConfigPaths: ({ probe }) => {
    const override = probe.env.CODEX_HOME;
    return override ? [override] : [join(probe.homeDirectory, '.codex')];
  },
};
