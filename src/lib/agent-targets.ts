/**
 * The coding agents `uptimerobot init` can set up, plus the seam that decides
 * which one a repository already uses.
 *
 * Each agent contributes two independent signals — its executable on PATH and
 * its configuration on disk — from one module under agent-setup/targets. This
 * file only orders and flattens what the registry reports.
 *
 * Runtime markers such as CLAUDECODE (see invocation.ts) deliberately do not
 * feed this: they answer "who is running me", which changes between a shell
 * and an agent session, while this answers "what is installed here".
 */

import type { AgentProbe, AgentTargetDetection } from './agent-setup/registry.js';
import {
  AGENT_TARGET_DEFINITIONS,
  detectAgentTarget,
  systemProbe,
} from './agent-setup/registry.js';

export const AGENT_TARGETS = ['claude-code', 'codex', 'cursor', 'opencode', 'gemini'] as const;

export type AgentTarget = (typeof AGENT_TARGETS)[number];

/**
 * The agent `init` leans towards when detection leaves a choice open.
 *
 * The setup flow is written and tested against Claude Code — it is the only
 * target with a confirmed launch command — so it is the sensible pre-selection
 * and the sensible answer when nobody can be asked. It is never a silent
 * override: an explicit `--target` wins, a machine with exactly one agent gets
 * that agent, and a user at a terminal with several is asked outright.
 */
export const DEFAULT_AGENT_TARGET = 'claude-code' satisfies AgentTarget;

/** Reports every agent the current machine and repository look set up for. */
export async function detectAgentTargets(
  cwd: string = process.cwd(),
  probe: AgentProbe = systemProbe(),
): Promise<readonly AgentTarget[]> {
  const detections = await detectAgentTargetDetails(cwd, probe);
  return detections.map((detection) => detection.target);
}

/**
 * The same detection, keeping the signal that identified each agent so a
 * caller can say why it chose one. Results follow AGENT_TARGETS order, never
 * the order the probes happened to answer in.
 */
export async function detectAgentTargetDetails(
  cwd: string = process.cwd(),
  probe: AgentProbe = systemProbe(),
): Promise<readonly AgentTargetDetection[]> {
  const context = { cwd, probe };
  const detections = await Promise.all(
    AGENT_TARGETS.map((target) => detectAgentTarget(AGENT_TARGET_DEFINITIONS[target], context)),
  );
  return detections.filter((detection) => detection !== undefined);
}
