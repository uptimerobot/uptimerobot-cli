import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { isCI, promptSecret, requestConfirmation } from '../src/lib/invocation.js';

const stdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin');
const stdoutDescriptor = Object.getOwnPropertyDescriptor(process, 'stdout');
const stderrDescriptor = Object.getOwnPropertyDescriptor(process, 'stderr');

afterEach(() => {
  if (stdinDescriptor) Object.defineProperty(process, 'stdin', stdinDescriptor);
  if (stdoutDescriptor) Object.defineProperty(process, 'stdout', stdoutDescriptor);
  if (stderrDescriptor) Object.defineProperty(process, 'stderr', stderrDescriptor);
});

function fakeTerminal() {
  const stdin = new PassThrough();
  Object.defineProperty(stdin, 'isTTY', { value: true });
  Object.assign(stdin, { setRawMode: () => stdin });
  const stdout = new PassThrough();
  Object.defineProperty(stdout, 'isTTY', { value: true });
  let errText = '';
  const stderr = new PassThrough();
  Object.defineProperty(stderr, 'isTTY', { value: true });
  stderr.on('data', (chunk) => {
    errText += chunk.toString();
  });
  Object.defineProperty(process, 'stdin', { configurable: true, value: stdin });
  Object.defineProperty(process, 'stdout', { configurable: true, value: stdout });
  Object.defineProperty(process, 'stderr', { configurable: true, value: stderr });
  return { stdin, stderrText: () => errText };
}

describe('invocation context', () => {
  const originalCI = process.env.CI;

  afterEach(() => {
    if (originalCI === undefined) delete process.env.CI;
    else process.env.CI = originalCI;
  });

  it('detects CI=true', () => {
    process.env.CI = 'true';

    expect(isCI()).toBe(true);
  });

  it('does not detect CI=false', () => {
    process.env.CI = 'false';

    expect(isCI()).toBe(false);
  });
});

describe('requestConfirmation', () => {
  it('accepts an explicit yes answer', async () => {
    const { stdin, stderrText } = fakeTerminal();

    const answer = requestConfirmation('Run npx skills add uptimerobot/ai', 'human');
    stdin.write('yes\n');

    await expect(answer).resolves.toBe(true);
    expect(stderrText()).toContain('Run npx skills add uptimerobot/ai. Continue? [y/N] ');
  });

  it('declines any answer other than yes', async () => {
    const { stdin } = fakeTerminal();

    const answer = requestConfirmation('Run npx skills add uptimerobot/ai', 'human');
    stdin.write('n\n');

    await expect(answer).resolves.toBe(false);
  });

  it('does not prompt an agent', async () => {
    const { stderrText } = fakeTerminal();

    await expect(requestConfirmation('Run npx skills add uptimerobot/ai', 'agent')).resolves.toBe(
      false,
    );
    expect(stderrText()).toBe('');
  });
});

describe('promptSecret', () => {
  it('masks the entered secret and resolves it on return', async () => {
    const { stdin, stderrText } = fakeTerminal();

    const answer = promptSecret('Paste: ');
    stdin.write('u123-secret\r');

    await expect(answer).resolves.toBe('u123-secret');
    expect(stderrText()).toBe(`Paste: ${'*'.repeat(11)}\n`);
    expect(stderrText()).not.toContain('u123-secret');
  });

  it('applies backspace while masking', async () => {
    const { stdin, stderrText } = fakeTerminal();

    const answer = promptSecret('Paste: ');
    stdin.write('abc\x7fX\r');

    await expect(answer).resolves.toBe('abX');
    expect(stderrText()).toBe('Paste: ***\b \b*\n');
  });

  it('resolves undefined for an empty answer', async () => {
    const { stdin } = fakeTerminal();

    const answer = promptSecret('Paste: ');
    stdin.write('\r');

    await expect(answer).resolves.toBeUndefined();
  });

  it('releases stdin on submit so the process can exit', async () => {
    const { stdin } = fakeTerminal();

    const answer = promptSecret('Paste: ');
    stdin.write('u123-secret\r');
    await answer;

    expect(stdin.isPaused()).toBe(true);
  });

  it('returns undefined without an interactive terminal', async () => {
    await expect(promptSecret('Paste: ')).resolves.toBeUndefined();
  });
});
