import { afterEach, describe, expect, it } from 'vitest';
import { isCI } from '../src/lib/invocation.js';

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
