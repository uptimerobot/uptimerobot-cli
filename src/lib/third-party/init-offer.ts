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
  plain,
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
      /** Why the input was refused before anyone was asked (`INVALID_INPUT`), else null. */
      blocked: { code: string; message: string } | null;
    };

/** Why the offer was or was not made; `scan --apply` helps only where someone else could run it. */
export type OfferDecision =
  | 'offer'
  | 'opted-out'
  | 'nothing-to-offer'
  | 'not-interactive'
  | 'foreign-seed-file'
  | 'seed-unwritable';

export function decideOffer(options: {
  interactive: boolean;
  optedOut: boolean;
  hasRuntimeCandidates: boolean;
  /** The seed file on disk before this run, when any. */
  previousSeed: string | undefined;
  seedBeginPrefix: string;
  /** Whether the seed file, or its directory when absent, can be written. */
  seedWritable: boolean;
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
  // Creating first and failing to record it afterwards is the one order this
  // flow must never take; a file that cannot be written is checked up front.
  if (!options.seedWritable) return 'seed-unwritable';
  return 'offer';
}

/** Whether the handoff should point at `scan --apply`: only when another run could make the offer. */
export function wantsApplyHint(decision: OfferDecision): boolean {
  return (
    decision === 'not-interactive' ||
    decision === 'foreign-seed-file' ||
    decision === 'seed-unwritable'
  );
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
    io.log(`Third-party services were not resolved (${failure.code}): ${plain(failure.message)}`);
    io.log('');
    return { kind: 'failed', error: failure };
  }
  if (run.confirmation === 'not-needed')
    for (const line of formatProposal(run.proposal)) io.log(line);
  for (const line of formatSummary(run.proposal.proposal, run.results, run.confirmation))
    io.log(line);
  if (run.blocked !== undefined) io.log(plain(run.blocked.message));
  if (run.failure !== undefined) io.log(plain(run.failure.cliError.message));
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

/** Text from the API in the block: one line, no control characters, and no `<`, so no marker can form. */
function blockText(text: string): string {
  return plain(text).replaceAll('<', '&lt;');
}

/**
 * What the offer did, for the seed file: the agent must not create these again.
 * A failed resolution says nothing about what an earlier run created, so the
 * durable lines of the block in `previousSeed` stay under the failure.
 */
export function renderOutcome(
  outcome: OfferOutcome,
  invocation: CliInvocation,
  previousSeed?: string,
): readonly string[] {
  const lines = [
    OUTCOME_BEGIN_MARKER,
    `### Outcome of \`${formatInvocation(invocation, 'init')}\``,
    '',
  ];
  if (outcome.kind === 'failed') {
    return [
      ...lines,
      `Not resolved (${outcome.error.code}): ${blockText(outcome.error.message)}. Run \`${formatInvocation(invocation, 'scan --apply')}\` to retry.`,
      ...carryOverOutcome(previousSeed).filter((line) => DURABLE_LINE.test(line)),
      OUTCOME_END_MARKER,
    ];
  }
  const { confirmation, proposal, results, blocked } = outcome;
  const byRow = (status: ResolvedCandidate['status']): string[] =>
    proposal.filter((row) => row.status === status).map((row) => row.provider);
  const withError = (status: 'failed' | 'unknown'): string[] =>
    results.flatMap((item) =>
      item.status === status ? [`${item.provider} (${blockText(item.error.message)})`] : [],
    );
  const created = results.flatMap((item) =>
    item.status === 'created' ? [`${item.provider} (monitor ${item.monitorId})`] : [],
  );
  const unknown = withError('unknown');
  const failed = withError('failed');
  const attempted = new Set(results.map((item) => item.provider));
  const notAttempted = byRow('create').filter((provider) => !attempted.has(provider));
  if (confirmation !== 'confirmed' || blocked !== null) lines.push('Nothing was created.');
  // A provider this run says nothing durable about keeps what the earlier
  // block said: an unresolved or re-proposed row does not undo a create.
  const earlier = durableEntries(carryOverOutcome(previousSeed));
  const settled = new Set([
    ...results.flatMap((item) => (item.status === 'created' ? [item.provider] : [])),
    ...byRow('already-tracked'),
  ]);
  const kept = (prefix: DurablePrefix): string[] =>
    earlier
      .filter((entry) => entry.prefix === prefix && !settled.has(entry.provider))
      .map((entry) => entry.text);
  const allCreated = [...created, ...kept('Created')];
  if (allCreated.length > 0) lines.push(`Created: ${allCreated.join(', ')}.`);
  const tracked = [...byRow('already-tracked'), ...kept('Already tracked')];
  if (tracked.length > 0) lines.push(`Already tracked: ${tracked.join(', ')}.`);
  if (unknown.length > 0) {
    lines.push(
      `Outcome unknown, the API may have created it, run \`${formatInvocation(invocation, 'scan --apply')}\` to check: ${unknown.join(', ')}.`,
    );
  }
  if (failed.length > 0) lines.push(`Not created: ${failed.join(', ')}.`);
  if (notAttempted.length > 0) {
    const reason = notCreatedReason({
      blocked,
      confirmation,
      failed: failed.length > 0 || unknown.length > 0,
    });
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
  const unresolved = byRow('unresolved');
  if (unresolved.length > 0) {
    lines.push(
      `Unresolved, retry with \`${formatInvocation(invocation, 'scan --apply')}\`: ${unresolved.join(', ')}.`,
    );
  }
  return [...lines, OUTCOME_END_MARKER];
}

/** The only lines of an earlier block that stay true: a service created or found tracked is still there. */
const DURABLE_LINE = /^(Created|Already tracked): /;

type DurablePrefix = 'Created' | 'Already tracked';

/** One provider's entry on a durable line, as written: `Stripe (monitor 5)` or `Vercel`. */
function durableEntries(
  lines: readonly string[],
): { prefix: DurablePrefix; provider: string; text: string }[] {
  return lines.flatMap((line) => {
    const match = /^(Created|Already tracked): (.*)\.$/.exec(line);
    if (match === null) return [];
    const prefix: DurablePrefix = match[1] === 'Created' ? 'Created' : 'Already tracked';
    return (match[2] ?? '').split(', ').map((text) => ({
      prefix,
      provider: text.split(' (')[0] ?? text,
      text,
    }));
  });
}

/**
 * The durable part of the outcome block an earlier run left in our own seed
 * file, so a run that makes no offer keeps what was created. Declines,
 * failures and ambiguities are not carried: the next run or `scan --apply`
 * settles them afresh. The last block wins when a file somehow holds two;
 * nothing is carried when either marker is missing or no line is durable.
 */
export function carryOverOutcome(previousSeed: string | undefined): readonly string[] {
  if (previousSeed === undefined) return [];
  const start = previousSeed.lastIndexOf(OUTCOME_BEGIN_MARKER);
  if (start === -1) return [];
  const end = previousSeed.indexOf(OUTCOME_END_MARKER, start);
  if (end === -1) return [];
  const lines = previousSeed.slice(start, end).split('\n');
  const heading = lines.find((line) => line.startsWith('### '));
  const durable = lines.filter((line) => DURABLE_LINE.test(line));
  if (heading === undefined || durable.length === 0) return [];
  return [OUTCOME_BEGIN_MARKER, heading, '', ...durable, OUTCOME_END_MARKER];
}
