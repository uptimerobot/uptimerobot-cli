import { join } from 'node:path';
import type { AgentTargetDefinition } from '../registry.js';

/**
 * Claude Code installs a single `claude` executable and keeps per-user state
 * in `~/.claude` (plus the legacy `~/.claude.json`), which CLAUDE_CONFIG_DIR
 * relocates wholesale. A repository advertises itself with `.claude/` or a
 * root CLAUDE.md.
 */
export const claudeCodeTarget: AgentTargetDefinition = {
  binaries: ['claude'],
  id: 'claude-code',
  label: 'Claude Code',
  /**
   * `claude "<prompt>"` opens an interactive session seeded with the prompt;
   * `--plugin-dir` (a documented flag) loads a local skills checkout first when
   * one was provided. Never `-p`/`--print`: that is Claude Code's headless mode,
   * and launch must always drop the user into a session they can steer.
   */
  launch: {
    args: (prompt, { skillsDir }) => (skillsDir ? ['--plugin-dir', skillsDir, prompt] : [prompt]),
    binary: 'claude',
  },
  projectConfigPaths: ({ cwd }) => [join(cwd, '.claude'), join(cwd, 'CLAUDE.md')],
  /**
   * The only UptimeRobot install path that works today. `--plugin-dir` is a
   * documented Claude Code flag and github.com/uptimerobot/ai carries the
   * `.claude-plugin/plugin.json` it expects.
   *
   * The marketplace form the plugin's README suggests
   * (`claude plugin marketplace add` / `claude plugin install
   * uptimerobot@claude-community`) is deliberately not emitted: the repository
   * publishes no `.claude-plugin/marketplace.json`, and the community
   * marketplace has no uptimerobot entry yet, so both halves fail today.
   */
  skillsInstaller: {
    documentationUrl: 'https://github.com/uptimerobot/ai#claude-code',
    followUp:
      'That loads the plugin for the session it starts. Run `/plugin` inside Claude Code to confirm it is listed. A marketplace listing that survives restarts has not shipped yet.',
    steps: ['git clone https://github.com/uptimerobot/ai.git', 'claude --plugin-dir ./ai'],
  },
  userConfigPaths: ({ probe }) => {
    const override = probe.env.CLAUDE_CONFIG_DIR;
    if (override) return [override];
    return [join(probe.homeDirectory, '.claude'), join(probe.homeDirectory, '.claude.json')];
  },
};
