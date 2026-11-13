/**
 * `scan --apply`: from the scan's third-party candidates to a proposal the
 * user confirms, the creates that follow, and the summary of what happened.
 *
 * The proposal is built from the account (tracked set, allowance) and the
 * catalog (one search per candidate) and printed before anything is written.
 * Nothing is created without a confirmation: `--confirm`, or a yes at the
 * prompt in an interactive human run. Creates run one at a time in proposal
 * order and stop at the first failure, which is never retried. A repeat create
 * is safe: the API answers it with the monitor the account already has, so a
 * partial tracked set only makes the proposal longer, never a duplicate.
 * `runApply` is the whole flow without the printing, so `init` can offer the
 * same proposal.
 */
import { type CliInvocation, formatInvocation } from '../agent-setup/cli-invocation.js';
import { requestJson } from '../../api/client.js';
import { ApiFailure } from '../../api/errors.js';
import { operations } from '../../generated/operations.js';
import { isPlainRecord } from '../objects.js';
import { buildUrl } from '../request.js';
import type { SeedContext } from '../scan/index.js';
import type { ThirdPartyCandidate } from '../scan/third-party-context.js';
import type { CliError } from '../types.js';
import {
  type ApiAccess,
  DEFAULT_TIME_BUDGET_MS,
  type ResolvedCandidate,
  type TrackedProviders,
  applyAllowance,
  readAllowance,
  readTrackedProviders,
  resolveCandidates,
} from './resolve.js';
import {
  COMPONENT_SEARCH_FAILED,
  MAX_TRACKED_COMPONENTS,
  type ScopeReason,
  type TrackedComponent,
  scopeProposal,
} from './scope.js';

export interface ApplySelection {
  /** Provider names to keep, optionally `Name=<catalog id>` to settle an ambiguous row. */
  only: readonly string[];
  /** Provider names to leave out. */
  skip: readonly string[];
  includeBuildTime: boolean;
}

/** The account's allowance, null fields when the account did not say, and what this run proposes. */
export interface ProposalAllowance {
  used: number | null;
  limit: number | null;
  proposed: number;
}

export interface Proposal {
  proposal: readonly ResolvedCandidate[];
  allowance: ProposalAllowance;
  tracked: TrackedProviders;
}

/**
 * `unknown` when the API never said whether it wrote the monitor (no status,
 * or a 5xx after a server that may have committed), so the row must not be
 * reported as not created, nor handed out as a command to repeat.
 */
export type CreateResult =
  | {
      provider: string;
      status: 'created';
      monitorId: number;
      /** The leaves the create was scoped to; absent for a whole-provider create. */
      trackedComponents?: readonly TrackedComponent[];
    }
  | { provider: string; status: 'unknown'; error: { code: string; message: string } }
  | { provider: string; status: 'failed'; error: { code: string; message: string } };

/**
 * `not-needed` when the proposal held nothing to create, so no one was asked;
 * `blocked` when the input was refused before anyone could be asked.
 */
export type Confirmation = 'required' | 'declined' | 'confirmed' | 'not-needed' | 'blocked';

/** The `--apply` result, in the shape the Command contract documents. */
export interface ApplyOutput {
  schemaVersion: number;
  repoRoot: string;
  proposal: readonly ResolvedCandidate[];
  allowance: ProposalAllowance;
  tracked: TrackedProviders;
  confirmation: Confirmation;
  results: readonly CreateResult[];
  /** True when a scan budget stopped discovery, so a provider may be missing from the proposal. */
  truncated: boolean;
}

const CREATE = operations['monitors:create:third-party-service'];
/** Characters a terminal would obey; nothing from the API or the catalog may carry them to the screen. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

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

/** The first `--only` entry with an `=` but no usable id, if any. */
export function malformedOnly(only: readonly string[]): string | undefined {
  return only.find((entry) => entry.includes('=') && parseOnly(entry).id === undefined);
}

/** The `--only` and `--skip` names that match no candidate: a typo would otherwise be a silent no-op. */
/** The `--only` and `--skip` entries no scanned provider matches, per flag, so the error names the one to edit. */
export function unknownSelections(
  candidates: readonly ThirdPartyCandidate[],
  selection: ApplySelection,
): { only: string[]; skip: string[] } {
  const known = new Set(candidates.map((candidate) => normalizeName(candidate.provider)));
  return {
    only: selection.only.filter((entry) => !known.has(parseOnly(entry).name)),
    skip: selection.skip.filter((entry) => !known.has(normalizeName(entry))),
  };
}

/** The ids a resolved row can stand for: its catalog row, or each of an ambiguous row's choices. */
function resolvedIds(row: ResolvedCandidate): number[] {
  if (row.status === 'ambiguous') return row.choices.map((item) => item.id);
  return 'catalog' in row ? [row.catalog.id] : [];
}

/**
 * The first `--only Name=<id>` whose id is none of the ids its provider
 * resolved to: silently creating the row the search found instead would
 * create a service the user did not name.
 */
export function mismatchedOnly(
  rows: readonly ResolvedCandidate[],
  only: readonly string[],
): { entry: string; resolved: number[] } | undefined {
  for (const entry of only) {
    const { name, id } = parseOnly(entry);
    if (id === undefined) continue;
    const row = rows.find((item) => normalizeName(item.provider) === name);
    if (row === undefined) continue;
    const resolved = resolvedIds(row);
    if (resolved.length > 0 && !resolved.includes(id)) return { entry, resolved };
  }
  return undefined;
}

export function onlyMismatchError(mismatch: { entry: string; resolved: number[] }): CliError {
  return {
    code: 'INVALID_INPUT',
    expected: `one of the ids the provider resolved to: ${mismatch.resolved.join(', ')}`,
    message: `--only ${mismatch.entry} names an id the catalog search did not return for that provider (it returned ${mismatch.resolved.join(', ')}). Nothing was created.`,
    path: 'only',
  };
}

/**
 * The first `--only` name that is a build-time provider while build-time rows
 * are left out: the row would be dropped before the search, a silent no-op.
 */
export function excludedBuildTime(
  candidates: readonly ThirdPartyCandidate[],
  selection: ApplySelection,
): string | undefined {
  if (selection.includeBuildTime) return undefined;
  const buildTime = new Set(
    candidates
      .filter((candidate) => candidate.class === 'build-time')
      .map((candidate) => normalizeName(candidate.provider)),
  );
  const entry = selection.only.find((item) => buildTime.has(parseOnly(item).name));
  if (entry === undefined) return undefined;
  const name = parseOnly(entry).name;
  return candidates.find((candidate) => normalizeName(candidate.provider) === name)?.provider;
}

export function buildTimeOnlyError(provider: string): CliError {
  return {
    code: 'INVALID_INPUT',
    expected: 'a runtime provider, or --include-build-time',
    message: `${provider} is a build-time provider; add --include-build-time to propose it.`,
    path: 'only',
  };
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
export function applyOnlyChoices(
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
  const deadline = Date.now() + DEFAULT_TIME_BUDGET_MS;
  const resolved = await resolveCandidates(selectCandidates(candidates, selection), {
    access,
    includeBuildTime: selection.includeBuildTime,
    tracked,
    deadline,
  });
  const scoped = await scopeProposal(applyOnlyChoices(resolved, selection.only, tracked), {
    access,
    tracked,
    deadline,
  });
  const allowance = await readAllowance(access);
  const proposal = applyAllowance(scoped, allowance);
  const proposed = proposal.filter((row) => row.status === 'create').length;
  return {
    proposal,
    allowance: { used: allowance?.used ?? null, limit: allowance?.limit ?? null, proposed },
    tracked,
  };
}

function monitorIdOf(payload: unknown): number | null {
  const record = isPlainRecord(payload) && isPlainRecord(payload.data) ? payload.data : payload;
  return isPlainRecord(record) && typeof record.id === 'number' ? record.id : null;
}

/** Whether the API said nothing about the write: no status at all, or a server-side failure. */
function outcomeUnknown(error: ApiFailure): boolean {
  const status = error.cliError.status;
  return status === undefined || status >= 500;
}

/**
 * Creates one third-party service per `create` row, in order, and stops at the
 * first failure. Sequential on purpose: the order is the proposal's, and a
 * failure must leave the later rows untouched.
 */
export async function createProposed(
  proposal: readonly ResolvedCandidate[],
  access: ApiAccess,
): Promise<{ results: CreateResult[]; failure?: ApiFailure }> {
  const results: CreateResult[] = [];
  for (const row of proposal) {
    if (row.status !== 'create') continue;
    const url = buildUrl(CREATE, { path: {}, query: {} }, access.apiUrl);
    const scopedIds =
      row.scope === 'components' ? row.trackedComponents?.map((leaf) => leaf.id) : undefined;
    const body = JSON.stringify({
      type: 'THIRD_PARTY_SERVICE',
      config: {
        thirdPartyService: {
          providerId: row.catalog.id,
          ...(scopedIds === undefined ? {} : { trackedComponentIds: scopedIds }),
        },
      },
    });
    let payload: unknown;
    try {
      payload = await requestJson(access.client, url, CREATE.method, body);
    } catch (error) {
      if (!(error instanceof ApiFailure)) throw error;
      const detail = { code: error.cliError.code, message: error.cliError.message };
      const status = outcomeUnknown(error) ? 'unknown' : 'failed';
      results.push({ provider: row.provider, status, error: detail });
      return { results, failure: error };
    }
    const monitorId = monitorIdOf(payload);
    if (monitorId === null) {
      // A 2xx without the monitor: the API probably wrote it and did not say,
      // which is `unknown`, never a create to repeat by hand.
      const failure = new ApiFailure(
        { code: 'INVALID_RESPONSE', message: 'The create did not return a monitor.' },
        1,
      );
      results.push({ provider: row.provider, status: 'unknown', error: failure.cliError });
      return { results, failure };
    }
    results.push({
      provider: row.provider,
      status: 'created',
      monitorId,
      ...(row.scope === 'components' ? { trackedComponents: row.trackedComponents ?? [] } : {}),
    });
  }
  return { results };
}

export interface ApplyRun {
  proposal: Proposal;
  confirmation: Confirmation;
  results: readonly CreateResult[];
  failure?: ApiFailure;
  /** Why the creates were not attempted: bad input (`INVALID_INPUT`), decided before anyone is asked. */
  blocked?: CliError;
}

/**
 * A selected row the catalog could not answer for: the run must not end as if
 * the account were in sync, so a script's `&&` does not carry on past it.
 */
export function unresolvedError(proposal: readonly ResolvedCandidate[]): CliError | undefined {
  const unresolved = proposal.filter((row) => row.status === 'unresolved');
  if (unresolved.length === 0) return undefined;
  const names = unresolved.map((row) => row.provider).join(', ');
  const searchFailed = unresolved.every(
    (row) => row.status === 'unresolved' && row.failure.code === COMPONENT_SEARCH_FAILED,
  );
  return {
    code: 'CATALOG_UNRESOLVED',
    command: APPLY_COMMAND,
    message: searchFailed
      ? `The component search failed for ${names}; retry later.`
      : `The catalog could not resolve ${names}; retry later.`,
  };
}

/**
 * The whole flow without printing: prepare, ask through `confirm` when the
 * proposal holds something to create and `--confirm` is absent, create. The
 * caller prints the proposal between the two by passing a `confirm` that does
 * so; it answers `confirmed`, `declined`, or `required` when it could not ask.
 * `onProposal` runs once the proposal stands and before anything is written,
 * so a caller can show it even when `--confirm` means no one is asked.
 */
export async function runApply(options: {
  candidates: readonly ThirdPartyCandidate[];
  selection: ApplySelection;
  access: ApiAccess;
  confirmFlag: boolean;
  confirm: (proposal: Proposal, toCreate: number) => Promise<Confirmation>;
  onProposal?: (proposal: Proposal) => void;
}): Promise<ApplyRun> {
  const proposal = await prepareProposal(options.candidates, options.selection, options.access);
  const mismatch = mismatchedOnly(proposal.proposal, options.selection.only);
  if (mismatch !== undefined) {
    return { proposal, confirmation: 'blocked', results: [], blocked: onlyMismatchError(mismatch) };
  }
  options.onProposal?.(proposal);
  const toCreate = proposal.allowance.proposed;
  const confirmation: Confirmation =
    toCreate === 0
      ? 'not-needed'
      : options.confirmFlag
        ? 'confirmed'
        : await options.confirm(proposal, toCreate);
  if (confirmation !== 'confirmed') return { proposal, confirmation, results: [] };
  const { results, failure } = await createProposed(proposal.proposal, options.access);
  return failure === undefined
    ? { proposal, confirmation, results }
    : { proposal, confirmation, results, failure };
}

export function buildApplyOutput(context: SeedContext, run: ApplyRun): ApplyOutput {
  return {
    schemaVersion: context.schemaVersion,
    repoRoot: context.repoRoot,
    proposal: run.proposal.proposal,
    allowance: run.proposal.allowance,
    tracked: run.proposal.tracked,
    confirmation: run.confirmation,
    results: run.results,
    truncated: context.summary.truncated,
  };
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

/** Names shown in a cell before the rest folds into `+N more`. */
const MAX_COMPONENTS_PER_CELL = 5;

/** A row that resolved to one catalog entry, the only kind scoping touches. */
type ResolvedRow = Extract<ResolvedCandidate, { catalog: unknown }>;

const SCOPE_REASONS: Record<ScopeReason, (row: ResolvedRow) => string> = {
  'no-terms': () => '',
  'term-missed': (row) =>
    `no component matched ${(row.terms ?? [])
      .filter((item) => item.outcome === 'missed')
      .map((item) => item.term)
      .join(', ')}; tracking the whole provider`,
  'too-many': (row) =>
    `${(row.terms ?? []).reduce((sum, item) => sum + item.leaves, 0)} components matched, over ${MAX_TRACKED_COMPONENTS}; tracking the whole provider`,
  'endpoint-unavailable': () => 'component search unavailable; tracking the whole provider',
};

function foldNames(names: readonly string[]): string {
  const shown = names.slice(0, MAX_COMPONENTS_PER_CELL);
  const more = names.length - shown.length;
  return [...shown, ...(more > 0 ? [`+${more} more, see --json`] : [])].join(', ');
}

function componentsCell(row: ResolvedCandidate): string {
  if (!('catalog' in row)) return '';
  if (row.status === 'already-tracked') {
    const list = row.monitor?.trackedComponentIds ?? null;
    const covers =
      list === null
        ? 'tracks every component'
        : `tracks ${list.length} ${list.length === 1 ? 'component' : 'components'}`;
    const missing = row.untracked ?? [];
    return missing.length === 0
      ? covers
      : `${covers}; scan found ${foldNames(missing)}, not tracked`;
  }
  if (row.scope === 'components')
    return foldNames((row.trackedComponents ?? []).map((leaf) => leaf.name));
  return row.scopeReason === undefined ? '' : SCOPE_REASONS[row.scopeReason](row);
}

/** One line per scoped component: its name, the signals behind its term, and where the region came from. */
function componentLines(row: ResolvedCandidate): string[] {
  if (row.status !== 'create' || row.scope !== 'components') return [];
  const leaves = row.trackedComponents ?? [];
  const lines = leaves.slice(0, MAX_COMPONENTS_PER_CELL).map((leaf) => {
    const source = row.components.find(
      (item) => item.term === leaf.term && (item.region?.code ?? null) === leaf.region,
    );
    const evidence = (source?.evidence ?? []).map(
      (item) => `${item.file}:${item.line} (${item.signal})`,
    );
    const region =
      source?.region === null || source?.region === undefined
        ? []
        : [
            `region ${source.region.code} from ${source.region.declaredAt.file}:${source.region.declaredAt.line}`,
          ];
    return `- ${row.provider}, ${plain(leaf.name)}: ${[...evidence, ...region].join(', ')}`;
  });
  const more = leaves.length - lines.length;
  return more > 0 ? [...lines, `- ${row.provider}: +${more} more components, see --json`] : lines;
}

function evidenceCell(row: ResolvedCandidate): string {
  const shown = row.evidence.slice(0, 3).map((item) => item.signal);
  const more = row.evidence.length - shown.length;
  return [...shown, ...(more > 0 ? [`+${more} more`] : [])].join(', ');
}

/** Text from the API or the catalog: no control characters, one line. */
export function plain(text: string): string {
  return text.replaceAll(/\s+/g, ' ').replaceAll(CONTROL_CHARACTERS, '');
}

function cell(text: string): string {
  return plain(text).replaceAll('|', '/');
}

/** The proposal as a Markdown table plus the allowance line. */
export function formatProposal(proposal: Proposal): string[] {
  const lines = [
    '| Provider | Evidence | Class | Catalog | Components | Action |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of proposal.proposal) {
    const cells = [
      row.provider,
      evidenceCell(row),
      row.class,
      catalogCell(row),
      componentsCell(row),
      ACTIONS[row.status],
    ];
    lines.push(`| ${cells.map(cell).join(' | ')} |`);
  }
  if (proposal.proposal.length === 0) lines.push('| (no candidates) | | | | | |');
  const components = proposal.proposal.flatMap(componentLines);
  if (components.length > 0) lines.push('', ...components);
  const { allowance, tracked } = proposal;
  const slots =
    allowance.used !== null && allowance.limit !== null
      ? `${allowance.used} of ${allowance.limit} third-party slots used, ${allowance.proposed} proposed.`
      : `Allowance unknown, ${allowance.proposed} proposed.`;
  const set = `Tracked set read from the account (${tracked.providerIds.length} ${
    tracked.providerIds.length === 1 ? 'service' : 'services'
  }${tracked.partial ? ', partial: the list stopped at its page cap' : ''}).`;
  lines.push('', `${slots} ${set}`);
  return lines;
}

/** The hand-run equivalent of one create, spelled from the generated command id. */
const CREATE_SUBCOMMAND = `${CREATE.commandId.replaceAll(':', ' ')} --provider-id`;
export const CREATE_COMMAND = `uptimerobot ${CREATE_SUBCOMMAND}`;

/** What `formatSummary` templates against when a caller has not resolved one. */
const BARE_INVOCATION: CliInvocation = { command: 'uptimerobot', source: 'override' };
export const APPLY_COMMAND = 'scan --apply';

const LEFTOVER_LABELS: readonly [ResolvedCandidate['status'], string][] = [
  ['already-tracked', 'Already tracked before this run'],
  ['not-in-catalog', 'Not in catalog'],
  ['over-allowance', 'Over allowance'],
  ['ambiguous', 'Ambiguous, pick with --only <provider>=<id>'],
  ['unresolved', 'Unresolved, retry later'],
];

function describeResult(item: CreateResult): string {
  return item.status === 'created'
    ? `${item.provider} (monitor ${item.monitorId})`
    : `${item.provider} (${plain(item.error.message)})`;
}

function outcomeLines(
  proposal: readonly ResolvedCandidate[],
  results: readonly CreateResult[],
  confirmation: Confirmation,
  invocation: CliInvocation,
): string[] {
  const lines: string[] = [];
  if (confirmation === 'required' || confirmation === 'declined' || confirmation === 'blocked')
    lines.push('Nothing was created.');
  // An unresolved row is not "nothing": its own leftover line says what to do.
  if (confirmation === 'not-needed' && !proposal.some((row) => row.status === 'unresolved'))
    lines.push('Nothing to create.');
  const byStatus = (status: CreateResult['status']): string =>
    results
      .filter((item) => item.status === status)
      .map(describeResult)
      .join(', ');
  const created = byStatus('created');
  const unknown = byStatus('unknown');
  const failed = byStatus('failed');
  if (created !== '') lines.push(`Created: ${created}.`);
  if (unknown !== '')
    lines.push(
      `Outcome unknown, the API may have created it, re-run \`${formatInvocation(invocation, APPLY_COMMAND)}\` to check: ${unknown}.`,
    );
  if (failed !== '') lines.push(`Not created: ${failed}.`);
  return lines;
}

function leftoverLines(
  proposal: readonly ResolvedCandidate[],
  results: readonly CreateResult[],
  confirmation: Confirmation,
): string[] {
  const lines: string[] = [];
  const attempted = new Set(results.map((item) => item.provider));
  const remaining = proposal.filter(
    (row) => row.status === 'create' && !attempted.has(row.provider),
  );
  if (confirmation === 'confirmed' && remaining.length > 0) {
    lines.push(`Not attempted: ${remaining.map((row) => row.provider).join(', ')}.`);
  }
  for (const [status, label] of LEFTOVER_LABELS) {
    const names = proposal.filter((row) => row.status === status).map((row) => row.provider);
    if (names.length > 0) lines.push(`${label}: ${names.join(', ')}.`);
  }
  return lines;
}

/** The creates still worth repeating by hand: not the ones a confirmed run made or may have made. */
function manualCommands(
  proposal: readonly ResolvedCandidate[],
  results: readonly CreateResult[],
  invocation: CliInvocation,
): string[] {
  const settled = new Set(
    results.filter((item) => item.status !== 'failed').map((item) => item.provider),
  );
  return proposal.flatMap((row) =>
    (row.status === 'create' && !settled.has(row.provider)) || row.status === 'over-allowance'
      ? [`  ${formatInvocation(invocation, CREATE_SUBCOMMAND)} ${row.catalog.id}`]
      : [],
  );
}

/** What happened, then the lines to repeat each create by hand, then where endpoints go. */
export function formatSummary(
  proposal: readonly ResolvedCandidate[],
  results: readonly CreateResult[],
  confirmation: Confirmation,
  invocation: CliInvocation = BARE_INVOCATION,
): string[] {
  const commands = confirmation === 'blocked' ? [] : manualCommands(proposal, results, invocation);
  return [
    ...outcomeLines(proposal, results, confirmation, invocation),
    ...leftoverLines(proposal, results, confirmation),
    ...(commands.length > 0 ? ['', 'To repeat a create by hand:', ...commands] : []),
    '',
    `Endpoints and heartbeats need a base URL and go through \`${formatInvocation(invocation, 'init')}\`.`,
  ];
}

export function confirmationRequiredError(confirmation: 'required' | 'declined'): CliError {
  return {
    code: 'CONFIRMATION_REQUIRED',
    command: APPLY_COMMAND,
    message:
      confirmation === 'declined'
        ? 'Nothing was created: the confirmation was declined.'
        : 'Explicit confirmation is required. Re-run with --confirm.',
  };
}
