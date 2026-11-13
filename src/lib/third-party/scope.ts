/**
 * Scopes a proposal row to the components the repository uses. One call per
 * distinct term to `GET /third-party-providers/{id}/components?search=`,
 * never with `region=`: the server would drop global leaves, so the region
 * filter is applied here. A row is scoped only when every term matched and
 * the kept leaves are twenty or fewer; otherwise the whole provider is
 * tracked and `scopeReason` says why. A 404 is the endpoint missing or the
 * account without the feature, which is a whole-provider row; any other
 * failure leaves the row unresolved, since a silent whole-provider create
 * would hide a broken search. The calls share the catalog searches' budget.
 */
import { requestJson } from '../../api/client.js';
import { ApiFailure } from '../../api/errors.js';
import { isPlainRecord } from '../objects.js';
import { hasUnsafeCharacters } from '../scan/support.js';
import type { ThirdPartyComponent } from '../scan/third-party-context.js';
import { operations } from '../../generated/operations.js';
import { buildUrl } from '../request.js';
import {
  ABORTED_CODE,
  type ApiAccess,
  MAX_CONSECUTIVE_FAILURES,
  type ResolvedCandidate,
  TIME_BUDGET_CODE,
  type TrackedMonitor,
  type TrackedProviders,
  isTransient,
} from './resolve.js';

export type ScopeReason =
  | 'no-terms'
  | 'term-missed'
  | 'too-many'
  | 'endpoint-unavailable'
  | 'pinned-whole';

/** What `--only <provider>=<id>:...` fixes for the create: these ids, or the whole provider. */
export type Pin = 'all' | readonly number[];

export interface TermOutcome {
  term: string;
  region: string | null;
  outcome: 'matched' | 'missed';
  /** Leaves kept for this term after the region filter. */
  leaves: number;
}

/** One catalog leaf the create will track, and the term that found it. */
export interface TrackedComponent {
  id: number;
  name: string;
  term: string;
  region: string | null;
}

export interface Scoping {
  scope: 'components' | 'whole';
  scopeReason?: ScopeReason;
  terms: readonly TermOutcome[];
  /** Distinct leaves kept across every term, the number the cap is judged on. */
  totalLeaves: number;
  trackedComponents: readonly TrackedComponent[];
  /** The `--only` value that repeats this row exactly: `AWS=248:9208,9108` or `AWS=248:all`. */
  pin?: string;
  /** True when the row came from a pin, so no search was made and no pin is owed. */
  pinned?: boolean;
  /** Pinned ids the provider tree does not hold; the run is blocked on any. */
  pinUnknownIds?: readonly number[];
}

/** Over this many kept leaves the whole provider is the coverage-first answer. */
export const MAX_TRACKED_COMPONENTS = 20;
export const COMPONENT_SEARCH_FAILED = 'COMPONENT_SEARCH_FAILED';

interface Leaf {
  id: number;
  name: string;
  region: string | null;
  global: boolean;
}

/** A catalog name shown to a person or an agent: one line, no control or format characters, bounded. */
const MAX_LEAF_NAME_LENGTH = 120;

function leafName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  let result = '';
  for (const character of value.replaceAll(/\s+/g, ' ').trim()) {
    if (!hasUnsafeCharacters(character)) result += character === '`' ? "'" : character;
  }
  if (result === '') return undefined;
  return result.length > MAX_LEAF_NAME_LENGTH
    ? `${result.slice(0, MAX_LEAF_NAME_LENGTH)}…`
    : result;
}

function leafOf(item: unknown): Leaf | undefined {
  if (!isPlainRecord(item)) return undefined;
  const { id, region, global } = item;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return undefined;
  const name = leafName(item.name);
  if (name === undefined) return undefined;
  const code = isPlainRecord(region) && typeof region.code === 'string' ? region.code : null;
  return { id, name, region: code, global: global === true };
}

/** The leaves of a reduced tree: every child, or a childless top-level row itself. */
export function collectLeaves(payload: unknown): Leaf[] {
  if (!isPlainRecord(payload) || !Array.isArray(payload.data)) {
    throw new ApiFailure(
      { code: 'INVALID_RESPONSE', message: 'The component search did not return a tree.' },
      1,
    );
  }
  return payload.data.flatMap((root) => {
    const children = isPlainRecord(root) && Array.isArray(root.children) ? root.children : [];
    const items = children.length === 0 ? [root] : children;
    return items.flatMap((item) => {
      const leaf = leafOf(item);
      return leaf === undefined ? [] : [leaf];
    });
  });
}

/** A leaf stays when the term named no region, the leaf is global, or the codes agree. */
export function keepsLeaf(leaf: Leaf, region: string | null): boolean {
  return region === null || leaf.global || leaf.region === region;
}

/**
 * Built by hand until the published contract carries the operation; the step
 * that refreshes `openapi/openapi.yaml` swaps this for `buildUrl(operations[...])`.
 */
function componentsUrl(access: ApiAccess, providerId: number, term: string): URL {
  const base = access.apiUrl.toString().replace(/\/?$/, '/');
  const url = new URL(
    `third-party-providers/${encodeURIComponent(String(providerId))}/components`,
    base,
  );
  url.searchParams.set('search', term);
  return url;
}

/** The distinct (term, region) pairs of a candidate, in the scan's order. */
function distinctTerms(
  components: readonly ThirdPartyComponent[],
): { term: string; region: string | null }[] {
  const seen = new Set<string>();
  return components.flatMap(({ term, region }) => {
    const code = region?.code ?? null;
    const key = `${term}\u0000${code ?? ''}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ term, region: code }];
  });
}

/** Scoped only when every term matched and the distinct total is within the cap. */
export function decideScope(
  terms: readonly TermOutcome[],
  kept: readonly TrackedComponent[],
): Scoping {
  const whole = (scopeReason: ScopeReason): Scoping => ({
    scope: 'whole',
    scopeReason,
    terms,
    totalLeaves: kept.length,
    trackedComponents: [],
  });
  if (terms.length === 0) return whole('no-terms');
  if (terms.some((item) => item.outcome === 'missed')) return whole('term-missed');
  if (kept.length > MAX_TRACKED_COMPONENTS) return whole('too-many');
  return { scope: 'components', terms, totalLeaves: kept.length, trackedComponents: kept };
}

class EndpointUnavailable extends Error {}

/** Which call failed and how, so a log of the run names the term and the status. */
function componentSearchFailure(
  term: string,
  error: ApiFailure,
): { code: string; message: string } {
  const status = error.cliError.status === undefined ? '' : ` (HTTP ${error.cliError.status})`;
  return {
    code: COMPONENT_SEARCH_FAILED,
    message: `component search for ${term} failed${status}: ${error.cliError.message}`,
  };
}

/** A search failure, carrying the term it was for. */
class ComponentSearchFailed extends Error {
  constructor(
    readonly term: string,
    readonly cause: ApiFailure,
  ) {
    super(cause.cliError.message);
  }
}

/** One GET per term; a term seen in two regions reads the same tree twice from the cache. */
async function searchComponents(
  access: ApiAccess,
  providerId: number,
  term: string,
  region: string | null,
  trees: Map<string, Leaf[]>,
): Promise<{ outcome: TermOutcome; kept: TrackedComponent[] }> {
  let leaves = trees.get(term);
  if (leaves === undefined) {
    try {
      const payload = await requestJson(
        access.client,
        componentsUrl(access, providerId, term),
        'GET',
      );
      leaves = collectLeaves(payload);
    } catch (error) {
      // Anything but an API answer is a bug here and must surface, not count as a search failure.
      if (!(error instanceof ApiFailure)) throw error;
      if (error.cliError.status === 404) throw new EndpointUnavailable();
      throw new ComponentSearchFailed(term, error);
    }
    trees.set(term, leaves);
  }
  const kept = leaves
    .filter((leaf) => keepsLeaf(leaf, region))
    .map(({ id, name }) => ({ id, name, term, region }));
  return {
    outcome: {
      term,
      region,
      outcome: kept.length === 0 ? 'missed' : 'matched',
      leaves: kept.length,
    },
    kept,
  };
}

class OutOfTime extends Error {}

const PROVIDER_GET = operations['third-party-providers:get'];

const pinText = (provider: string, providerId: number, scoping: Scoping): string =>
  scoping.scope === 'components'
    ? `${provider}=${providerId}:${scoping.trackedComponents.map((leaf) => leaf.id).join(',')}`
    : `${provider}=${providerId}:all`;

/**
 * A pinned row reads the provider's whole tree once and takes exactly the
 * pinned ids from it; an id the tree does not hold is reported, never
 * silently dropped. `all` makes a whole-provider row without any call.
 */
async function pinnedScoping(
  row: ResolvedCandidate & { catalog: { id: number } },
  pin: Pin,
  access: ApiAccess,
): Promise<Scoping> {
  const base = { terms: [], totalLeaves: 0, pinned: true } as const;
  if (pin === 'all') {
    return { ...base, scope: 'whole', scopeReason: 'pinned-whole', trackedComponents: [] };
  }
  const url = buildUrl(PROVIDER_GET, { path: { id: row.catalog.id }, query: {} }, access.apiUrl);
  const payload = await requestJson(access.client, url, PROVIDER_GET.method);
  const record = isPlainRecord(payload) && isPlainRecord(payload.data) ? payload.data : payload;
  const tree = isPlainRecord(record) ? record.components : undefined;
  const leaves = new Map(collectLeaves({ data: tree }).map((leaf) => [leaf.id, leaf]));
  const trackedComponents = pin.flatMap((id) => {
    const leaf = leaves.get(id);
    return leaf === undefined ? [] : [{ id, name: leaf.name, term: '', region: leaf.region }];
  });
  const pinUnknownIds = pin.filter((id) => !leaves.has(id));
  return {
    ...base,
    scope: 'components',
    totalLeaves: trackedComponents.length,
    trackedComponents,
    ...(pinUnknownIds.length === 0 ? {} : { pinUnknownIds }),
  };
}

async function scopeRow(
  row: ResolvedCandidate,
  providerId: number,
  access: ApiAccess,
  deadline: number,
): Promise<Scoping> {
  const terms: TermOutcome[] = [];
  const kept = new Map<number, TrackedComponent>();
  const trees = new Map<string, Leaf[]>();
  for (const { term, region } of distinctTerms(row.components)) {
    // One term can retry for seconds on a 429, so the budget is checked between terms too.
    if (Date.now() > deadline) throw new OutOfTime();
    let found: Awaited<ReturnType<typeof searchComponents>>;
    try {
      found = await searchComponents(access, providerId, term, region, trees);
    } catch (error) {
      if (error instanceof EndpointUnavailable) {
        return {
          scope: 'whole',
          scopeReason: 'endpoint-unavailable',
          terms,
          totalLeaves: kept.size,
          trackedComponents: [],
        };
      }
      throw error;
    }
    terms.push(found.outcome);
    for (const leaf of found.kept) if (!kept.has(leaf.id)) kept.set(leaf.id, leaf);
  }
  return decideScope(terms, [...kept.values()]);
}

/**
 * The monitor that tracks a provider: the lowest id when the account holds
 * two, with the list every one of them tracks together, so a second monitor
 * that tracks every component means nothing is untracked.
 */
function monitorFor(tracked: TrackedProviders, providerId: number): TrackedMonitor | undefined {
  const mine = tracked.monitors
    .filter((monitor) => monitor.providerId === providerId)
    .sort((left, right) => left.monitorId - right.monitorId);
  const first = mine[0];
  if (first === undefined) return undefined;
  // The API stores an empty list as null, so both mean every component.
  const lists = mine.map((monitor) =>
    monitor.trackedComponentIds?.length === 0 ? null : monitor.trackedComponentIds,
  );
  const union = lists.some((list) => list === null)
    ? null
    : [...new Set(lists.flatMap((list) => list ?? []))];
  // The lowest id's needsReview stands for the set; a flag on a second monitor is not merged.
  return { ...first, trackedComponentIds: union };
}

/** The account's monitor on an `already-tracked` row, when the list named one. */
function monitorField(
  row: ResolvedCandidate,
  tracked: TrackedProviders,
): { monitor?: TrackedMonitor } {
  if (row.status !== 'already-tracked') return {};
  const monitor = monitorFor(tracked, row.catalog.id);
  return monitor === undefined ? {} : { monitor };
}

/** The monitor plus the kept leaves its list does not hold, once the search answered. */
function trackedFields(
  row: ResolvedCandidate,
  tracked: TrackedProviders,
  kept: readonly TrackedComponent[],
): { monitor?: TrackedMonitor; untracked?: string[] } {
  if (row.status !== 'already-tracked') return {};
  const fields = monitorField(row, tracked);
  const list = fields.monitor?.trackedComponentIds ?? null;
  const untracked =
    list === null ? [] : kept.filter((leaf) => !list.includes(leaf.id)).map((leaf) => leaf.name);
  return { ...fields, untracked };
}

/**
 * Scopes every `create` and `already-tracked` row in order, under the
 * deadline and the consecutive-failure abort the catalog searches use. A
 * row the search fails for becomes `unresolved` with a code naming the
 * component search; a credential refusal is thrown.
 */
export async function scopeProposal(
  rows: readonly ResolvedCandidate[],
  options: {
    access: ApiAccess;
    tracked: TrackedProviders;
    deadline: number;
    pins?: ReadonlyMap<string, Pin>;
  },
): Promise<ResolvedCandidate[]> {
  const scoped: ResolvedCandidate[] = [];
  let consecutiveFailures = 0;
  for (const row of rows) {
    if (row.status !== 'create' && row.status !== 'already-tracked') {
      scoped.push(row);
      continue;
    }
    const pin = row.status === 'create' ? options.pins?.get(row.provider) : undefined;
    if (pin !== undefined) {
      const scoping = await pinnedScoping(row, pin, options.access);
      scoped.push({ ...row, ...scoping, pin: pinText(row.provider, row.catalog.id, scoping) });
      continue;
    }
    if (row.components.length === 0) {
      const scoping = decideScope([], []);
      scoped.push({
        ...row,
        ...scoping,
        pin: pinText(row.provider, row.catalog.id, scoping),
        ...trackedFields(row, options.tracked, []),
      });
      continue;
    }
    const aborted =
      consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
        ? {
            code: ABORTED_CODE,
            message: `Not asked: the previous ${MAX_CONSECUTIVE_FAILURES} component searches failed.`,
          }
        : Date.now() > options.deadline
          ? { code: TIME_BUDGET_CODE, message: 'Not asked: the searches ran out of time.' }
          : undefined;
    if (aborted !== undefined) {
      scoped.push({ ...row, status: 'unresolved', failure: aborted });
      continue;
    }
    try {
      const scoping = await scopeRow(row, row.catalog.id, options.access, options.deadline);
      consecutiveFailures = 0;
      scoped.push({
        ...row,
        ...scoping,
        pin: pinText(row.provider, row.catalog.id, scoping),
        ...trackedFields(row, options.tracked, scoping.trackedComponents),
      });
    } catch (error) {
      if (error instanceof OutOfTime) {
        scoped.push({
          ...row,
          status: 'unresolved',
          failure: { code: TIME_BUDGET_CODE, message: 'Not asked: the searches ran out of time.' },
        });
        continue;
      }
      if (!(error instanceof ComponentSearchFailed)) throw error;
      const status = error.cause.cliError.status;
      if (status === 401 || status === 403) throw error.cause;
      if (isTransient(error.cause)) consecutiveFailures += 1;
      // A tracked row is informational here: a failed search must not block the creates.
      if (row.status === 'already-tracked') {
        scoped.push({ ...row, ...monitorField(row, options.tracked) });
        continue;
      }
      scoped.push({
        ...row,
        status: 'unresolved',
        failure: componentSearchFailure(error.term, error.cause),
      });
    }
  }
  return scoped;
}
