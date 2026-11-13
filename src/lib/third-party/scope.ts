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
import type { ThirdPartyComponent } from '../scan/third-party-context.js';
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

export type ScopeReason = 'no-terms' | 'term-missed' | 'too-many' | 'endpoint-unavailable';

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
  trackedComponents: readonly TrackedComponent[];
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

function leafOf(item: unknown): Leaf | undefined {
  if (!isPlainRecord(item)) return undefined;
  const { id, name, region, global } = item;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return undefined;
  if (typeof name !== 'string') return undefined;
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

/** Rule 1: scoped only when every term matched and the total is within the cap. */
export function decideScope(
  terms: readonly TermOutcome[],
  kept: readonly TrackedComponent[],
): Scoping {
  if (terms.length === 0)
    return { scope: 'whole', scopeReason: 'no-terms', terms, trackedComponents: [] };
  if (terms.some((item) => item.outcome === 'missed')) {
    return { scope: 'whole', scopeReason: 'term-missed', terms, trackedComponents: [] };
  }
  if (kept.length > MAX_TRACKED_COMPONENTS) {
    return { scope: 'whole', scopeReason: 'too-many', terms, trackedComponents: [] };
  }
  return { scope: 'components', terms, trackedComponents: kept };
}

class EndpointUnavailable extends Error {}

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
    let payload: unknown;
    try {
      payload = await requestJson(access.client, componentsUrl(access, providerId, term), 'GET');
    } catch (error) {
      if (error instanceof ApiFailure && error.cliError.status === 404)
        throw new EndpointUnavailable();
      throw error;
    }
    leaves = collectLeaves(payload);
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

async function scopeRow(
  row: ResolvedCandidate,
  providerId: number,
  access: ApiAccess,
): Promise<Scoping> {
  const terms: TermOutcome[] = [];
  const kept = new Map<number, TrackedComponent>();
  const trees = new Map<string, Leaf[]>();
  for (const { term, region } of distinctTerms(row.components)) {
    let found: Awaited<ReturnType<typeof searchComponents>>;
    try {
      found = await searchComponents(access, providerId, term, region, trees);
    } catch (error) {
      if (error instanceof EndpointUnavailable) {
        return {
          scope: 'whole',
          scopeReason: 'endpoint-unavailable',
          terms,
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

function componentSearchFailure(error: unknown): { code: string; message: string } {
  const detail =
    error instanceof ApiFailure
      ? error.cliError.message
      : error instanceof Error
        ? error.message
        : String(error);
  return { code: COMPONENT_SEARCH_FAILED, message: `component search failed: ${detail}` };
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
  const lists = mine.map((monitor) => monitor.trackedComponentIds);
  const union = lists.some((list) => list === null)
    ? null
    : [...new Set(lists.flatMap((list) => list ?? []))];
  return { ...first, trackedComponentIds: union };
}

/**
 * Scopes every `create` and `already-tracked` row in order, under the
 * deadline and the consecutive-failure abort the catalog searches use. A
 * row the search fails for becomes `unresolved` with a code naming the
 * component search; a credential refusal is thrown.
 */
export async function scopeProposal(
  rows: readonly ResolvedCandidate[],
  options: { access: ApiAccess; tracked: TrackedProviders; deadline: number },
): Promise<ResolvedCandidate[]> {
  const scoped: ResolvedCandidate[] = [];
  let consecutiveFailures = 0;
  for (const row of rows) {
    if (row.status !== 'create' && row.status !== 'already-tracked') {
      scoped.push(row);
      continue;
    }
    if (row.components.length === 0) {
      scoped.push({ ...row, ...decideScope([], []), ...trackedFields(row, options.tracked, []) });
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
      const scoping = await scopeRow(row, row.catalog.id, options.access);
      consecutiveFailures = 0;
      scoped.push({
        ...row,
        ...scoping,
        ...trackedFields(row, options.tracked, scoping.trackedComponents),
      });
    } catch (error) {
      if (error instanceof ApiFailure) {
        const status = error.cliError.status;
        if (status === 401 || status === 403) throw error;
        if (isTransient(error)) consecutiveFailures += 1;
      } else consecutiveFailures += 1;
      // A tracked row is informational here: a failed search must not block the creates.
      if (row.status === 'already-tracked') {
        scoped.push({ ...row, ...trackedFields(row, options.tracked, undefined) });
        continue;
      }
      scoped.push({ ...row, status: 'unresolved', failure: componentSearchFailure(error) });
    }
  }
  return scoped;
}

/** For an already-tracked row: the monitor, and the kept leaves its list does not hold. */
function trackedFields(
  row: ResolvedCandidate,
  tracked: TrackedProviders,
  kept: readonly TrackedComponent[] | undefined,
): { monitor?: TrackedMonitor; untracked?: string[] } {
  if (row.status !== 'already-tracked') return {};
  const monitor = monitorFor(tracked, row.catalog.id);
  if (kept === undefined) return monitor === undefined ? {} : { monitor };
  const list = monitor?.trackedComponentIds ?? null;
  const untracked =
    list === null ? [] : kept.filter((leaf) => !list.includes(leaf.id)).map((leaf) => leaf.name);
  return monitor === undefined ? { untracked } : { monitor, untracked };
}
