import { join } from 'node:path';
import type { AgentTargetDefinition } from '../registry.js';

/**
 * OpenCode is the one target that follows the XDG base directory spec, so its
 * per-user config is resolved the same way credential-store.ts resolves this
 * CLI's own: XDG_CONFIG_HOME when set, `~/.config` otherwise.
 */
export const opencodeTarget: AgentTargetDefinition = {
  binaries: ['opencode'],
  id: 'opencode',
  label: 'OpenCode',
  /** No confirmed non-interactive way to open OpenCode on a prompt with local skills. */
  launch: null,
  projectConfigPaths: ({ cwd }) => [
    join(cwd, '.opencode'),
    join(cwd, 'opencode.json'),
    join(cwd, 'opencode.jsonc'),
  ],
  /**
   * Confirmed absent rather than merely unfound: OpenCode has no skill or
   * plugin install command at all. Skills are discovered by dropping files
   * into `.opencode/skills/`, and plugins are declared in `opencode.json`.
   * OpenCode reads AGENTS.md, so the fallback reaches it.
   */
  skillsInstaller: undefined,
  userConfigPaths: ({ probe }) => {
    const configHome = probe.env.XDG_CONFIG_HOME;
    return [
      configHome ? join(configHome, 'opencode') : join(probe.homeDirectory, '.config', 'opencode'),
    ];
  },
};
