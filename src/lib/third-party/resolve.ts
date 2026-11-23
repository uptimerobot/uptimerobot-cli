/**
 * Turns the scan's third-party candidates into catalog rows the account can
 * track: what the account already tracks, what each candidate resolves to in
 * the provider catalog, and how many more third-party services the plan
 * allows.
 *
 * Every call goes through the generated operation definitions and the shared
 * API client, so a renamed path or parameter cannot leave this module talking
 * to a contract that no longer exists. `readTrackedProviders` and a refused
 * credential in `readAllowance` throw an `ApiFailure`; any other allowance
 * failure reads as "unknown" (null); a refused credential on any search is
 * thrown too. Any other failed search marks its own row `unresolved` and
 * never stops the others, except that three transient failures in a row
 * (rate limit, server error, transport) or a run past its time budget leave
 * the rest unresolved, since those will not clear by asking again. Searches run one at a time: the catalog endpoint is rate
 * limited and sequential order keeps the proposal deterministic. The tracked
 * set comes from the account's monitor list, not from the search rows'
 * `isTracked`, because the catalog is cached (the `/third-party-providers`
 * description in `openapi/openapi.yaml` says one minute) and a row can say
 * "not tracked" right after a create.
 */
import { requestJson } from '../../api/client.js';
import type { ApiAccess } from '../auth.js';
import { ApiFailure } from '../../api/errors.js';
import { operations } from '../../generated/operations.js';
import { isPlainRecord } from '../objects.js';
import { PAGE_SIZE, pageThrough } from '../paginate.js';
import { buildUrl } from '../request.js';
import type { ThirdPartyCandidate } from '../scan/third-party-context.js';
import { normalizeCatalogName } from '../scan/vendors.js';
import type { Scoping } from './scope.js';

export type { ApiAccess } from '../auth.js';

/** One third-party service monitor of the account, as far as scoping needs it. */
export interface TrackedMonitor {
  monitorId: number;
  providerId: number;
  /** `null` tracks every component. */
  trackedComponentIds: readonly number[] | null;
  needsReview: boolean;
}

/** The account's third-party services by provider id, and whether the list was cut short. */
export interface TrackedProviders {
  providerIds: readonly number[];
  monitors: readonly TrackedMonitor[];
  partial: boolean;
}

export interface CatalogRow {
  id: number;
  name: string;
  state: string;
  statusPageUrl: string;
}

/** A catalog row and whether the account tracks it, by the search row or its own monitor list. */
export interface CatalogChoice extends CatalogRow {
  isTracked: boolean;
}

export type ResolutionStatus = ResolvedCandidate['status'];

/** The failure that left a row unresolved: the normalized error's code and message. */
export interface ResolutionFailure {
  code: string;
  message: string;
}

/**
 * One candidate after resolution. The status says which fields are present:
 * a catalog row for the statuses that found exactly one, the choices for an
 * ambiguous one, the names the search returned for one not in the catalog,
 * and the failure for one that could not be asked.
 */
export type ResolvedCandidate =
  | (ThirdPartyCandidate & {
      status: 'create' | 'already-tracked' | 'over-allowance';
      catalog: CatalogRow;
      /** True when other rows start with the provider's name and a space (`Datadog EU` beside `Datadog`). */
      regionDefaulted: boolean;
      /** The account's monitor for the provider, on an `already-tracked` row that was scoped. */
      monitor?: TrackedMonitor;
      /** Kept leaf names the monitor's list does not hold, on an `already-tracked` row. */
      untracked?: readonly string[];
    } & Partial<Scoping>)
  | (ThirdPartyCandidate & { status: 'ambiguous'; choices: readonly CatalogChoice[] })
  | (ThirdPartyCandidate & { status: 'not-in-catalog'; seen: readonly string[] })
  | (ThirdPartyCandidate & { status: 'unresolved'; failure: ResolutionFailure });

export interface Allowance {
  used: number;
  limit: number;
}

const MONITORS_LIST = operations['monitors:list'];
const PROVIDERS_SEARCH = operations['third-party-providers:list'];
const USER_ME = operations['user:me'];
/** Names kept on a `not-in-catalog` row, enough to explain the miss without a repro. */
const MAX_SEEN_NAMES = 10;
/** Consecutive transient failures after which the remaining candidates are left unresolved. */
export const MAX_CONSECUTIVE_FAILURES = 3;
/** Wall-clock budget for the searches; each retried 429 can cost ten seconds. */
export const DEFAULT_TIME_BUDGET_MS = 60_000;
export const ABORTED_CODE = 'ABORTED_AFTER_FAILURES';
export const TIME_BUDGET_CODE = 'ABORTED_AFTER_TIME_BUDGET';
const TRANSIENT_STATUSES = new Set([408, 429]);

function trackedMonitor(item: unknown): TrackedMonitor | undefined {
  if (!isPlainRecord(item) || typeof item.id !== 'number') return undefined;
  const providerId = trackedProviderId(item);
  if (providerId === undefined) return undefined;
  const config = isPlainRecord(item.config) ? item.config : {};
  const service = isPlainRecord(config.thirdPartyService) ? config.thirdPartyService : {};
  const ids = service.trackedComponentIds;
  return {
    monitorId: item.id,
    providerId,
    trackedComponentIds: Array.isArray(ids)
      ? ids.filter((id): id is number => typeof id === 'number')
      : null,
    needsReview: service.needsReview === true,
  };
}

function trackedProviderId(item: unknown): number | undefined {
  if (!isPlainRecord(item) || item.type !== 'THIRD_PARTY_SERVICE') return undefined;
  const config = isPlainRecord(item.config) ? item.config.thirdPartyService : undefined;
  const id = isPlainRecord(config) ? config.providerId : undefined;
  return typeof id === 'number' && Number.isInteger(id) ? id : undefined;
}

/** Pages the account's monitors and keeps the provider id of every third-party service. */
export async function readTrackedProviders(access: ApiAccess): Promise<TrackedProviders> {
  const providerIds = new Set<number>();
  const monitors: TrackedMonitor[] = [];
  const seenMonitors = new Set<number>();
  const { truncated } = await pageThrough({
    fetchPage: (cursor) =>
      requestJson(
        access.client,
        buildUrl(MONITORS_LIST, { path: {}, query: { cursor, limit: PAGE_SIZE } }, access.apiUrl),
        MONITORS_LIST.method,
      ),
    onItems: (items) => {
      for (const item of items) {
        const monitor = trackedMonitor(item);
        if (monitor === undefined || seenMonitors.has(monitor.monitorId)) continue;
        seenMonitors.add(monitor.monitorId);
        providerIds.add(monitor.providerId);
        monitors.push(monitor);
      }
    },
  });
  return { providerIds: [...providerIds], monitors, partial: truncated };
}

function searchRow(item: unknown): CatalogChoice | undefined {
  if (!isPlainRecord(item)) return undefined;
  const { id, name, state, statusPageUrl, isTracked } = item;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return undefined;
  if (typeof name !== 'string') return undefined;
  return {
    id,
    name,
    state: typeof state === 'string' ? state : '',
    statusPageUrl: typeof statusPageUrl === 'string' ? statusPageUrl : '',
    isTracked: isTracked === true,
  };
}

async function search(access: ApiAccess, term: string): Promise<CatalogChoice[]> {
  const url = buildUrl(PROVIDERS_SEARCH, { path: {}, query: { search: term } }, access.apiUrl);
  const payload = await requestJson(access.client, url, PROVIDERS_SEARCH.method);
  if (!isPlainRecord(payload) || !Array.isArray(payload.data)) {
    throw new ApiFailure(
      { code: 'INVALID_RESPONSE', message: 'The provider search did not return a catalog.' },
      1,
    );
  }
  return payload.data.flatMap((item) => {
    const row = searchRow(item);
    return row === undefined ? [] : [row];
  });
}

function withoutTracking({ isTracked: _, ...row }: CatalogChoice): CatalogRow {
  return row;
}

function resolveOne(
  candidate: ThirdPartyCandidate,
  rows: readonly CatalogChoice[],
  tracked: TrackedProviders,
): ResolvedCandidate {
  const wanted = normalizeCatalogName(candidate.provider);
  const regionPrefix = `${candidate.provider.trim().toLowerCase()} `;
  const isTracked = (row: CatalogChoice): boolean =>
    row.isTracked || tracked.providerIds.includes(row.id);
  const exact = [
    ...new Map(
      rows
        .filter((row) => normalizeCatalogName(row.name) === wanted)
        .map((row) => [row.id, { ...row, isTracked: isTracked(row) }]),
    ).values(),
  ];
  // Among rows the account tracks, the one its own monitor list names is the one to report.
  const row = exact.find((item) => tracked.providerIds.includes(item.id)) ?? exact[0];
  if (row === undefined) {
    return {
      ...candidate,
      status: 'not-in-catalog',
      seen: rows.slice(0, MAX_SEEN_NAMES).map((item) => item.name),
    };
  }
  if (exact.length > 1 && !exact.every((item) => item.isTracked)) {
    return { ...candidate, status: 'ambiguous', choices: exact };
  }
  return {
    ...candidate,
    status: row.isTracked ? 'already-tracked' : 'create',
    catalog: withoutTracking(row),
    regionDefaulted: rows.some((item) => item.name.trim().toLowerCase().startsWith(regionPrefix)),
  };
}

export interface ResolveOptions {
  access: ApiAccess;
  /** Build-time candidates are searched only when asked for. */
  includeBuildTime: boolean;
  tracked: TrackedProviders;
  /** Milliseconds the searches may take in all; the rest are left unresolved. */
  timeBudgetMs?: number;
  /** An absolute deadline shared with the component searches; wins over `timeBudgetMs`. */
  deadline?: number;
}

/** A failure a retry may clear, which counts toward the abort; a 400 is this term's alone. */
export function isTransient(error: ApiFailure): boolean {
  const status = error.cliError.status;
  if (status === undefined) return true;
  return TRANSIENT_STATUSES.has(status) || status >= 500;
}

function featureUnavailable(error: ApiFailure): ApiFailure {
  return new ApiFailure(
    {
      ...error.cliError,
      code: 'THIRD_PARTY_UNAVAILABLE',
      message: 'Third-party monitoring is not available on this account.',
    },
    error.exitCode,
  );
}

function failureOf(error: unknown): ResolutionFailure {
  return error instanceof ApiFailure
    ? { code: error.cliError.code, message: error.cliError.message }
    : { code: 'NETWORK_ERROR', message: error instanceof Error ? error.message : String(error) };
}

/**
 * One search per candidate, runtime first, build-time after and only when
 * included. A row is accepted only when its normalized name equals the
 * provider's catalog name, so `Clerk.io` never stands in for `Clerk`.
 */
export async function resolveCandidates(
  candidates: readonly ThirdPartyCandidate[],
  options: ResolveOptions,
): Promise<ResolvedCandidate[]> {
  const ordered = [
    ...candidates.filter((candidate) => candidate.class === 'runtime'),
    ...(options.includeBuildTime
      ? candidates.filter((candidate) => candidate.class === 'build-time')
      : []),
  ];
  const resolved: ResolvedCandidate[] = [];
  const deadline =
    options.deadline ?? Date.now() + (options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
  let consecutiveFailures = 0;
  for (const candidate of ordered) {
    const aborted =
      consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
        ? {
            code: ABORTED_CODE,
            message: `Not asked: the previous ${MAX_CONSECUTIVE_FAILURES} searches failed.`,
          }
        : Date.now() > deadline
          ? { code: TIME_BUDGET_CODE, message: 'Not asked: the searches ran out of time.' }
          : undefined;
    if (aborted !== undefined) {
      resolved.push({ ...candidate, status: 'unresolved', failure: aborted });
      continue;
    }
    try {
      const rows = await search(options.access, candidate.searchTerm);
      resolved.push(resolveOne(candidate, rows, options.tracked));
      consecutiveFailures = 0;
    } catch (error) {
      if (error instanceof ApiFailure) {
        const status = error.cliError.status;
        if (status === 401 || status === 403) throw error;
        // A missing term answers 200 with no rows; the only 404 is the API
        // saying the account has no third-party monitoring, so no search can.
        if (status === 404) throw featureUnavailable(error);
        if (isTransient(error)) consecutiveFailures += 1;
      } else {
        consecutiveFailures += 1;
      }
      resolved.push({ ...candidate, status: 'unresolved', failure: failureOf(error) });
    }
  }
  return resolved;
}

/**
 * The account's third-party allowance, or null when the account carries none
 * or the call failed for a reason a retry may clear: the API still refuses a
 * create past the limit, so an unknown allowance costs a refused create, not
 * a duplicate. A refused credential (401, 403) is thrown: no allowance is not
 * the same as no access.
 */
export async function readAllowance(access: ApiAccess): Promise<Allowance | null> {
  const url = buildUrl(USER_ME, { path: {}, query: {} }, access.apiUrl);
  let payload: unknown;
  try {
    payload = await requestJson(access.client, url, USER_ME.method);
  } catch (error) {
    const status = error instanceof ApiFailure ? error.cliError.status : undefined;
    if (status === 401 || status === 403) throw error;
    return null;
  }
  const record = isPlainRecord(payload) && isPlainRecord(payload.data) ? payload.data : payload;
  if (!isPlainRecord(record)) return null;
  const { dependencyMonitorsCount: used, dependencyMonitorLimit: limit } = record;
  return typeof used === 'number' && typeof limit === 'number' ? { used, limit } : null;
}

/**
 * Marks the `create` rows the allowance cannot hold `over-allowance`. Runtime
 * rows keep their slots first, so a build-time row is the first to go.
 */
export function applyAllowance(
  rows: readonly ResolvedCandidate[],
  allowance: Allowance | null,
): ResolvedCandidate[] {
  if (allowance === null) return [...rows];
  let remaining = Math.max(0, Math.floor(allowance.limit - allowance.used));
  const keep = new Set<ResolvedCandidate>();
  for (const cls of ['runtime', 'build-time'] as const) {
    for (const row of rows) {
      if (row.status !== 'create' || row.class !== cls || remaining <= 0) continue;
      keep.add(row);
      remaining -= 1;
    }
  }
  return rows.map((row) =>
    row.status === 'create' && !keep.has(row) ? { ...row, status: 'over-allowance' } : row,
  );
}
