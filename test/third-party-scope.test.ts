import { describe, expect, it } from 'vitest';
import { createApiClient } from '../src/api/client.js';
import type { ThirdPartyCandidate } from '../src/lib/scan/third-party-context.js';
import type { ApiAccess, ResolvedCandidate } from '../src/lib/third-party/resolve.js';
import {
  COMPONENT_SEARCH_FAILED,
  MAX_TRACKED_COMPONENTS,
  type TermOutcome,
  collectLeaves,
  decideScope,
  keepsLeaf,
  scopeProposal,
} from '../src/lib/third-party/scope.js';

const API_URL = new URL('https://api.test.invalid/v3');

/** A client whose every components call answers the given status, counting the calls. */
function failingApi(status: number | 'network-error'): { access: ApiAccess; calls: string[] } {
  const calls: string[] = [];
  const fetchImplementation: typeof fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    // The client retries a transient status, so one ask can be several fetches; count the asks.
    if (!calls.includes(request.url)) calls.push(request.url);
    if (status === 'network-error') throw new TypeError('fetch failed');
    return new Response(JSON.stringify({ code: 'DOWN', message: 'down' }), {
      headers: { 'content-type': 'application/json' },
      status,
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
  return { access: { client, apiUrl: API_URL }, calls };
}

function createRow(provider: string, id: number, terms: string[]): ResolvedCandidate {
  const candidate: ThirdPartyCandidate = {
    provider,
    searchTerm: provider.toLowerCase(),
    class: 'runtime',
    evidence: [],
    components: terms.map((term) => ({ term, region: null, evidence: [] })),
  };
  return {
    ...candidate,
    status: 'create',
    catalog: { id, name: provider, state: 'operational', statusPageUrl: '' },
    regionDefaulted: false,
  };
}

const leaf = (id: number, region: string | null, global = false) => ({
  id,
  name: `leaf ${id}`,
  region,
  global,
});

describe('collectLeaves', () => {
  it('takes every child, or a childless top-level row itself, and validates ids', () => {
    expect(
      collectLeaves({
        data: [
          {
            id: 1,
            name: 'Parent',
            region: null,
            global: false,
            children: [
              {
                id: 11,
                name: 'Parent (Frankfurt)',
                region: { code: 'eu-central-1' },
                global: false,
              },
              { id: 'x', name: 'bad id' },
              { id: 12, name: 7 },
            ],
          },
          { id: 2, name: 'Global thing', region: null, global: true, children: [] },
          { id: -3, name: 'negative' },
        ],
      }),
    ).toEqual([
      { id: 11, name: 'Parent (Frankfurt)', region: 'eu-central-1', global: false },
      { id: 2, name: 'Global thing', region: null, global: true },
    ]);
  });

  it('refuses a payload without a data array', () => {
    expect(() => collectLeaves({ nope: true })).toThrow('did not return a tree');
  });
});

describe('keepsLeaf', () => {
  it('keeps every leaf for a term without a region, else the region match and the global ones', () => {
    expect(keepsLeaf(leaf(1, 'us-east-1'), null)).toBe(true);
    expect(keepsLeaf(leaf(1, 'eu-central-1'), 'eu-central-1')).toBe(true);
    expect(keepsLeaf(leaf(1, 'us-east-1'), 'eu-central-1')).toBe(false);
    expect(keepsLeaf(leaf(1, null, true), 'eu-central-1')).toBe(true);
    expect(keepsLeaf(leaf(1, null), 'eu-central-1')).toBe(false);
  });
});

describe('decideScope', () => {
  const matched = (term: string, leaves: number): TermOutcome => ({
    term,
    region: null,
    outcome: 'matched',
    leaves,
  });
  const kept = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      name: `c${index}`,
      term: 't',
      region: null,
    }));

  it('scopes only when every term matched and the total is within the cap', () => {
    expect(decideScope([], [])).toMatchObject({ scope: 'whole', scopeReason: 'no-terms' });
    expect(
      decideScope([matched('a', 2), { ...matched('b', 0), outcome: 'missed' }], kept(2)),
    ).toMatchObject({
      scope: 'whole',
      scopeReason: 'term-missed',
      trackedComponents: [],
    });
    expect(decideScope([matched('a', 21)], kept(MAX_TRACKED_COMPONENTS + 1))).toMatchObject({
      scope: 'whole',
      scopeReason: 'too-many',
    });
    const scoped = decideScope([matched('a', 20)], kept(MAX_TRACKED_COMPONENTS));
    expect(scoped.scope).toBe('components');
    expect(scoped.scopeReason).toBeUndefined();
    expect(scoped.trackedComponents).toHaveLength(20);
  });
});

describe('scopeProposal', () => {
  const tracked = { providerIds: [], monitors: [], partial: false };

  /** A client answering each components term with its own tree. */
  function answeringApi(trees: Record<string, unknown>): ApiAccess {
    const fetchImplementation: typeof fetch = async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      const term = new URL(request.url).searchParams.get('search') ?? '';
      return new Response(JSON.stringify(trees[term] ?? { data: [] }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
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
    return { client, apiUrl: API_URL };
  }

  it('keeps a leaf two terms both returned once', async () => {
    const shared = { id: 7, name: 'Shared', region: null, global: true, children: [] };
    const access = answeringApi({
      'AWS Lambda': {
        data: [shared, { id: 8, name: 'Lambda', region: null, global: false, children: [] }],
      },
      'Amazon CloudFront': { data: [shared] },
    });
    const [row] = await scopeProposal(
      [createRow('AWS', 248, ['AWS Lambda', 'Amazon CloudFront'])],
      {
        access,
        tracked,
        deadline: Date.now() + 60_000,
      },
    );
    expect(row).toMatchObject({
      scope: 'components',
      trackedComponents: [
        { id: 7, term: 'AWS Lambda' },
        { id: 8, term: 'AWS Lambda' },
      ],
    });
  });

  it('stops asking after three transient failures in a row and leaves the rest unresolved', async () => {
    const { access, calls } = failingApi(503);
    const rows = [1, 2, 3, 4, 5].map((id) => createRow(`P${id}`, id, ['AWS Lambda']));

    const scoped = await scopeProposal(rows, { access, tracked, deadline: Date.now() + 60_000 });

    expect(calls).toHaveLength(3);
    expect(
      scoped.map((row) => (row.status === 'unresolved' ? row.failure.code : row.status)),
    ).toEqual([
      COMPONENT_SEARCH_FAILED,
      COMPONENT_SEARCH_FAILED,
      COMPONENT_SEARCH_FAILED,
      'ABORTED_AFTER_FAILURES',
      'ABORTED_AFTER_FAILURES',
    ]);
  });

  it('counts a network failure like a transient status and names the component search', async () => {
    const { access } = failingApi('network-error');
    const [row] = await scopeProposal([createRow('AWS', 248, ['AWS Lambda'])], {
      access,
      tracked,
      deadline: Date.now() + 60_000,
    });
    expect(row).toMatchObject({
      status: 'unresolved',
      failure: {
        code: COMPONENT_SEARCH_FAILED,
        message: expect.stringMatching(/^component search failed: .*network error/),
      },
    });
  });

  it('does not count a 400 toward the abort, but still leaves the row unresolved', async () => {
    const { access, calls } = failingApi(400);
    const rows = [1, 2, 3, 4].map((id) => createRow(`P${id}`, id, ['AWS Lambda']));
    const scoped = await scopeProposal(rows, { access, tracked, deadline: Date.now() + 60_000 });
    expect(calls).toHaveLength(4);
    expect(scoped.every((row) => row.status === 'unresolved')).toBe(true);
  });

  it('asks nothing past the deadline', async () => {
    const { access, calls } = failingApi(200);
    const [row] = await scopeProposal([createRow('AWS', 248, ['AWS Lambda'])], {
      access,
      tracked,
      deadline: Date.now() - 1,
    });
    expect(calls).toHaveLength(0);
    expect(row).toMatchObject({
      status: 'unresolved',
      failure: { code: 'ABORTED_AFTER_TIME_BUDGET' },
    });
  });

  it('throws a refused credential instead of marking the row', async () => {
    const { access } = failingApi(401);
    await expect(
      scopeProposal([createRow('AWS', 248, ['AWS Lambda'])], {
        access,
        tracked,
        deadline: Date.now() + 60_000,
      }),
    ).rejects.toMatchObject({ cliError: { status: 401 } });
  });
});
