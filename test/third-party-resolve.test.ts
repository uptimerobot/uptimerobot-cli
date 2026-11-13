import { describe, expect, it } from 'vitest';
import { createApiClient } from '../src/api/client.js';
import type { ThirdPartyCandidate } from '../src/lib/scan/index.js';
import { runApply } from '../src/lib/third-party/apply.js';
import {
  type ApiAccess,
  type ResolvedCandidate,
  ABORTED_CODE,
  TIME_BUDGET_CODE,
  applyAllowance,
  readAllowance,
  readTrackedProviders,
  resolveCandidates,
} from '../src/lib/third-party/resolve.js';

const API_URL = new URL('https://api.test.invalid/v3');

type Reply = { status: number; body: unknown } | 'network-error';

interface Script {
  /** Replies per search term, consumed in order; the last one repeats. */
  searches?: Record<string, Reply[]>;
  /** Replies for `monitors list`, consumed in order; the last one repeats. */
  monitors?: Reply[];
  me?: Reply;
}

/** Routes requests by path and records them, so a test can assert what was asked. */
function stubApi(script: Script): { access: ApiAccess; requests: string[] } {
  const requests: string[] = [];
  const searchQueues = new Map(
    Object.entries(script.searches ?? {}).map(([term, replies]) => [term, [...replies]]),
  );
  const monitorQueue = [...(script.monitors ?? [])];
  const fetchImplementation: typeof fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    const url = new URL(request.url);
    requests.push(`${url.pathname}${url.search}`);
    let reply: Reply | undefined;
    if (url.pathname.endsWith('/third-party-providers')) {
      const queue = searchQueues.get(url.searchParams.get('search') ?? '') ?? [];
      reply = queue.length > 1 ? queue.shift() : queue[0];
    } else if (url.pathname.endsWith('/monitors')) {
      reply = monitorQueue.length > 1 ? monitorQueue.shift() : monitorQueue[0];
    } else if (url.pathname.endsWith('/user/me')) {
      reply = script.me;
    }
    if (reply === undefined) return new Response('{"data":[]}', { status: 200 });
    if (reply === 'network-error') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(reply.body), {
      headers: { 'content-type': 'application/json' },
      status: reply.status,
    });
  };
  const client = createApiClient({
    apiKey: 'u1-test',
    apiUrl: API_URL,
    environment: 'local',
    fetchImplementation,
    mode: 'agent',
    version: '0.0.0-test',
  });
  return { access: { client, apiUrl: API_URL }, requests };
}

function row(id: number, name: string, isTracked = false): Record<string, unknown> {
  return {
    id,
    name,
    logoUrl: null,
    statusPageUrl: `https://status.${name.toLowerCase().replaceAll(/[^a-z]/g, '')}.example/`,
    state: 'operational',
    matchedComponent: null,
    isTracked,
  };
}

const ok = (body: unknown): Reply => ({ status: 200, body });
const rows = (...items: Record<string, unknown>[]): Reply => ok({ data: items });

function candidate(
  provider: string,
  overrides: Partial<ThirdPartyCandidate> = {},
): ThirdPartyCandidate {
  return {
    provider,
    searchTerm: provider.toLowerCase(),
    class: 'runtime',
    evidence: [
      {
        file: 'package.json',
        line: 3,
        kind: 'npm',
        signal: `${provider.toLowerCase()}@1.0.0`,
        app: '.',
      },
    ],
    components: [],
    ...overrides,
  };
}

function thirdPartyMonitor(id: number, providerId: number): Record<string, unknown> {
  return {
    id,
    friendlyName: `provider-${providerId}`,
    type: 'THIRD_PARTY_SERVICE',
    status: 'UP',
    config: { thirdPartyService: { providerId } },
  };
}

const statuses = (resolved: readonly ResolvedCandidate[]): [string, string][] =>
  resolved.map((item) => [item.provider, item.status]);

const NONE = { providerIds: [], monitors: [], partial: false };

describe('readTrackedProviders', () => {
  it('collects provider ids of third-party monitors across pages', async () => {
    const { access, requests } = stubApi({
      monitors: [
        ok({
          data: [thirdPartyMonitor(1, 801), { id: 2, type: 'HTTP', url: 'https://x.example' }],
          nextLink: 'https://api.test.invalid/v3/monitors?cursor=p2',
        }),
        ok({ data: [thirdPartyMonitor(3, 1124), thirdPartyMonitor(4, 801)] }),
      ],
    });
    const monitor = (monitorId: number, providerId: number) => ({
      monitorId,
      providerId,
      trackedComponentIds: null,
      needsReview: false,
    });
    expect(await readTrackedProviders(access)).toEqual({
      providerIds: [801, 1124],
      monitors: [monitor(1, 801), monitor(3, 1124), monitor(4, 801)],
      partial: false,
    });
    expect(requests).toEqual(['/v3/monitors?limit=200', '/v3/monitors?limit=200&cursor=p2']);
  });

  it('refuses a monitor list that is not one instead of reading it as empty', async () => {
    for (const body of ['<html>captive portal</html>', { data: 'nope' }, { ok: true }]) {
      const { access } = stubApi({ monitors: [{ status: 200, body }] });
      await expect(readTrackedProviders(access)).rejects.toMatchObject({
        cliError: { code: 'INVALID_RESPONSE' },
      });
    }
  });

  it('stops on a cursor it has already followed and calls the set partial', async () => {
    const loop = ok({ data: [thirdPartyMonitor(1, 801)], nextCursor: 'again' });
    const { access, requests } = stubApi({ monitors: [loop, loop, loop] });
    expect(await readTrackedProviders(access)).toMatchObject({
      providerIds: [801],
      monitors: [{ monitorId: 1, providerId: 801 }],
      partial: true,
    });
    expect(requests).toHaveLength(2);
  });

  it('reads exactly fifty pages without calling the set partial', async () => {
    const pages = Array.from({ length: 50 }, (_, index) =>
      ok({
        data: [thirdPartyMonitor(index, 100 + index)],
        ...(index < 49 ? { nextCursor: `c${index}` } : {}),
      }),
    );
    const { access } = stubApi({ monitors: pages });
    const tracked = await readTrackedProviders(access);
    expect(tracked).toMatchObject({ partial: false });
    expect(tracked.providerIds).toHaveLength(50);
  });

  it('reports a partial set at the page cap', async () => {
    const pages = Array.from({ length: 60 }, (_, index) =>
      ok({ data: [thirdPartyMonitor(index, 100 + index)], nextCursor: `c${index}` }),
    );
    const { access } = stubApi({ monitors: pages });
    const tracked = await readTrackedProviders(access);
    expect(tracked.partial).toBe(true);
    expect(tracked.providerIds).toHaveLength(50);
  });

  it('ignores items without a provider id', async () => {
    const { access } = stubApi({
      monitors: [
        ok({
          data: [
            { id: 1, type: 'THIRD_PARTY_SERVICE', config: {} },
            {
              id: 2,
              type: 'THIRD_PARTY_SERVICE',
              config: { thirdPartyService: { providerId: 'x' } },
            },
            { id: 4, type: 'HTTP', config: { thirdPartyService: { providerId: 9 } } },
            {
              id: 5,
              type: 'THIRD_PARTY_SERVICE',
              config: { thirdPartyService: { providerId: 1.5 } },
            },
            thirdPartyMonitor(3, 7),
          ],
        }),
      ],
    });
    expect(await readTrackedProviders(access)).toMatchObject({
      providerIds: [7],
      monitors: [{ providerId: 7 }],
      partial: false,
    });
  });

  it('throws the API failure so the command can map it', async () => {
    const { access } = stubApi({ monitors: [{ status: 401, body: { code: 'UNAUTHORIZED' } }] });
    await expect(readTrackedProviders(access)).rejects.toMatchObject({
      cliError: { code: 'HTTP_401', apiCode: 'UNAUTHORIZED', status: 401 },
      exitCode: 4,
    });
    const offline = stubApi({ monitors: ['network-error'] });
    await expect(readTrackedProviders(offline.access)).rejects.toMatchObject({
      cliError: { code: 'NETWORK_ERROR' },
      exitCode: 1,
    });
  });
});

describe('resolveCandidates', () => {
  it('accepts the one exact-name row and nothing that merely looks alike', async () => {
    const { access, requests } = stubApi({
      searches: {
        stripe: [rows(row(801, 'Stripe'), row(802, 'Stripe Terminal'))],
        clerk: [rows(row(900, 'Clerk.io'), row(901, 'Clerk Chat'))],
        supabase: [rows(row(1124, 'Supabase', true))],
        braintree: [rows()],
        vercel: [rows(row(861, 'Vercel'), row(862, 'vercel '))],
      },
    });
    const resolved = await resolveCandidates(
      [
        candidate('Stripe'),
        candidate('Clerk'),
        candidate('Supabase'),
        candidate('Braintree'),
        candidate('Vercel'),
      ],
      { access, includeBuildTime: false, tracked: NONE },
    );
    expect(statuses(resolved)).toEqual([
      ['Stripe', 'create'],
      ['Clerk', 'not-in-catalog'],
      ['Supabase', 'already-tracked'],
      ['Braintree', 'not-in-catalog'],
      ['Vercel', 'ambiguous'],
    ]);
    expect(resolved[0]).toMatchObject({
      catalog: {
        id: 801,
        name: 'Stripe',
        state: 'operational',
        statusPageUrl: 'https://status.stripe.example/',
      },
    });
    expect(resolved[4]).toMatchObject({
      choices: [
        {
          id: 861,
          name: 'Vercel',
          state: 'operational',
          statusPageUrl: 'https://status.vercel.example/',
          isTracked: false,
        },
        {
          id: 862,
          name: 'vercel ',
          state: 'operational',
          statusPageUrl: 'https://status.vercel.example/',
          isTracked: false,
        },
      ],
    });
    expect(resolved[2]).toMatchObject({ catalog: { id: 1124, name: 'Supabase' } });
    expect(requests).toEqual([
      '/v3/third-party-providers?search=stripe',
      '/v3/third-party-providers?search=clerk',
      '/v3/third-party-providers?search=supabase',
      '/v3/third-party-providers?search=braintree',
      '/v3/third-party-providers?search=vercel',
    ]);
  });

  it('treats a provider in the account list as tracked even when the search row says otherwise', async () => {
    const { access } = stubApi({ searches: { stripe: [rows(row(801, 'Stripe', false))] } });
    const resolved = await resolveCandidates([candidate('Stripe')], {
      access,
      includeBuildTime: false,
      tracked: { providerIds: [801], monitors: [], partial: false },
    });
    expect(statuses(resolved)).toEqual([['Stripe', 'already-tracked']]);
  });

  it('notes when a region-split provider resolved to its default row', async () => {
    const { access } = stubApi({
      searches: {
        datadog: [rows(row(50, 'Datadog'), row(51, 'Datadog EU'), row(52, 'Datadog US3'))],
      },
    });
    const resolved = await resolveCandidates([candidate('Datadog')], {
      access,
      includeBuildTime: false,
      tracked: NONE,
    });
    expect(resolved[0]).toMatchObject({ status: 'create', regionDefaulted: true });
    expect(resolved[0]).toMatchObject({ catalog: { id: 50 } });
  });

  it('does not take a longer unrelated name for a region row', async () => {
    const { access } = stubApi({
      searches: {
        render: [rows(row(70, 'Render'), row(71, 'Rendertron'))],
        stripe: [rows(row(801, 'Stripe'), row(802, 'Stripe Terminal'))],
      },
    });
    const resolved = await resolveCandidates([candidate('Render'), candidate('Stripe')], {
      access,
      includeBuildTime: false,
      tracked: NONE,
    });
    expect(resolved).toMatchObject([
      { provider: 'Render', status: 'create', regionDefaulted: false },
      { provider: 'Stripe', status: 'create', regionDefaulted: true },
    ]);
  });

  it('shows which ambiguous choice the account already tracks, and resolves when every choice is tracked', async () => {
    const { access } = stubApi({
      searches: {
        vercel: [rows(row(861, 'Vercel'), row(862, 'vercel ', true))],
        stripe: [rows(row(801, 'Stripe', true), row(803, 'STRIPE'))],
      },
    });
    const resolved = await resolveCandidates([candidate('Vercel'), candidate('Stripe')], {
      access,
      includeBuildTime: false,
      tracked: { providerIds: [803], monitors: [], partial: false },
    });
    expect(resolved[0]).toMatchObject({ status: 'ambiguous' });
    const ambiguous = resolved[0];
    if (ambiguous?.status !== 'ambiguous') throw new Error('expected ambiguous');
    expect(ambiguous.choices.map((choice) => [choice.id, choice.isTracked])).toEqual([
      [861, false],
      [862, true],
    ]);
    // Both rows are tracked; the one the account's own list names is reported.
    expect(resolved[1]).toMatchObject({ status: 'already-tracked', catalog: { id: 803 } });
  });

  it('resolves nothing for no candidates and searches by the search term, not the name', async () => {
    const { access, requests } = stubApi({
      searches: { azure: [rows(row(9, 'Microsoft Azure'))] },
    });
    expect(await resolveCandidates([], { access, includeBuildTime: true, tracked: NONE })).toEqual(
      [],
    );
    const resolved = await resolveCandidates(
      [candidate('Microsoft Azure', { searchTerm: 'azure' })],
      { access, includeBuildTime: false, tracked: NONE },
    );
    expect(statuses(resolved)).toEqual([['Microsoft Azure', 'create']]);
    expect(requests).toEqual(['/v3/third-party-providers?search=azure']);
  });

  it('asks runtime candidates first and build-time only when included', async () => {
    const { access, requests } = stubApi({
      searches: { github: [rows(row(6, 'GitHub'))], stripe: [rows(row(801, 'Stripe'))] },
    });
    const candidates = [candidate('GitHub', { class: 'build-time' }), candidate('Stripe')];
    const withoutBuildTime = await resolveCandidates(candidates, {
      access,
      includeBuildTime: false,
      tracked: NONE,
    });
    expect(statuses(withoutBuildTime)).toEqual([['Stripe', 'create']]);
    expect(requests).toEqual(['/v3/third-party-providers?search=stripe']);

    requests.length = 0;
    const withBuildTime = await resolveCandidates(candidates, {
      access,
      includeBuildTime: true,
      tracked: NONE,
    });
    expect(statuses(withBuildTime)).toEqual([
      ['Stripe', 'create'],
      ['GitHub', 'create'],
    ]);
    expect(requests).toEqual([
      '/v3/third-party-providers?search=stripe',
      '/v3/third-party-providers?search=github',
    ]);
  });

  const limited: Reply = {
    status: 429,
    body: { code: 'RATE_LIMITED', message: 'Too many requests' },
  };

  it('recovers from a transient rate limit through the client retries', async () => {
    const { access } = stubApi({
      searches: { stripe: [limited, limited, rows(row(801, 'Stripe'))] },
    });
    const resolved = await resolveCandidates([candidate('Stripe')], {
      access,
      includeBuildTime: false,
      tracked: NONE,
    });
    expect(statuses(resolved)).toEqual([['Stripe', 'create']]);
  }, 15_000);

  it('marks a persistent rate limit unresolved with the upstream message, and goes on', async () => {
    const { access } = stubApi({
      searches: { vercel: [limited], sentry: [rows(row(3, 'Sentry'))] },
    });
    const resolved = await resolveCandidates([candidate('Vercel'), candidate('Sentry')], {
      access,
      includeBuildTime: false,
      tracked: NONE,
    });
    expect(resolved[0]).toMatchObject({
      status: 'unresolved',
      failure: { code: 'HTTP_429', message: 'Too many requests' },
    });
    expect(statuses(resolved)[1]).toEqual(['Sentry', 'create']);
  }, 15_000);

  it('marks a transport failure unresolved', async () => {
    const { access } = stubApi({ searches: { resend: ['network-error'] } });
    const [resolved] = await resolveCandidates([candidate('Resend')], {
      access,
      includeBuildTime: false,
      tracked: NONE,
    });
    expect(resolved).toMatchObject({
      status: 'unresolved',
      failure: { code: 'NETWORK_ERROR', message: expect.stringMatching(/network error/i) },
    });
  }, 15_000);

  it('stops asking after three failures in a row and says so on the rest', async () => {
    const { access, requests } = stubApi({
      searches: {
        a: ['network-error'],
        b: ['network-error'],
        c: ['network-error'],
        d: [rows(row(1, 'D'))],
      },
    });
    const resolved = await resolveCandidates(
      [candidate('A'), candidate('B'), candidate('C'), candidate('D')],
      { access, includeBuildTime: false, tracked: NONE },
    );
    expect(resolved.map((item) => item.status)).toEqual([
      'unresolved',
      'unresolved',
      'unresolved',
      'unresolved',
    ]);
    expect(resolved[3]).toMatchObject({ failure: { code: ABORTED_CODE } });
    expect(requests.some((path) => path.endsWith('search=d'))).toBe(false);
  }, 20_000);

  it('resets the failure count after a success', async () => {
    const { access } = stubApi({
      searches: {
        a: ['network-error'],
        b: ['network-error'],
        c: [rows(row(1, 'C'))],
        d: ['network-error'],
        e: ['network-error'],
        f: [rows(row(2, 'F'))],
      },
    });
    const resolved = await resolveCandidates(
      ['A', 'B', 'C', 'D', 'E', 'F'].map((name) => candidate(name)),
      { access, includeBuildTime: false, tracked: NONE },
    );
    expect(statuses(resolved).map(([, status]) => status)).toEqual([
      'unresolved',
      'unresolved',
      'create',
      'unresolved',
      'unresolved',
      'create',
    ]);
  }, 30_000);

  it('rejects a catalog that is not one, and rows without a usable id', async () => {
    const { access } = stubApi({
      searches: {
        stripe: [{ status: 200, body: '<html>captive portal</html>' }],
        vercel: [{ status: 200, body: { data: 'nope' } }],
        resend: [
          rows(row(0, 'Resend'), row(1.5, 'Resend'), row(-3, 'Resend'), {
            ...row(7, 'Resend'),
            id: '7',
          }),
        ],
      },
    });
    const resolved = await resolveCandidates(
      [candidate('Stripe'), candidate('Vercel'), candidate('Resend')],
      { access, includeBuildTime: false, tracked: NONE },
    );
    expect(resolved[0]).toMatchObject({
      status: 'unresolved',
      failure: { code: 'INVALID_RESPONSE' },
    });
    expect(resolved[1]).toMatchObject({
      status: 'unresolved',
      failure: { code: 'INVALID_RESPONSE' },
    });
    expect(resolved[2]).toMatchObject({ status: 'not-in-catalog', seen: [] });
  });

  it('throws on a refused credential instead of marking the row unresolved', async () => {
    const { access } = stubApi({ searches: { stripe: [{ status: 401, body: {} }] } });
    await expect(
      resolveCandidates([candidate('Stripe')], { access, includeBuildTime: false, tracked: NONE }),
    ).rejects.toMatchObject({ cliError: { status: 401 } });
  });

  it('stops on a 404, which is the account lacking the feature, not a missing term', async () => {
    const { access, requests } = stubApi({
      searches: { stripe: [{ status: 404, body: {} }], vercel: [rows(row(861, 'Vercel'))] },
    });
    await expect(
      resolveCandidates([candidate('Stripe'), candidate('Vercel')], {
        access,
        includeBuildTime: false,
        tracked: NONE,
      }),
    ).rejects.toMatchObject({
      cliError: {
        code: 'THIRD_PARTY_UNAVAILABLE',
        status: 404,
        message: expect.stringContaining('not available on this account'),
      },
    });
    expect(requests.filter((path) => path.includes('third-party-providers'))).toHaveLength(1);
  });

  it('does not count a failure that belongs to one term toward the abort', async () => {
    const missing: Reply = { status: 400, body: {} };
    const { access } = stubApi({
      searches: { a: [missing], b: [missing], c: [missing], d: [rows(row(1, 'D'))] },
    });
    const resolved = await resolveCandidates(
      ['A', 'B', 'C', 'D'].map((name) => candidate(name)),
      { access, includeBuildTime: false, tracked: NONE },
    );
    expect(statuses(resolved).map(([, status]) => status)).toEqual([
      'unresolved',
      'unresolved',
      'unresolved',
      'create',
    ]);
    expect(resolved[0]).toMatchObject({ failure: { code: 'HTTP_400' } });
  });

  it('leaves the rest unresolved once the time budget is spent', async () => {
    const { access, requests } = stubApi({
      searches: { a: [rows(row(1, 'A'))], b: [rows(row(2, 'B'))] },
    });
    const resolved = await resolveCandidates([candidate('A'), candidate('B')], {
      access,
      includeBuildTime: false,
      tracked: NONE,
      timeBudgetMs: -1,
    });
    expect(resolved.map((item) => item.status)).toEqual(['unresolved', 'unresolved']);
    expect(resolved[0]).toMatchObject({ failure: { code: TIME_BUDGET_CODE } });
    expect(requests).toEqual([]);
  });

  it('collapses duplicate rows with one id', async () => {
    const { access } = stubApi({
      searches: { stripe: [rows(row(801, 'Stripe'), row(801, 'Stripe'))] },
    });
    const [resolved] = await resolveCandidates([candidate('Stripe')], {
      access,
      includeBuildTime: false,
      tracked: NONE,
    });
    expect(resolved).toMatchObject({ status: 'create', catalog: { id: 801 } });
  });

  it('names the rows a search returned when none matched', async () => {
    const seen = Array.from({ length: 12 }, (_, index) =>
      row(100 + index, `Clerk Variant ${index}`),
    );
    const { access } = stubApi({ searches: { clerk: [rows(...seen)], braintree: [rows()] } });
    const resolved = await resolveCandidates([candidate('Clerk'), candidate('Braintree')], {
      access,
      includeBuildTime: false,
      tracked: NONE,
    });
    expect(resolved[0]).toMatchObject({ status: 'not-in-catalog' });
    if (resolved[0]?.status !== 'not-in-catalog') throw new Error('expected not-in-catalog');
    expect(resolved[0].seen).toHaveLength(10);
    expect(resolved[0].seen[0]).toBe('Clerk Variant 0');
    expect(resolved[1]).toMatchObject({ status: 'not-in-catalog', seen: [] });
  });

  it('keeps every candidate field on the resolved row', async () => {
    const { access } = stubApi({ searches: { stripe: [rows(row(801, 'Stripe'))] } });
    const [resolved] = await resolveCandidates([candidate('Stripe', { components: [] })], {
      access,
      includeBuildTime: false,
      tracked: NONE,
    });
    expect(resolved).toMatchObject({
      provider: 'Stripe',
      searchTerm: 'stripe',
      class: 'runtime',
      components: [],
      evidence: [{ file: 'package.json', line: 3 }],
      regionDefaulted: false,
    });
  });
});

describe('runApply', () => {
  it('hands the proposal to the caller before any create when --confirm skips the prompt', async () => {
    const { access, requests } = stubApi({
      searches: { stripe: [ok({ data: [row(801, 'Stripe')] })] },
      me: ok({ data: { dependencyMonitorsCount: 0, dependencyMonitorLimit: 10 } }),
    });
    let requestsWhenShown = -1;
    const run = await runApply({
      candidates: [candidate('Stripe')],
      selection: { only: [], skip: [], includeBuildTime: false },
      access,
      confirmFlag: true,
      confirm: () => Promise.reject(new Error('--confirm must not ask')),
      onProposal: () => {
        requestsWhenShown = requests.length;
      },
    });
    expect(run.confirmation).toBe('confirmed');
    expect(requestsWhenShown).toBeGreaterThan(-1);
    expect(requests.slice(0, requestsWhenShown)).not.toContain('/v3/monitors');
    expect(requests.slice(requestsWhenShown)).toContain('/v3/monitors');
  });
});

describe('readAllowance', () => {
  it('reads the third-party allowance from the account', async () => {
    const { access, requests } = stubApi({
      me: ok({
        data: { email: 'x@example.test', dependencyMonitorsCount: 3, dependencyMonitorLimit: 10 },
      }),
    });
    expect(await readAllowance(access)).toEqual({ used: 3, limit: 10 });
    expect(requests).toEqual(['/v3/user/me']);
  });

  it('returns null when the account carries no allowance fields or the call fails', async () => {
    expect(await readAllowance(stubApi({ me: ok({ data: { email: 'x' } }) }).access)).toBeNull();
    expect(
      await readAllowance(
        stubApi({ me: ok({ email: 'x', dependencyMonitorsCount: 3, dependencyMonitorLimit: 10 }) })
          .access,
      ),
    ).toEqual({ used: 3, limit: 10 });
    expect(await readAllowance(stubApi({ me: { status: 500, body: {} } }).access)).toBeNull();
    expect(await readAllowance(stubApi({ me: 'network-error' }).access)).toBeNull();
  });

  it('throws when the credential is refused', async () => {
    await expect(
      readAllowance(stubApi({ me: { status: 401, body: {} } }).access),
    ).rejects.toMatchObject({ cliError: { status: 401 } });
    await expect(
      readAllowance(stubApi({ me: { status: 403, body: {} } }).access),
    ).rejects.toMatchObject({ cliError: { status: 403 } });
  });
});

describe('applyAllowance', () => {
  const resolved = (
    provider: string,
    cls: 'runtime' | 'build-time',
    status: 'create' | 'already-tracked' = 'create',
  ): ResolvedCandidate => ({
    ...candidate(provider, { class: cls }),
    status,
    catalog: { id: 1, name: provider, state: 'operational', statusPageUrl: '' },
    regionDefaulted: false,
  });

  it('marks create rows beyond the remaining allowance, runtime kept before build-time', () => {
    const rows = applyAllowance(
      [
        resolved('GitHub', 'build-time'),
        resolved('Stripe', 'runtime'),
        resolved('Supabase', 'runtime', 'already-tracked'),
        resolved('Vercel', 'runtime'),
      ],
      { used: 9, limit: 10 },
    );
    expect(statuses(rows)).toEqual([
      ['GitHub', 'over-allowance'],
      ['Stripe', 'create'],
      ['Supabase', 'already-tracked'],
      ['Vercel', 'over-allowance'],
    ]);
  });

  it('changes nothing without an allowance or with room to spare', () => {
    const input = [resolved('Stripe', 'runtime'), resolved('GitHub', 'build-time')];
    expect(statuses(applyAllowance(input, null))).toEqual([
      ['Stripe', 'create'],
      ['GitHub', 'create'],
    ]);
    expect(statuses(applyAllowance(input, { used: 0, limit: 10 }))).toEqual([
      ['Stripe', 'create'],
      ['GitHub', 'create'],
    ]);
  });

  it('keeps the first runtime rows when runtime rows alone exceed the allowance', () => {
    const rows = applyAllowance(
      [resolved('Stripe', 'runtime'), resolved('Vercel', 'runtime'), resolved('Resend', 'runtime')],
      { used: 8, limit: 10 },
    );
    expect(statuses(rows)).toEqual([
      ['Stripe', 'create'],
      ['Vercel', 'create'],
      ['Resend', 'over-allowance'],
    ]);
  });

  it('never spends a slot on a row that is not a create', () => {
    const rows = applyAllowance(
      [resolved('Supabase', 'runtime', 'already-tracked'), resolved('Stripe', 'runtime')],
      { used: 9, limit: 10 },
    );
    expect(statuses(rows)).toEqual([
      ['Supabase', 'already-tracked'],
      ['Stripe', 'create'],
    ]);
  });

  it('rounds a fractional allowance down', () => {
    const rows = applyAllowance(
      [resolved('Stripe', 'runtime'), resolved('Vercel', 'runtime'), resolved('Resend', 'runtime')],
      { used: 0, limit: 2.5 },
    );
    expect(statuses(rows).map(([, status]) => status)).toEqual([
      'create',
      'create',
      'over-allowance',
    ]);
  });

  it('treats a limit below the used count as no room', () => {
    expect(
      statuses(applyAllowance([resolved('Stripe', 'runtime')], { used: 12, limit: 10 })),
    ).toEqual([['Stripe', 'over-allowance']]);
  });

  it('marks every create row when the limit is reached', () => {
    expect(
      statuses(applyAllowance([resolved('Stripe', 'runtime')], { used: 10, limit: 10 })),
    ).toEqual([['Stripe', 'over-allowance']]);
  });
});
