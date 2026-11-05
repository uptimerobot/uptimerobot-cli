import { describe, expect, it } from 'vitest';
import type { CliInvocation } from '../src/lib/agent-setup/cli-invocation.js';
import {
  OUTCOME_BEGIN_MARKER,
  OUTCOME_END_MARKER,
  carryOverOutcome,
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
  ])('%s', (_label, overrides, expected) => {
    expect(decideOffer({ ...base, ...overrides })).toBe(expected);
  });

  it('hints at scan --apply only where another run could make the offer', () => {
    expect(wantsApplyHint('not-interactive')).toBe(true);
    expect(wantsApplyHint('foreign-seed-file')).toBe(true);
    expect(wantsApplyHint('offer')).toBe(false);
    expect(wantsApplyHint('opted-out')).toBe(false);
    expect(wantsApplyHint('nothing-to-offer')).toBe(false);
  });
});

describe('the outcome block', () => {
  it('round-trips through carryOverOutcome whatever its heading says', () => {
    const rendered = renderOutcome(
      {
        kind: 'completed',
        confirmation: 'confirmed',
        proposal: [{ provider: 'Stripe', status: 'create' }],
        results: [{ provider: 'Stripe', status: 'created', monitorId: 5001 }],
        blocked: null,
      },
      INVOCATION,
    );
    const file = `${OURS}\nbody\n\n${rendered.join('\n')}\n<!-- uptimerobot:scan:end -->\n`;
    expect(carryOverOutcome(file)).toEqual(rendered);
    const renamed = file.replace('### Outcome of', '### Whatever a later version says');
    expect(carryOverOutcome(renamed).join('\n')).toContain('Created: Stripe (monitor 5001).');
  });

  it('carries the last block when a file holds two, and none without both markers', () => {
    const block = (text: string) => `${OUTCOME_BEGIN_MARKER}\n${text}\n${OUTCOME_END_MARKER}`;
    expect(carryOverOutcome(`${OURS}${block('first')}\n${block('second')}\n`)).toEqual([
      OUTCOME_BEGIN_MARKER,
      'second',
      OUTCOME_END_MARKER,
    ]);
    expect(carryOverOutcome(`${OURS}${OUTCOME_BEGIN_MARKER}\nno end\n`)).toEqual([]);
    expect(carryOverOutcome(`${OURS}### Outcome of nothing\n`)).toEqual([]);
    expect(carryOverOutcome(undefined)).toEqual([]);
  });

  it('names the reason a confirmed row was not created', () => {
    const outcome = (
      confirmation: 'confirmed' | 'declined' | 'not-needed',
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
    expect(outcome('confirmed', { code: 'TRACKED_SET_PARTIAL', message: 'x' })).toContain(
      'Not created: Stripe (TRACKED_SET_PARTIAL).',
    );
    expect(outcome('not-needed', null)).toContain('Not created: Stripe (not confirmed).');
  });
});
