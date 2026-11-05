import { describe, expect, it } from 'vitest';
import { createApiClient } from '../src/api/client.js';
import type { ThirdPartyCandidate } from '../src/lib/scan/index.js';
import {
  type ApiAccess,
  type ResolvedCandidate,
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
    hints: [],
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

const NONE = { providerIds: [], partial: false };

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
    expect(await readTrackedProviders(access)).toEqual({
      providerIds: [801, 1124],
      partial: false,
    });
    expect(requests).toEqual(['/v3/monitors?limit=200', '/v3/monitors?limit=200&cursor=p2']);
  });

  it('stops on a cursor it has already followed', async () => {
    const loop = ok({ data: [thirdPartyMonitor(1, 801)], nextCursor: 'again' });
    const { access, requests } = stubApi({ monitors: [loop, loop, loop] });
    expect(await readTrackedProviders(access)).toEqual({ providerIds: [801], partial: false });
    expect(requests).toHaveLength(2);
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
            thirdPartyMonitor(3, 7),
          ],
        }),
      ],
    });
    expect(await readTrackedProviders(access)).toEqual({ providerIds: [7], partial: false });
  });

  it('throws the API failure so the command can map it', async () => {
    const { access } = stubApi({ monitors: [{ status: 401, body: { code: 'UNAUTHORIZED' } }] });
    await expect(readTrackedProviders(access)).rejects.toMatchObject({ status: 401 });
    const offline = stubApi({ monitors: ['network-error'] });
    await expect(readTrackedProviders(offline.access)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
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
    expect(resolved[0]?.catalog).toEqual({
      id: 801,
      name: 'Stripe',
      state: 'operational',
      statusPageUrl: 'https://status.stripe.example/',
    });
    expect(resolved[4]?.choices?.map((choice) => choice.id)).toEqual([861, 862]);
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
      tracked: { providerIds: [801], partial: false },
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
    expect(resolved[0]?.catalog?.id).toBe(50);
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

  it('recovers from a transient rate limit through the client retries, and marks a persistent one unresolved', async () => {
    const limited: Reply = { status: 429, body: { code: 'RATE_LIMITED' } };
    const { access } = stubApi({
      searches: {
        stripe: [limited, limited, rows(row(801, 'Stripe'))],
        vercel: [limited],
        resend: ['network-error'],
        sentry: [rows(row(3, 'Sentry'))],
      },
    });
    const resolved = await resolveCandidates(
      [candidate('Stripe'), candidate('Vercel'), candidate('Resend'), candidate('Sentry')],
      { access, includeBuildTime: false, tracked: NONE },
    );
    expect(statuses(resolved)).toEqual([
      ['Stripe', 'create'],
      ['Vercel', 'unresolved'],
      ['Resend', 'unresolved'],
      ['Sentry', 'create'],
    ]);
    expect(resolved[1]?.error).toContain('429');
    expect(resolved[2]?.error).toMatch(/fetch failed|network/i);
  }, 15_000);

  it('keeps every candidate field on the resolved row', async () => {
    const { access } = stubApi({ searches: { stripe: [rows(row(801, 'Stripe'))] } });
    const [resolved] = await resolveCandidates([candidate('Stripe', { hints: ['s3'] })], {
      access,
      includeBuildTime: false,
      tracked: NONE,
    });
    expect(resolved).toMatchObject({
      provider: 'Stripe',
      searchTerm: 'stripe',
      class: 'runtime',
      hints: ['s3'],
      evidence: [{ file: 'package.json', line: 3 }],
      regionDefaulted: false,
    });
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
});

describe('applyAllowance', () => {
  const resolved = (
    provider: string,
    cls: 'runtime' | 'build-time',
    status: ResolvedCandidate['status'] = 'create',
  ): ResolvedCandidate => ({
    ...candidate(provider, { class: cls }),
    status,
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

  it('marks every create row when the limit is reached', () => {
    expect(
      statuses(applyAllowance([resolved('Stripe', 'runtime')], { used: 10, limit: 10 })),
    ).toEqual([['Stripe', 'over-allowance']]);
  });
});
