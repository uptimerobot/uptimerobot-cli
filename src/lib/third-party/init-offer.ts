/**
 * The third-party offer `uptimerobot init` makes at a terminal: the same
 * proposal, question and creates `scan --apply` runs, made inline before the
 * agent starts, and the record of what came of it in the seed file so the
 * agent never creates those services again.
 *
 * Everything here is free of the command: it takes a logger and returns
 * data, so the gate, the outcome block and the carry-over of an earlier block
 * can be tested without the CLI harness.
 */
import { ApiFailure } from '../../api/errors.js';
import { type CliInvocation, formatInvocation } from '../agent-setup/cli-invocation.js';
import type { ApiAccess } from '../auth.js';
import { type InvocationMode, requestConfirmation } from '../invocation.js';
import type { SeedContext } from '../scan/index.js';
import {
  type ApplyRun,
  type Confirmation,
  type CreateResult,
  type Proposal,
  formatProposal,
  formatSummary,
  runApply,
} from './apply.js';
import type { ResolvedCandidate } from './resolve.js';

/** One row of the proposal as the seed file records it: enough to say what not to create again. */
export interface OfferRow {
  readonly provider: string;
  readonly status: ResolvedCandidate['status'];
}

export type OfferOutcome =
  /** The failure that stopped the offer; init goes on to the agent setup regardless. */
  | { kind: 'failed'; error: { code: string; message: string } }
  | {
      kind: 'completed';
      confirmation: Confirmation;
      proposal: readonly OfferRow[];
      results: readonly CreateResult[];
      /** Why nothing was created although confirmed (a partial tracked set), else null. */
      blocked: { code: string; message: string } | null;
    };

/** Why the offer was or was not made; `scan --apply` helps only where someone else could run it. */
export type OfferDecision =
  | 'offer'
  | 'opted-out'
  | 'nothing-to-offer'
  | 'not-interactive'
  | 'foreign-seed-file';

export function decideOffer(options: {
  interactive: boolean;
  optedOut: boolean;
  hasRuntimeCandidates: boolean;
  /** The seed file on disk before this run, when any. */
  previousSeed: string | undefined;
  seedBeginPrefix: string;
}): OfferDecision {
  if (options.optedOut) return 'opted-out';
  if (!options.hasRuntimeCandidates) return 'nothing-to-offer';
  if (!options.interactive) return 'not-interactive';
  // The write after the creates would fail on a file that is not ours and
  // leave them unrecorded, so a foreign file means no offer at all.
  if (
    options.previousSeed !== undefined &&
    !options.previousSeed.startsWith(options.seedBeginPrefix)
  ) {
    return 'foreign-seed-file';
  }
  return 'offer';
}

/** Whether the handoff should point at `scan --apply`: only when another run could make the offer. */
export function wantsApplyHint(decision: OfferDecision): boolean {
  return decision === 'not-interactive' || decision === 'foreign-seed-file';
}

export interface OfferIo {
  log(line: string): void;
}

/**
 * Prints the proposal, asks once, creates on yes, prints the summary. A
 * failure while resolving is reported and returned, never thrown: the agent
 * setup is the point of the command, and the agent can run `scan --apply`.
 */
export async function offerThirdParty(options: {
  context: SeedContext;
  access: ApiAccess;
  mode: InvocationMode;
  invocation: CliInvocation;
  io: OfferIo;
}): Promise<OfferOutcome> {
  const { io, invocation } = options;
  const confirm = async (proposal: Proposal, toCreate: number): Promise<Confirmation> => {
    for (const line of formatProposal(proposal)) io.log(line);
    const noun = toCreate === 1 ? 'service' : 'services';
    const yes = await requestConfirmation(
      `Create ${toCreate} third-party ${noun} now`,
      options.mode,
    );
    return yes ? 'confirmed' : 'declined';
  };
  let run: ApplyRun;
  try {
    run = await runApply({
      candidates: options.context.thirdParty.candidates,
      selection: { only: [], skip: [], includeBuildTime: false },
      access: options.access,
      confirmFlag: false,
      confirm,
    });
  } catch (error) {
    if (!(error instanceof ApiFailure)) throw error;
    const failure = { code: error.cliError.code, message: error.cliError.message };
    io.log(`Third-party services were not resolved (${failure.code}): ${failure.message}`);
    io.log('');
    return { kind: 'failed', error: failure };
  }
  if (run.confirmation === 'not-needed')
    for (const line of formatProposal(run.proposal)) io.log(line);
  for (const line of formatSummary(run.proposal.proposal, run.results, run.confirmation))
    io.log(line);
  if (run.blocked !== undefined) io.log(run.blocked.message);
  if (run.failure !== undefined) io.log(run.failure.cliError.message);
  if (run.proposal.proposal.some((row) => row.status === 'ambiguous')) {
    io.log(
      `Settle an ambiguous row with \`${formatInvocation(invocation, 'scan --apply --only <provider>=<id>')}\`.`,
    );
  }
  io.log('');
  return {
    kind: 'completed',
    confirmation: run.confirmation,
    proposal: run.proposal.proposal.map(({ provider, status }) => ({ provider, status })),
    results: run.results,
    blocked:
      run.blocked === undefined ? null : { code: run.blocked.code, message: run.blocked.message },
  };
}

// --- The outcome block in the seed file ------------------------------------

/**
 * The block's own markers, so a later run that makes no offer can carry it
 * over whatever its heading says. A persisted format: change with care.
 */
export const OUTCOME_BEGIN_MARKER = '<!-- uptimerobot:scan:third-party-outcome:begin -->';
export const OUTCOME_END_MARKER = '<!-- uptimerobot:scan:third-party-outcome:end -->';

function notCreatedReason(options: {
  blocked: { code: string } | null;
  confirmation: Confirmation;
  failed: boolean;
}): string {
  if (options.blocked !== null) return options.blocked.code;
  if (options.confirmation === 'declined') return 'declined at the prompt';
  if (options.failed) return 'not attempted after the failure above';
  return 'not confirmed';
}

/** What the offer did, for the seed file: the agent must not create these again. */
export function renderOutcome(outcome: OfferOutcome, invocation: CliInvocation): readonly string[] {
  const lines = [
    OUTCOME_BEGIN_MARKER,
    `### Outcome of \`${formatInvocation(invocation, 'init')}\``,
    '',
  ];
  if (outcome.kind === 'failed') {
    return [
      ...lines,
      `Not resolved (${outcome.error.code}): ${outcome.error.message}. Run \`${formatInvocation(invocation, 'scan --apply')}\` to retry.`,
      OUTCOME_END_MARKER,
    ];
  }
  const { confirmation, proposal, results, blocked } = outcome;
  const byResult = (status: CreateResult['status']): string[] =>
    results.filter((item) => item.status === status).map((item) => item.provider);
  const byRow = (status: ResolvedCandidate['status']): string[] =>
    proposal.filter((row) => row.status === status).map((row) => row.provider);
  const created = results.flatMap((item) =>
    item.status === 'created' ? [`${item.provider} (monitor ${item.monitorId ?? 'unknown'})`] : [],
  );
  const failed = results.flatMap((item) =>
    item.status === 'failed' ? [`${item.provider} (${item.error.message})`] : [],
  );
  const attempted = new Set(results.map((item) => item.provider));
  const notAttempted = byRow('create').filter((provider) => !attempted.has(provider));
  if (confirmation !== 'confirmed' || blocked !== null) lines.push('Nothing was created.');
  if (created.length > 0) lines.push(`Created: ${created.join(', ')}.`);
  const tracked = [...byRow('already-tracked'), ...byResult('already-tracked')];
  if (tracked.length > 0) lines.push(`Already tracked: ${tracked.join(', ')}.`);
  if (failed.length > 0) lines.push(`Not created: ${failed.join(', ')}.`);
  if (notAttempted.length > 0) {
    const reason = notCreatedReason({ blocked, confirmation, failed: failed.length > 0 });
    lines.push(`Not created: ${notAttempted.join(', ')} (${reason}).`);
  }
  const missing = byRow('not-in-catalog');
  if (missing.length > 0) lines.push(`Not in catalog: ${missing.join(', ')}.`);
  const over = byRow('over-allowance');
  if (over.length > 0) lines.push(`Over allowance: ${over.join(', ')}.`);
  const ambiguous = byRow('ambiguous');
  if (ambiguous.length > 0) {
    lines.push(
      `Ambiguous, settle with \`${formatInvocation(invocation, 'scan --apply --only <provider>=<id>')}\`: ${ambiguous.join(', ')}.`,
    );
  }
  return [...lines, OUTCOME_END_MARKER];
}

/**
 * The outcome block an earlier run left in our own seed file, markers
 * included, so a run that makes no offer keeps it. The last block wins when
 * a file somehow holds two; none when either marker is missing.
 */
export function carryOverOutcome(previousSeed: string | undefined): readonly string[] {
  if (previousSeed === undefined) return [];
  const start = previousSeed.lastIndexOf(OUTCOME_BEGIN_MARKER);
  if (start === -1) return [];
  const end = previousSeed.indexOf(OUTCOME_END_MARKER, start);
  if (end === -1) return [];
  return previousSeed.slice(start, end + OUTCOME_END_MARKER.length).split('\n');
}
