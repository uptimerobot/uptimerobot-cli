import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatOutput } from '../src/output/renderer.js';
import { colorEnabled, paint, statusGlyph } from '../src/output/style.js';

const ESC = String.fromCharCode(27);

describe('output formatting', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('formats a collection as JSON Lines', () => {
    expect(formatOutput('jsonl', { items: [{ id: 42 }, { id: 7 }] })).toBe('{"id":42}\n{"id":7}');
  });

  it('adds glyphs to status columns but not to other columns', () => {
    vi.stubEnv('NO_COLOR', '1');
    expect(formatOutput('table', { items: [{ name: 'DOWN', status: 'DOWN' }] })).toBe(
      'NAME  STATUS\nDOWN  ✗ DOWN',
    );
  });

  it('maps known status values to glyph buckets', () => {
    const cases: [string, string, string][] = [
      ['UP', '●', 'green'],
      ['STARTED', '●', 'green'],
      ['SUCCESS', '●', 'green'],
      ['PUBLISHED', '●', 'green'],
      ['Resolved', '●', 'green'],
      ['active', '●', 'green'],
      ['DOWN', '✗', 'red'],
      ['NOT_DELIVERED', '✗', 'red'],
      ['Ongoing', '✗', 'red'],
      ['error', '✗', 'red'],
      ['LOOKS_DOWN', '▲', 'yellow'],
      ['PENDING', '▲', 'yellow'],
      ['PAUSED', '◌', 'dim'],
      ['paused', '◌', 'dim'],
      ['OFFLINE', '◌', 'dim'],
      ['ARCHIVED', '◌', 'dim'],
    ];
    for (const [value, glyph, style] of cases) {
      expect(statusGlyph(value), value).toEqual({ glyph, style });
    }
  });

  it('leaves unknown status values unstyled', () => {
    expect(statusGlyph('RESOLVED')).toBeUndefined();
    expect(statusGlyph('up')).toBeUndefined();
    expect(statusGlyph('—')).toBeUndefined();
  });

  it('disables color when NO_COLOR is set, even against FORCE_COLOR', () => {
    vi.stubEnv('NO_COLOR', '1');
    vi.stubEnv('FORCE_COLOR', '1');
    expect(colorEnabled()).toBe(false);
    expect(paint('red', 'x')).toBe('x');
  });

  it('forces color with FORCE_COLOR regardless of TTY', () => {
    vi.stubEnv('NO_COLOR', '');
    vi.stubEnv('FORCE_COLOR', '1');
    expect(colorEnabled()).toBe(true);
    expect(paint('red', 'x')).toBe(`${ESC}[31mx${ESC}[0m`);
  });

  it('treats FORCE_COLOR=0 as an explicit off switch', () => {
    vi.stubEnv('NO_COLOR', undefined);
    vi.stubEnv('FORCE_COLOR', '0');
    expect(colorEnabled()).toBe(false);
  });
});
