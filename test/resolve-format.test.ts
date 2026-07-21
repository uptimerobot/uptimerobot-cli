import { describe, expect, it } from 'vitest';
import { resolveFormat } from '../src/output/resolve-format.js';

describe('output format resolution', () => {
  it.each(['json', 'jsonl', 'plain', 'table'] as const)(
    'uses UPTIMEROBOT_OUTPUT=%s consistently for successful output',
    (format) => {
      expect(resolveFormat({}, 'human', { UPTIMEROBOT_OUTPUT: format.toUpperCase() })).toBe(format);
    },
  );
});
