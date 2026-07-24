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
