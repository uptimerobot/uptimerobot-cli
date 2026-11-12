import { join } from 'node:path';
import type { AgentTargetDefinition } from '../registry.js';

/**
 * Cursor ships two executables: `cursor-agent` (the headless CLI, which is
 * what setup actually drives) and `cursor` (the editor's shell command). Both
 * count as installed, and the CLI is checked first because it is the specific
 * one. Per-user state lives in `~/.cursor`; a repository uses `.cursor/` or
 * the legacy `.cursorrules`.
 */
export const cursorTarget: AgentTargetDefinition = {
  binaries: ['cursor-agent', 'cursor'],
  id: 'cursor',
  label: 'Cursor',
  /** No confirmed non-interactive way to open Cursor on a prompt with local skills. */
  launch: null,
  projectConfigPaths: ({ cwd }) => [join(cwd, '.cursor'), join(cwd, '.cursorrules')],
  /**
   * No install command could be established. Cursor's `/add-plugin` is an
   * editor slash command and needs the plugin published to the Cursor
   * marketplace, which has not happened; Cursor staff state there is no
   * non-interactive `cursor-agent plugin install` yet. Cursor reads AGENTS.md,
   * so the fallback reaches it.
   */
  skillsInstaller: undefined,
  userConfigPaths: ({ probe }) => [join(probe.homeDirectory, '.cursor')],
};
