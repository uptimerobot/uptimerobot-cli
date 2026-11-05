/**
 * Turns the scan's third-party candidates into catalog rows the account can
 * track: what the account already tracks, what each candidate resolves to in
 * the provider catalog, and how many more third-party services the plan
 * allows.
 *
 * Every call goes through the generated operation definitions and the shared
 * API client, so a renamed path or parameter cannot leave this module talking
 * to a contract that no longer exists. Searches run one at a time, runtime
 * candidates first; a failed search marks its own row `unresolved` and never
 * stops the others. The tracked set comes from the account's monitor list, not
 * from the search rows' `isTracked`, because the catalog is cached for a
 * minute and a row can say "not tracked" right after a create.
 */
import type { ApiClient } from '../../api/client.js';
import { operations } from '../../generated/operations.js';
import { isPlainRecord } from '../objects.js';
import { buildUrl } from '../request.js';
import type { ThirdPartyCandidate } from '../scan/third-party-context.js';
import { normalizeCatalogName } from '../scan/vendors.js';
import { normalizeResult } from '../../output/normalize-result.js';

export interface ApiAccess {
  client: ApiClient;
  apiUrl: URL;
}

/** The provider ids of the account's third-party services, and whether the list was cut short. */
export interface TrackedProviders {
  providerIds: readonly number[];
  partial: boolean;
}

export interface CatalogRow {
  id: number;
  name: string;
  state: string;
  statusPageUrl: string;
}

/** A catalog row the account may already track, by the search row or the account's own list. */
export interface CatalogChoice extends CatalogRow {
  tracked: boolean;
}

export type ResolutionStatus =
  | 'create'
  | 'already-tracked'
  | 'not-in-catalog'
  | 'ambiguous'
  | 'unresolved'
  | 'over-allowance';

export interface ResolvedCandidate extends ThirdPartyCandidate {
  status: ResolutionStatus;
  /** The accepted catalog row, for `create` and `already-tracked`. */
  catalog?: CatalogRow;
  /** The exact-name rows of an `ambiguous` candidate, for the user to pick from. */
  choices?: readonly CatalogChoice[];
  /** True when other rows start with the provider's name and a space (`Datadog EU` beside `Datadog`). */
  regionDefaulted: boolean;
  /** Why an `unresolved` row could not be resolved, and the failure code (`HTTP_429`, `NETWORK_ERROR`). */
  error?: string;
  errorCode?: string;
}

export interface Allowance {
  used: number;
  limit: number;
}

/** A failed API call, with what the command needs to map it to an exit code. */
export class ApiFailure extends Error {
  readonly code: string;
  readonly status?: number;
  readonly payload?: unknown;

  constructor(options: { code: string; message: string; status?: number; payload?: unknown }) {
    super(options.message);
    this.name = 'ApiFailure';
    this.code = options.code;
    if (options.status !== undefined) this.status = options.status;
    if (options.payload !== undefined) this.payload = options.payload;
  }
}

const MONITORS_LIST = operations['monitors:list'];
const PROVIDERS_SEARCH = operations['third-party-providers:list'];
const USER_ME = operations['user:me'];
const PAGE_SIZE = 200;
/** Same stop as `verify`: a cursor that never terminates ends after this many pages. */
const MAX_PAGES = 50;
const JSON_HEADERS = new Headers({ accept: 'application/json' });

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function get(access: ApiAccess, url: URL, method: string): Promise<unknown> {
  let result;
  try {
    result = await access.client.request(url, { headers: JSON_HEADERS, method });
  } catch (error) {
    throw new ApiFailure({ code: 'NETWORK_ERROR', message: describeError(error) });
  }
  if (!result.response.ok) {
    throw new ApiFailure({
      code: `HTTP_${result.response.status}`,
      message: `UptimeRobot API request failed with HTTP ${result.response.status}.`,
      status: result.response.status,
      payload: result.payload,
    });
  }
  return result.payload;
}

function items(payload: unknown): unknown[] {
  const normalized = normalizeResult(payload);
  return isPlainRecord(normalized) && Array.isArray(normalized.items) ? normalized.items : [];
}

function nextCursor(payload: unknown): string | undefined {
  const normalized = normalizeResult(payload);
  return isPlainRecord(normalized) && typeof normalized.nextCursor === 'string'
    ? normalized.nextCursor
    : undefined;
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
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = buildUrl(
      MONITORS_LIST,
      { path: {}, query: { cursor, limit: PAGE_SIZE } },
      access.apiUrl,
    );
    const payload = await get(access, url, MONITORS_LIST.method);
    for (const item of items(payload)) {
      const id = trackedProviderId(item);
      if (id !== undefined) providerIds.add(id);
    }
    const next = nextCursor(payload);
    if (next === undefined || next.length === 0 || seenCursors.has(next)) {
      return { providerIds: [...providerIds], partial: false };
    }
    seenCursors.add(next);
    cursor = next;
  }
  return { providerIds: [...providerIds], partial: true };
}

function catalogRow(item: unknown): CatalogRow | undefined {
  if (!isPlainRecord(item)) return undefined;
  const { id, name, state, statusPageUrl } = item;
  if (typeof id !== 'number' || typeof name !== 'string') return undefined;
  return {
    id,
    name,
    state: typeof state === 'string' ? state : '',
    statusPageUrl: typeof statusPageUrl === 'string' ? statusPageUrl : '',
  };
}

interface SearchRow extends CatalogRow {
  isTracked: boolean;
}

async function search(access: ApiAccess, term: string): Promise<SearchRow[]> {
  const url = buildUrl(PROVIDERS_SEARCH, { path: {}, query: { search: term } }, access.apiUrl);
  const payload = await get(access, url, PROVIDERS_SEARCH.method);
  return items(payload).flatMap((item) => {
    const row = catalogRow(item);
    if (row === undefined) return [];
    const isTracked = isPlainRecord(item) && item.isTracked === true;
    return [{ ...row, isTracked }];
  });
}

function resolveOne(
  candidate: ThirdPartyCandidate,
  rows: readonly SearchRow[],
  tracked: TrackedProviders,
): ResolvedCandidate {
  const wanted = normalizeCatalogName(candidate.provider);
  const regionPrefix = `${candidate.provider.trim().toLowerCase()} `;
  const exact = rows.filter((row) => normalizeCatalogName(row.name) === wanted);
  const regionDefaulted =
    exact.length === 1 &&
    rows.some((row) => row.name.trim().toLowerCase().startsWith(regionPrefix));
  const base = { ...candidate, regionDefaulted };
  const isTracked = (row: SearchRow): boolean =>
    row.isTracked || tracked.providerIds.includes(row.id);
  const [row] = exact;
  if (row === undefined) return { ...base, status: 'not-in-catalog' };
  if (exact.length > 1 && !exact.every(isTracked)) {
    return {
      ...base,
      status: 'ambiguous',
      choices: exact.map((item) => {
        const { isTracked: _, ...rest } = item;
        return { ...rest, tracked: isTracked(item) };
      }),
    };
  }
  const { isTracked: _, ...catalog } = row;
  return { ...base, status: isTracked(row) ? 'already-tracked' : 'create', catalog };
}

export interface ResolveOptions {
  access: ApiAccess;
  /** Build-time candidates are searched only when asked for. */
  includeBuildTime: boolean;
  tracked: TrackedProviders;
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
  for (const candidate of ordered) {
    try {
      const rows = await search(options.access, candidate.searchTerm);
      resolved.push(resolveOne(candidate, rows, options.tracked));
    } catch (error) {
      resolved.push({
        ...candidate,
        status: 'unresolved',
        regionDefaulted: false,
        error: describeError(error),
        errorCode: error instanceof ApiFailure ? error.code : 'NETWORK_ERROR',
      });
    }
  }
  return resolved;
}

/**
 * The account's third-party allowance, or null when the account carries none
 * or the call failed for a reason a retry may clear. A refused credential
 * (401, 403) is thrown: no allowance is not the same as no access.
 */
export async function readAllowance(access: ApiAccess): Promise<Allowance | null> {
  const url = buildUrl(USER_ME, { path: {}, query: {} }, access.apiUrl);
  let payload: unknown;
  try {
    payload = await get(access, url, USER_ME.method);
  } catch (error) {
    if (error instanceof ApiFailure && (error.status === 401 || error.status === 403)) throw error;
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
  let remaining = Math.max(0, allowance.limit - allowance.used);
  const keep = new Set<ResolvedCandidate>();
  for (const cls of ['runtime', 'build-time'] as const) {
    for (const row of rows) {
      if (row.status !== 'create' || row.class !== cls || remaining === 0) continue;
      keep.add(row);
      remaining -= 1;
    }
  }
  return rows.map((row) =>
    row.status === 'create' && !keep.has(row) ? { ...row, status: 'over-allowance' } : row,
  );
}
