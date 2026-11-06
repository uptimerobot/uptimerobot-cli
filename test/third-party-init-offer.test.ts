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

  it('never lets a nested marker payload rebuild a marker, so the earlier block survives', () => {
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
    expect(carryOverOutcome(`# Seed\n\n${rendered.join('\n')}\n`)).toEqual([
      OUTCOME_BEGIN_MARKER,
      `### Outcome of \`${INVOCATION.command} init\``,
      '',
      'Created: Stripe (monitor 5).',
      OUTCOME_END_MARKER,
    ]);
  });

  it('carries only the durable lines of an earlier block', () => {
    const rendered = renderOutcome(
      {
        kind: 'completed',
        confirmation: 'confirmed',
        proposal: [
          { provider: 'Stripe', status: 'create' },
          { provider: 'Vercel', status: 'already-tracked' },
          { provider: 'Resend', status: 'ambiguous' },
          { provider: 'AWS', status: 'create' },
        ],
        results: [
          { provider: 'Stripe', status: 'created', monitorId: 5 },
          { provider: 'AWS', status: 'failed', error: { code: 'HTTP_500', message: 'boom' } },
        ],
        blocked: null,
      },
      INVOCATION,
    );
    const carried = carryOverOutcome(`${OURS}${rendered.join('\n')}\n`);
    expect(carried).toEqual([
      OUTCOME_BEGIN_MARKER,
      '### Outcome of `uptimerobot init`',
      '',
      'Created: Stripe (monitor 5).',
      'Already tracked: Vercel.',
      OUTCOME_END_MARKER,
    ]);
    const declined = renderOutcome(
      {
        kind: 'completed',
        confirmation: 'declined',
        proposal: [{ provider: 'Stripe', status: 'create' }],
        results: [],
        blocked: null,
      },
      INVOCATION,
    );
    expect(carryOverOutcome(`${OURS}${declined.join('\n')}\n`)).toEqual([]);
  });

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
    // Only the heading and the durable lines come back; this block holds nothing else.
    const renamed = file.replace('### Outcome of', '### Whatever a later version says');
    expect(carryOverOutcome(renamed).join('\n')).toContain('Created: Stripe (monitor 5001).');
  });

  it('carries the last block when a file holds two, and none without both markers', () => {
    const block = (text: string) => `${OUTCOME_BEGIN_MARKER}\n${text}\n${OUTCOME_END_MARKER}`;
    const second = block('### Outcome of x\n\nCreated: Second (monitor 2).');
    expect(
      carryOverOutcome(
        `${OURS}${block('### Outcome of x\n\nCreated: First (monitor 1).')}\n${second}\n`,
      ),
    ).toEqual([
      OUTCOME_BEGIN_MARKER,
      '### Outcome of x',
      '',
      'Created: Second (monitor 2).',
      OUTCOME_END_MARKER,
    ]);
    expect(carryOverOutcome(`${OURS}${block('no heading\nCreated: X (monitor 1).')}\n`)).toEqual(
      [],
    );
    expect(carryOverOutcome(`${OURS}${OUTCOME_BEGIN_MARKER}\nno end\n`)).toEqual([]);
    expect(carryOverOutcome(`${OURS}### Outcome of nothing\n`)).toEqual([]);
    expect(carryOverOutcome(undefined)).toEqual([]);
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
    const earlier = `${OURS}${OUTCOME_BEGIN_MARKER}\nOutcome unknown, the API may have created it, run \`uptimerobot scan --apply\` to check: Stripe (gone).\n${OUTCOME_END_MARKER}\n`;
    expect(carryOverOutcome(earlier)).toEqual([]);
  });

  it('keeps the durable lines of an earlier block when resolution fails', () => {
    const earlier = renderOutcome(
      {
        kind: 'completed',
        confirmation: 'confirmed',
        proposal: [
          { provider: 'Stripe', status: 'create' },
          { provider: 'Vercel', status: 'already-tracked' },
        ],
        results: [{ provider: 'Stripe', status: 'created', monitorId: 5 }],
        blocked: null,
      },
      INVOCATION,
    );
    const previousSeed = `${OURS}${earlier.join('\n')}\n`;
    const lines = renderOutcome(
      { kind: 'failed', error: { code: 'HTTP_500', message: 'boom' } },
      INVOCATION,
      previousSeed,
    );
    expect(lines).toEqual([
      OUTCOME_BEGIN_MARKER,
      '### Outcome of `uptimerobot init`',
      '',
      'Not resolved (HTTP_500): boom. Run `uptimerobot scan --apply` to retry.',
      'Created: Stripe (monitor 5).',
      'Already tracked: Vercel.',
      OUTCOME_END_MARKER,
    ]);
    expect(carryOverOutcome(`${OURS}${lines.join('\n')}\n`)).toEqual(earlier);
    expect(
      renderOutcome({ kind: 'failed', error: { code: 'HTTP_500', message: 'boom' } }, INVOCATION),
    ).not.toContain('Created: Stripe (monitor 5).');
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
