import { describe, expect, it } from 'vitest';
import type { ThirdPartyCandidate } from '../src/lib/scan/index.js';
import {
  CREATE_COMMAND,
  applyOnlyChoices,
  formatProposal,
  formatSummary,
  malformedOnly,
  mismatchedOnly,
  parseOnly,
  selectCandidates,
} from '../src/lib/third-party/apply.js';
import type { ResolvedCandidate } from '../src/lib/third-party/resolve.js';

function candidate(
  provider: string,
  cls: 'runtime' | 'build-time' = 'runtime',
): ThirdPartyCandidate {
  return {
    provider,
    searchTerm: provider.toLowerCase(),
    class: cls,
    evidence: [
      {
        file: 'package.json',
        line: 3,
        kind: 'npm',
        signal: `${provider.toLowerCase()}@1`,
        app: '.',
      },
    ],
    hints: [],
  };
}

const choice = (id: number, name: string, isTracked = false) => ({
  id,
  name,
  state: 'operational',
  statusPageUrl: `https://status.${name.toLowerCase()}.example/`,
  isTracked,
});

const NONE = { providerIds: [], partial: false };

describe('parseOnly', () => {
  it.each([
    ['Stripe', { name: 'stripe' }],
    [' Stripe =801', { name: 'stripe', id: 801 }],
    ['Stripe=0', { name: 'stripe' }],
    ['Stripe=-1', { name: 'stripe' }],
    ['Stripe=abc', { name: 'stripe' }],
    ['Stripe=1.5', { name: 'stripe' }],
    ['a=b=5', { name: 'a=b', id: 5 }],
  ])('parses %s', (entry, expected) => {
    expect(parseOnly(entry)).toEqual(expected);
  });

  it('names the first entry with a malformed id', () => {
    expect(malformedOnly(['Stripe', 'Vercel=861'])).toBeUndefined();
    expect(malformedOnly(['Stripe', 'Vercel=abc', 'Resend=0'])).toBe('Vercel=abc');
  });

  it('spells the hand-run command from the generated command id', () => {
    expect(CREATE_COMMAND).toBe('uptimerobot monitors create third-party-service --provider-id');
  });
});

describe('selectCandidates', () => {
  it('keeps only the named providers, drops the skipped ones, ignores case and an =id suffix', () => {
    const all = [candidate('Stripe'), candidate('Vercel'), candidate('Resend')];
    expect(
      selectCandidates(all, {
        only: ['STRIPE', 'vercel=862'],
        skip: [],
        includeBuildTime: false,
      }).map((c) => c.provider),
    ).toEqual(['Stripe', 'Vercel']);
    expect(
      selectCandidates(all, { only: [], skip: [' resend '], includeBuildTime: false }).map(
        (c) => c.provider,
      ),
    ).toEqual(['Stripe', 'Vercel']);
    expect(
      selectCandidates(all, { only: ['Stripe'], skip: ['stripe'], includeBuildTime: false }),
    ).toEqual([]);
  });
});

describe('applyOnlyChoices', () => {
  const ambiguous: ResolvedCandidate = {
    ...candidate('Vercel'),
    status: 'ambiguous',
    choices: [choice(861, 'Vercel'), choice(862, 'VERCEL', true)],
  };

  it('turns an ambiguous row into a create when --only names an untracked choice', () => {
    const [row] = applyOnlyChoices([ambiguous], ['vercel=861'], NONE);
    expect(row).toMatchObject({ status: 'create', catalog: { id: 861 }, regionDefaulted: false });
    expect(row).not.toHaveProperty('choices');
  });

  it('turns it into already-tracked when the chosen row is tracked by the search or the account', () => {
    expect(applyOnlyChoices([ambiguous], ['Vercel=862'], NONE)[0]).toMatchObject({
      status: 'already-tracked',
      catalog: { id: 862 },
    });
    expect(
      applyOnlyChoices([ambiguous], ['Vercel=861'], { providerIds: [861], partial: false })[0],
    ).toMatchObject({
      status: 'already-tracked',
    });
  });

  it('leaves the row alone when the id is not one of its choices or no id was given', () => {
    expect(applyOnlyChoices([ambiguous], ['Vercel=999'], NONE)[0]).toBe(ambiguous);
    expect(applyOnlyChoices([ambiguous], ['Vercel'], NONE)[0]).toBe(ambiguous);
    expect(applyOnlyChoices([ambiguous], ['Vercel=abc'], NONE)[0]).toBe(ambiguous);
  });
});

describe('mismatchedOnly', () => {
  const resolved: ResolvedCandidate = {
    ...candidate('Stripe'),
    status: 'create',
    catalog: { id: 801, name: 'Stripe', state: 'operational', statusPageUrl: 'https://s.example/' },
    regionDefaulted: false,
  };
  const ambiguous: ResolvedCandidate = {
    ...candidate('Vercel'),
    status: 'ambiguous',
    choices: [choice(861, 'Vercel'), choice(862, 'VERCEL')],
  };

  it('names the first --only entry whose id is not the id its provider resolved to', () => {
    expect(mismatchedOnly([resolved, ambiguous], ['stripe=802', 'Vercel=999'])).toEqual({
      entry: 'stripe=802',
      resolved: [801],
    });
    expect(mismatchedOnly([resolved, ambiguous], ['Vercel=999'])).toEqual({
      entry: 'Vercel=999',
      resolved: [861, 862],
    });
  });

  it('accepts a matching id, a bare name, and an id for a row without a catalog', () => {
    const unresolved: ResolvedCandidate = {
      ...candidate('Sentry'),
      status: 'not-in-catalog',
      seen: [],
    };
    expect(
      mismatchedOnly([resolved, ambiguous, unresolved], ['Stripe=801', 'vercel=862', 'Sentry=5']),
    ).toBeUndefined();
    expect(mismatchedOnly([resolved], ['Stripe'])).toBeUndefined();
  });
});

describe('rendering', () => {
  const create: ResolvedCandidate = {
    ...candidate('Stripe'),
    status: 'create',
    catalog: {
      id: 801,
      name: 'Stripe',
      state: 'operational',
      statusPageUrl: 'https://status.stripe.example/',
    },
    regionDefaulted: false,
  };
  const over: ResolvedCandidate = {
    ...create,
    ...candidate('Vercel'),
    status: 'over-allowance',
    catalog: { ...create.catalog, id: 861 },
  };
  const missing: ResolvedCandidate = {
    ...candidate('Sentry'),
    status: 'not-in-catalog',
    seen: ['Sentry Relay'],
  };
  const unresolved: ResolvedCandidate = {
    ...candidate('Resend'),
    status: 'unresolved',
    failure: { code: 'HTTP_429', message: 'Slow | down' },
  };

  it('renders the proposal table, the allowance line and the partial note', () => {
    const lines = formatProposal({
      proposal: [create, over, missing, unresolved],
      allowance: { used: 9, limit: 10, proposed: 1 },
      tracked: { providerIds: [1, 2], partial: true },
    });
    expect(lines).toEqual([
      '| Provider | Evidence | Class | Catalog | Action |',
      '| --- | --- | --- | --- | --- |',
      '| Stripe | stripe@1 | runtime | 801, operational, https://status.stripe.example/ | create |',
      '| Vercel | vercel@1 | runtime | 861, operational, https://status.stripe.example/ | over allowance |',
      '| Sentry | sentry@1 | runtime | not in catalog | none |',
      '| Resend | resend@1 | runtime | unresolved: Slow / down | retry |',
      '',
      '9 of 10 third-party slots used, 1 proposed. Tracked set read from the account (2 services, partial: the list stopped at its page cap).',
    ]);
    expect(
      formatProposal({
        proposal: [],
        allowance: { used: null, limit: null, proposed: 0 },
        tracked: NONE,
      }).slice(-1)[0],
    ).toBe('Allowance unknown, 0 proposed. Tracked set read from the account (0 services).');
  });

  it('summarises a confirmed run with the CLI lines to repeat each create', () => {
    const lines = formatSummary(
      [create, over, missing, unresolved],
      [{ provider: 'Stripe', status: 'created', monitorId: 5000 }],
      'confirmed',
    );
    expect(lines).toEqual([
      'Created: Stripe (monitor 5000).',
      'Not in catalog: Sentry.',
      'Over allowance: Vercel.',
      'Unresolved, retry later: Resend.',
      '',
      'To repeat a create by hand:',
      '  uptimerobot monitors create third-party-service --provider-id 861',
      '',
      'Endpoints and heartbeats need a base URL and go through `uptimerobot init`.',
    ]);
  });

  it('names what a stopped run did not attempt, and says nothing was created when declined', () => {
    const second: ResolvedCandidate = {
      ...create,
      ...candidate('Resend'),
      catalog: { ...create.catalog, id: 77 },
    };
    const stopped = formatSummary(
      [create, second],
      [{ provider: 'Stripe', status: 'failed', error: { code: 'HTTP_429', message: 'Slow down' } }],
      'confirmed',
    );
    expect(stopped.slice(0, 2)).toEqual([
      'Not created: Stripe (Slow down).',
      'Not attempted: Resend.',
    ]);
    const unknown = formatSummary(
      [create, second],
      [{ provider: 'Stripe', status: 'unknown', error: { code: 'HTTP_504', message: 'gone' } }],
      'confirmed',
    );
    expect(unknown.slice(0, 2)).toEqual([
      'Outcome unknown, the API may have created it, re-run `uptimerobot scan --apply` to check: Stripe (gone).',
      'Not attempted: Resend.',
    ]);
    expect(unknown).toContain('  uptimerobot monitors create third-party-service --provider-id 77');
    expect(unknown).not.toContain(
      '  uptimerobot monitors create third-party-service --provider-id 801',
    );
    const blocked = formatSummary([create], [], 'blocked');
    expect(blocked[0]).toBe('Nothing was created.');
    expect(blocked).not.toContain('To repeat a create by hand:');
    expect(formatSummary([create], [], 'declined')[0]).toBe('Nothing was created.');
    expect(formatSummary([create], [], 'required')[0]).toBe('Nothing was created.');
    expect(formatSummary([create], [], 'required')).toContain(
      '  uptimerobot monitors create third-party-service --provider-id 801',
    );
    expect(formatSummary([], [], 'not-needed')[0]).toBe('Nothing to create.');
  });
});

describe('formatSummary templates its commands through the invocation', () => {
  it('names the npx invocation in the by-hand create and the re-run hint', () => {
    const stripe: ResolvedCandidate = {
      ...candidate('Stripe'),
      status: 'create',
      catalog: { id: 801, name: 'Stripe', state: 'operational', statusPageUrl: 'https://s/' },
      regionDefaulted: false,
    };
    const resend: ResolvedCandidate = {
      ...stripe,
      ...candidate('Resend'),
      catalog: { ...stripe.catalog, id: 77, name: 'Resend' },
    };
    const vercel: ResolvedCandidate = {
      ...stripe,
      ...candidate('Vercel'),
      catalog: { ...stripe.catalog, id: 861, name: 'Vercel' },
    };
    const proposal = [stripe, resend, vercel];
    const results = [
      { provider: 'Stripe', status: 'created' as const, monitorId: 5000 },
      { provider: 'Resend', status: 'unknown' as const, error: { code: 'HTTP_502', message: 'x' } },
      { provider: 'Vercel', status: 'failed' as const, error: { code: 'HTTP_400', message: 'y' } },
    ];
    const invocation = { command: 'npx @uptimerobot/cli', source: 'npx' } as const;

    const lines = formatSummary(proposal, results, 'confirmed', invocation);

    expect(lines).toContain(
      '  npx @uptimerobot/cli monitors create third-party-service --provider-id 861',
    );
    expect(lines.join('\n')).toContain('re-run `npx @uptimerobot/cli scan --apply`');
    expect(lines.join('\n')).not.toContain('`uptimerobot init`');
    expect(lines.join('\n')).toContain('`npx @uptimerobot/cli init`');
  });
});
