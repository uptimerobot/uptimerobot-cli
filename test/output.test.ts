import { describe, expect, it } from 'vitest';
import { formatOutput } from '../src/output/renderer.js';

describe('output formatting', () => {
  it('formats a collection as JSON Lines', () => {
    expect(formatOutput('jsonl', { items: [{ id: 42 }, { id: 7 }] })).toBe('{"id":42}\n{"id":7}');
  });
});
