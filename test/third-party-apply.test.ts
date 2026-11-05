import { describe, expect, it } from 'vitest';
import type { ThirdPartyCandidate } from '../src/lib/scan/index.js';
import {
  formatProposal,
  formatSummary,
  selectCandidates,
  settleChoices,
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

describe('settleChoices', () => {
  const ambiguous: ResolvedCandidate = {
    ...candidate('Vercel'),
    status: 'ambiguous',
    choices: [choice(861, 'Vercel'), choice(862, 'VERCEL', true)],
  };

  it('turns an ambiguous row into a create when --only names an untracked choice', () => {
    const [row] = settleChoices([ambiguous], ['vercel=861'], NONE);
    expect(row).toMatchObject({ status: 'create', catalog: { id: 861 }, regionDefaulted: false });
    expect(row).not.toHaveProperty('choices');
  });

  it('turns it into already-tracked when the chosen row is tracked by the search or the account', () => {
    expect(settleChoices([ambiguous], ['Vercel=862'], NONE)[0]).toMatchObject({
      status: 'already-tracked',
      catalog: { id: 862 },
    });
    expect(
      settleChoices([ambiguous], ['Vercel=861'], { providerIds: [861], partial: false })[0],
    ).toMatchObject({
      status: 'already-tracked',
    });
  });

  it('leaves the row alone when the id is not one of its choices or no id was given', () => {
    expect(settleChoices([ambiguous], ['Vercel=999'], NONE)[0]).toBe(ambiguous);
    expect(settleChoices([ambiguous], ['Vercel'], NONE)[0]).toBe(ambiguous);
    expect(settleChoices([ambiguous], ['Vercel=abc'], NONE)[0]).toBe(ambiguous);
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
      formatProposal({ proposal: [], allowance: { proposed: 0 }, tracked: NONE }).slice(-1)[0],
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
    expect(formatSummary([create], [], 'declined')[0]).toBe('Nothing was created.');
    expect(formatSummary([create], [], 'required')[0]).toBe('Nothing was created.');
    expect(formatSummary([create], [], 'required')).toContain(
      '  uptimerobot monitors create third-party-service --provider-id 801',
    );
    expect(formatSummary([], [], 'not-needed')[0]).toBe('Nothing to create.');
  });
});
