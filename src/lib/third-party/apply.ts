/**
 * `scan --apply`: from the scan's third-party candidates to a proposal the
 * user confirms, the creates that follow, and the summary of what happened.
 *
 * The proposal is built from the account (tracked set, allowance) and the
 * catalog (one search per candidate) and printed before anything is written.
 * Nothing is created without a confirmation: `--confirm`, or a yes at the
 * prompt in an interactive human run. Creates run one at a time in proposal
 * order and stop at the first failure, which is never retried; a create the
 * API refuses because the provider is already tracked is reported as such and
 * does not stop the run.
 */
import { requestJson } from '../../api/client.js';
import { ApiFailure } from '../../api/errors.js';
import { operations } from '../../generated/operations.js';
import { isPlainRecord } from '../objects.js';
import { buildUrl } from '../request.js';
import type { ThirdPartyCandidate } from '../scan/third-party-context.js';
import type { CliError } from '../types.js';
import {
  type ApiAccess,
  type ResolvedCandidate,
  type TrackedProviders,
  applyAllowance,
  readAllowance,
  readTrackedProviders,
  resolveCandidates,
} from './resolve.js';

export interface ApplySelection {
  /** Provider names to keep, optionally `Name=<catalog id>` to settle an ambiguous row. */
  only: readonly string[];
  /** Provider names to leave out. */
  skip: readonly string[];
  includeBuildTime: boolean;
}

export interface Proposal {
  proposal: readonly ResolvedCandidate[];
  allowance: { used: number; limit: number; proposed: number } | { proposed: number };
  tracked: TrackedProviders;
}

export type CreateResult =
  | { provider: string; status: 'created'; monitorId: number | null }
  | { provider: string; status: 'already-tracked' }
  | { provider: string; status: 'failed'; error: { code: string; message: string } };

/** `not-needed` when the proposal held nothing to create, so no one was asked. */
export type Confirmation = 'required' | 'declined' | 'confirmed' | 'not-needed';

const CREATE = operations['monitors:create:third-party-service'];
/** The status the API answers a create for a provider the account already tracks with. */
const ALREADY_TRACKED_STATUS = 409;

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Splits `Name=<id>` into its parts; a bare name has no id, a malformed id is reported as none. */
export function parseOnly(entry: string): { name: string; id?: number } {
  const equals = entry.lastIndexOf('=');
  if (equals === -1) return { name: normalizeName(entry) };
  const id = Number(entry.slice(equals + 1));
  const name = normalizeName(entry.slice(0, equals));
  return Number.isSafeInteger(id) && id > 0 ? { name, id } : { name };
}

/** The candidates `--only` and `--skip` leave in, before any search is made. */
export function selectCandidates(
  candidates: readonly ThirdPartyCandidate[],
  selection: ApplySelection,
): ThirdPartyCandidate[] {
  const only = new Set(selection.only.map((entry) => parseOnly(entry).name));
  const skip = new Set(selection.skip.map(normalizeName));
  return candidates.filter((candidate) => {
    const name = normalizeName(candidate.provider);
    if (skip.has(name)) return false;
    return only.size === 0 || only.has(name);
  });
}

/** Settles an ambiguous row whose `--only Name=<id>` names one of its choices. */
export function settleChoices(
  rows: readonly ResolvedCandidate[],
  only: readonly string[],
  tracked: TrackedProviders,
): ResolvedCandidate[] {
  const chosen = new Map(
    only.map(parseOnly).flatMap(({ name, id }) => (id === undefined ? [] : [[name, id] as const])),
  );
  return rows.map((row) => {
    if (row.status !== 'ambiguous') return row;
    const id = chosen.get(normalizeName(row.provider));
    const choice = row.choices.find((item) => item.id === id);
    if (choice === undefined) return row;
    const { isTracked, ...catalog } = choice;
    const { choices: _, ...rest } = row;
    return {
      ...rest,
      status: isTracked || tracked.providerIds.includes(choice.id) ? 'already-tracked' : 'create',
      catalog,
      regionDefaulted: false,
    };
  });
}

/** Reads the account, resolves every selected candidate and applies the allowance. */
export async function prepareProposal(
  candidates: readonly ThirdPartyCandidate[],
  selection: ApplySelection,
  access: ApiAccess,
): Promise<Proposal> {
  const tracked = await readTrackedProviders(access);
  const resolved = await resolveCandidates(selectCandidates(candidates, selection), {
    access,
    includeBuildTime: selection.includeBuildTime,
    tracked,
  });
  const allowance = await readAllowance(access);
  const proposal = applyAllowance(settleChoices(resolved, selection.only, tracked), allowance);
  const proposed = proposal.filter((row) => row.status === 'create').length;
  return {
    proposal,
    allowance: allowance === null ? { proposed } : { ...allowance, proposed },
    tracked,
  };
}

function monitorIdOf(payload: unknown): number | null {
  const record = isPlainRecord(payload) && isPlainRecord(payload.data) ? payload.data : payload;
  return isPlainRecord(record) && typeof record.id === 'number' ? record.id : null;
}

/**
 * Creates one third-party service per `create` row, in order, and stops at the
 * first failure. Returns the results and, when a create failed, the failure.
 */
export async function createProposed(
  proposal: readonly ResolvedCandidate[],
  access: ApiAccess,
): Promise<{ results: CreateResult[]; failure?: ApiFailure }> {
  const results: CreateResult[] = [];
  for (const row of proposal) {
    if (row.status !== 'create') continue;
    const url = buildUrl(CREATE, { path: {}, query: {} }, access.apiUrl);
    const body = JSON.stringify({
      type: 'THIRD_PARTY_SERVICE',
      config: { thirdPartyService: { providerId: row.catalog.id } },
    });
    try {
      const payload = await requestJson(access.client, url, CREATE.method, body);
      results.push({ provider: row.provider, status: 'created', monitorId: monitorIdOf(payload) });
    } catch (error) {
      if (!(error instanceof ApiFailure)) throw error;
      if (error.cliError.status === ALREADY_TRACKED_STATUS) {
        results.push({ provider: row.provider, status: 'already-tracked' });
        continue;
      }
      results.push({
        provider: row.provider,
        status: 'failed',
        error: { code: error.cliError.code, message: error.cliError.message },
      });
      return { results, failure: error };
    }
  }
  return { results };
}

// --- Rendering -------------------------------------------------------------

const ACTIONS: Record<ResolvedCandidate['status'], string> = {
  create: 'create',
  'already-tracked': 'already tracked',
  'not-in-catalog': 'none',
  ambiguous: 'choose with --only <provider>=<id>',
  unresolved: 'retry',
  'over-allowance': 'over allowance',
};

function catalogCell(row: ResolvedCandidate): string {
  switch (row.status) {
    case 'not-in-catalog':
      return 'not in catalog';
    case 'ambiguous':
      return `ambiguous: ${row.choices.map((choice) => choice.id).join(', ')}`;
    case 'unresolved':
      return `unresolved: ${row.failure.message}`;
    default:
      return `${row.catalog.id}, ${row.catalog.state}, ${row.catalog.statusPageUrl}`;
  }
}

function evidenceCell(row: ResolvedCandidate): string {
  const shown = row.evidence.slice(0, 3).map((item) => item.signal);
  const more = row.evidence.length - shown.length;
  return [...shown, ...(more > 0 ? [`+${more} more`] : [])].join(', ');
}

/** A table cell can hold an upstream message; a pipe in it would split the row. */
function cell(text: string): string {
  return text.replaceAll('|', '/').replaceAll(/\s+/g, ' ');
}

/** The proposal as a Markdown table plus the allowance line. */
export function formatProposal(proposal: Proposal): string[] {
  const lines = [
    '| Provider | Evidence | Class | Catalog | Action |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const row of proposal.proposal) {
    const cells = [
      row.provider,
      evidenceCell(row),
      row.class,
      catalogCell(row),
      ACTIONS[row.status],
    ];
    lines.push(`| ${cells.map(cell).join(' | ')} |`);
  }
  if (proposal.proposal.length === 0) lines.push('| (no candidates) | | | | |');
  const { allowance, tracked } = proposal;
  const slots =
    'used' in allowance
      ? `${allowance.used} of ${allowance.limit} third-party slots used, ${allowance.proposed} proposed.`
      : `Allowance unknown, ${allowance.proposed} proposed.`;
  const set = `Tracked set read from the account (${tracked.providerIds.length} ${
    tracked.providerIds.length === 1 ? 'service' : 'services'
  }${tracked.partial ? ', partial: the list stopped at its page cap' : ''}).`;
  lines.push('', `${slots} ${set}`);
  return lines;
}

const CLI_COMMAND = 'uptimerobot monitors create third-party-service --provider-id';

/** What happened, then the lines to repeat each create by hand, then where endpoints go. */
export function formatSummary(
  proposal: readonly ResolvedCandidate[],
  results: readonly CreateResult[],
  confirmation: Confirmation,
): string[] {
  const lines: string[] = [];
  const created = results.filter((item) => item.status === 'created');
  const refused = results.filter((item) => item.status === 'already-tracked');
  const failed = results.filter((item) => item.status === 'failed');
  const describe = (items: readonly CreateResult[]): string =>
    items
      .map((item) =>
        item.status === 'created'
          ? `${item.provider} (monitor ${item.monitorId ?? 'unknown'})`
          : item.status === 'failed'
            ? `${item.provider} (${item.error.message})`
            : item.provider,
      )
      .join(', ');
  if (confirmation === 'required' || confirmation === 'declined')
    lines.push('Nothing was created.');
  if (confirmation === 'not-needed') lines.push('Nothing to create.');
  if (created.length > 0) lines.push(`Created: ${describe(created)}.`);
  if (refused.length > 0) lines.push(`Already tracked: ${describe(refused)}.`);
  if (failed.length > 0) lines.push(`Not created: ${describe(failed)}.`);

  const attempted = new Set(results.map((item) => item.provider));
  const remaining = proposal.filter(
    (row) => row.status === 'create' && !attempted.has(row.provider),
  );
  if (confirmation === 'confirmed' && remaining.length > 0) {
    lines.push(`Not attempted: ${remaining.map((row) => row.provider).join(', ')}.`);
  }
  const byStatus = (status: ResolvedCandidate['status']): string[] =>
    proposal.filter((row) => row.status === status).map((row) => row.provider);
  const tracked = byStatus('already-tracked');
  if (tracked.length > 0) lines.push(`Already tracked before this run: ${tracked.join(', ')}.`);
  const missing = byStatus('not-in-catalog');
  if (missing.length > 0) lines.push(`Not in catalog: ${missing.join(', ')}.`);
  const over = byStatus('over-allowance');
  if (over.length > 0) lines.push(`Over allowance: ${over.join(', ')}.`);
  const ambiguous = byStatus('ambiguous');
  if (ambiguous.length > 0)
    lines.push(`Ambiguous, pick with --only <provider>=<id>: ${ambiguous.join(', ')}.`);
  const unresolved = byStatus('unresolved');
  if (unresolved.length > 0) lines.push(`Unresolved, retry later: ${unresolved.join(', ')}.`);

  // After a confirmed run the created rows need no repeating; what is left is
  // what stopped, what was never reached, and what the allowance refused.
  const createdProviders = new Set(created.map((item) => item.provider));
  const commands = proposal.flatMap((row) =>
    (row.status === 'create' && !createdProviders.has(row.provider)) ||
    row.status === 'over-allowance'
      ? [`${CLI_COMMAND} ${row.catalog.id}`]
      : [],
  );
  if (commands.length > 0)
    lines.push('', 'To repeat a create by hand:', ...commands.map((c) => `  ${c}`));
  lines.push('', 'Endpoints and heartbeats need a base URL and go through `uptimerobot init`.');
  return lines;
}

export function confirmationRequiredError(confirmation: 'required' | 'declined'): CliError {
  return {
    code: 'CONFIRMATION_REQUIRED',
    command: 'scan --apply',
    message:
      confirmation === 'declined'
        ? 'Nothing was created: the confirmation was declined.'
        : 'Explicit confirmation is required. Re-run with --confirm.',
  };
}
