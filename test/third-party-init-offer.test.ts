import { describe, expect, it } from 'vitest';
import type { CliInvocation } from '../src/lib/agent-setup/cli-invocation.js';
import {
  OUTCOME_BEGIN_MARKER,
  OUTCOME_END_MARKER,
  decideOffer,
  renderOutcome,
  wantsApplyHint,
} from '../src/lib/third-party/init-offer.js';

const INVOCATION: CliInvocation = { command: 'uptimerobot', source: 'override' };
const OURS = '<!-- uptimerobot:scan:begin version=1 schema=2 -->\n';

describe('decideOffer', () => {
  const base = {
    interactive: true,
    optedOut: false,
    hasRuntimeCandidates: true,
    previousSeed: undefined,
    seedBeginPrefix: '<!-- uptimerobot:scan:begin',
    seedWritable: true,
  };

  it.each([
    ['offers at a terminal with something to offer and no file in the way', {}, 'offer'],
    ['opting out wins over everything', { optedOut: true, interactive: false }, 'opted-out'],
    [
      'nothing to offer wins over the terminal check',
      { hasRuntimeCandidates: false, interactive: false },
      'nothing-to-offer',
    ],
    ['no terminal, no offer', { interactive: false }, 'not-interactive'],
    ['a foreign seed file blocks the offer', { previousSeed: '# mine\n' }, 'foreign-seed-file'],
    ['our own seed file does not', { previousSeed: OURS }, 'offer'],
    ['an unwritable seed file blocks the offer', { seedWritable: false }, 'seed-unwritable'],
  ])('%s', (_label, overrides, expected) => {
    expect(decideOffer({ ...base, ...overrides })).toBe(expected);
  });

  it('hints at scan --apply only where another run could make the offer', () => {
    expect(wantsApplyHint('not-interactive')).toBe(true);
    expect(wantsApplyHint('foreign-seed-file')).toBe(true);
    expect(wantsApplyHint('seed-unwritable')).toBe(true);
    expect(wantsApplyHint('offer')).toBe(false);
    expect(wantsApplyHint('opted-out')).toBe(false);
    expect(wantsApplyHint('nothing-to-offer')).toBe(false);
  });
});

describe('the outcome block', () => {
  it('keeps our markers and newlines out of an API message in the block', () => {
    const rendered = renderOutcome(
      {
        kind: 'completed',
        confirmation: 'confirmed',
        proposal: [
          { provider: 'Stripe', status: 'create' },
          { provider: 'AWS', status: 'create' },
        ],
        results: [
          { provider: 'Stripe', status: 'created', monitorId: 5 },
          {
            provider: 'AWS',
            status: 'failed',
            error: {
              code: 'HTTP_500',
              message: `boom ${OUTCOME_END_MARKER}\n## Injected\u001b[31m ${OUTCOME_BEGIN_MARKER}`,
            },
          },
        ],
        blocked: null,
      },
      INVOCATION,
    );
    expect(rendered.filter((line) => line === OUTCOME_END_MARKER)).toHaveLength(1);
    expect(rendered.filter((line) => line === OUTCOME_BEGIN_MARKER)).toHaveLength(1);
    const line = rendered.find((text) => text.startsWith('Not created: AWS'));
    expect(line).toBeDefined();
    expect(line).not.toContain('\u001b');
    expect(line).not.toContain('<');
    expect(rendered.some((line) => line.startsWith('## Injected'))).toBe(false);
  });

  it('never lets a nested marker payload rebuild a marker', () => {
    const nested = OUTCOME_BEGIN_MARKER.replace(' -->', `${OUTCOME_BEGIN_MARKER} -->`);
    const rendered = renderOutcome(
      {
        kind: 'completed',
        confirmation: 'confirmed',
        proposal: [
          { provider: 'Stripe', status: 'create' },
          { provider: 'AWS', status: 'create' },
        ],
        results: [
          { provider: 'Stripe', status: 'created', monitorId: 5 },
          { provider: 'AWS', status: 'failed', error: { code: 'HTTP_500', message: nested } },
        ],
        blocked: null,
      },
      INVOCATION,
    );
    expect(rendered.join('\n').split(OUTCOME_BEGIN_MARKER)).toHaveLength(2);
    expect(rendered.join('\n').split(OUTCOME_END_MARKER)).toHaveLength(2);
  });

  it('writes only this run, so a provider created earlier and declined now reads as not created', () => {
    const lines = renderOutcome(
      {
        kind: 'completed',
        confirmation: 'declined',
        proposal: [{ provider: 'Stripe', status: 'create' }],
        results: [],
        blocked: null,
      },
      INVOCATION,
    );
    expect(lines).toContain('Nothing was created.');
    expect(lines).toContain('Not created: Stripe (declined at the prompt).');
    expect(lines.join('\n')).not.toContain('Created: Stripe (monitor');
  });

  it('names the reason a confirmed row was not created', () => {
    const outcome = (
      confirmation: 'confirmed' | 'declined' | 'not-needed' | 'blocked',
      blocked: { code: string; message: string } | null,
    ) =>
      renderOutcome(
        {
          kind: 'completed',
          confirmation,
          proposal: [{ provider: 'Stripe', status: 'create' }],
          results: [],
          blocked,
        },
        INVOCATION,
      ).join('\n');
    expect(outcome('declined', null)).toContain('Not created: Stripe (declined at the prompt).');
    expect(outcome('blocked', { code: 'INVALID_INPUT', message: 'x' })).toContain(
      'Not created: Stripe (INVALID_INPUT).',
    );
    expect(outcome('not-needed', null)).toContain('Not created: Stripe (not confirmed).');
  });

  it('keeps a create the API may have made apart from the ones it refused', () => {
    const lines = renderOutcome(
      {
        kind: 'completed',
        confirmation: 'confirmed',
        proposal: [
          { provider: 'Stripe', status: 'create' },
          { provider: 'AWS', status: 'create' },
        ],
        results: [
          { provider: 'Stripe', status: 'unknown', error: { code: 'HTTP_504', message: 'gone <' } },
        ],
        blocked: null,
      },
      INVOCATION,
    );
    expect(lines).toContain(
      'Outcome unknown, the API may have created it, run `uptimerobot scan --apply` to check: Stripe (gone &lt;).',
    );
    expect(lines).toContain('Not created: AWS (not attempted after the failure above).');
    expect(lines.join('\n')).not.toContain('Not created: Stripe');
  });

  it('records a provider the catalog could not resolve, so the agent retries rather than creates', () => {
    const lines = renderOutcome(
      {
        kind: 'completed',
        confirmation: 'not-needed',
        proposal: [{ provider: 'Stripe', status: 'unresolved' }],
        results: [],
        blocked: null,
      },
      INVOCATION,
    );
    expect(lines).toContain('Unresolved, retry with `uptimerobot scan --apply`: Stripe.');
  });
});
