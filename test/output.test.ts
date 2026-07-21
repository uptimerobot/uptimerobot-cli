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

  it('renders explicit columns in order with header overrides and dotted paths', () => {
    vi.stubEnv('NO_COLOR', '1');
    const payload = { items: [{ id: 1, monitor: { friendlyName: 'api' }, noise: 'x' }] };
    const columns = [{ key: 'monitor.friendlyName', header: 'Monitor' }, { key: 'id' }];
    expect(formatOutput('table', payload, { columns })).toBe('MONITOR  ID\napi      1');
    expect(formatOutput('plain', payload, { columns })).toBe('api\t1');
  });

  it('renders placeholders for missing paths and formatter misses', () => {
    vi.stubEnv('NO_COLOR', '1');
    const payload = { items: [{ id: 1, monitor: null }] };
    const columns = [
      { key: 'id', format: () => undefined },
      { key: 'monitor.friendlyName' },
      { key: 'absent' },
    ];
    expect(formatOutput('table', payload, { columns })).toBe(
      'ID  FRIENDLY NAME  ABSENT\n—   —              —',
    );
    expect(formatOutput('plain', payload, { columns })).toBe('\t\t');
  });

  it('applies formatters with access to the whole row', () => {
    vi.stubEnv('NO_COLOR', '1');
    const payload = { items: [{ first: 'Ada', last: 'Lovelace' }] };
    const columns = [
      {
        format: (value: unknown, row: Record<string, unknown>) => `${value} ${row.last}`,
        header: 'FULL NAME',
        key: 'first',
      },
    ];
    expect(formatOutput('table', payload, { columns })).toBe('FULL NAME\nAda Lovelace');
  });

  it('keeps status glyphs on curated columns whose key ends in status', () => {
    vi.stubEnv('NO_COLOR', '1');
    const payload = { items: [{ delivery: { notificationStatus: 'SUCCESS' } }] };
    const columns = [{ header: 'DELIVERY', key: 'delivery.notificationStatus' }];
    expect(formatOutput('table', payload, { columns })).toBe('DELIVERY\n● SUCCESS');
  });

  it('styles exact title-case and nested status literals', () => {
    vi.stubEnv('NO_COLOR', '1');
    const payload = {
      items: [
        {
          deliveryStatus: 'Sent',
          notificationStatus: 'NOT_DELIVERED',
          status: 'Active',
        },
      ],
    };
    const columns = [
      { key: 'status' },
      { header: 'DELIVERY', key: 'deliveryStatus' },
      { header: 'NOTIFICATION', key: 'notificationStatus' },
    ];

    expect(formatOutput('table', payload, { columns })).toBe(
      'STATUS    DELIVERY  NOTIFICATION\n' + '● Active  ● Sent    ✗ NOT_DELIVERED',
    );
  });

  it('unions keys across heterogeneous rows when allColumns is set', () => {
    vi.stubEnv('NO_COLOR', '1');
    const payload = { items: [{ a: 1 }, { b: 2 }] };
    expect(formatOutput('table', payload, { allColumns: true })).toBe('A  B\n1  —\n—  2');
    expect(formatOutput('table', payload)).toBe('A\n1\n—');
  });

  it('ignores column options for JSON output', () => {
    const payload = { items: [{ id: 1, noise: 'x' }] };
    const columns = [{ key: 'id' }];
    expect(formatOutput('json', payload, { columns })).toBe('{"items":[{"id":1,"noise":"x"}]}');
    expect(formatOutput('jsonl', payload, { columns })).toBe('{"id":1,"noise":"x"}');
  });

  it('truncates long table cells at 48 code points without changing plain or JSON output', () => {
    const value = '01234567890123456789012345678901234567890123456789';
    const payload = { items: [{ note: value }] };
    const columns = [{ key: 'note' }];

    expect(formatOutput('table', payload, { columns })).toBe(
      'NOTE\n01234567890123456789012345678901234567890123456…',
    );
    expect(formatOutput('table', payload, { allColumns: true })).toBe(
      'NOTE\n01234567890123456789012345678901234567890123456…',
    );
    expect(formatOutput('plain', payload, { columns })).toBe(value);
    expect(formatOutput('json', payload, { columns })).toBe(JSON.stringify(payload));
  });

  it('honors a curated width cap after adding a status glyph', () => {
    vi.stubEnv('NO_COLOR', '1');
    const payload = { items: [{ label: 'abcdefgh', status: 'STARTED' }] };
    const columns = [
      { key: 'label', maxWidth: 8 },
      { key: 'status', maxWidth: 8 },
    ];

    expect(formatOutput('table', payload, { columns })).toBe(
      'LABEL     STATUS\nabcdefgh  ◌ START…',
    );
  });

  it('does not split Unicode surrogate pairs when truncating', () => {
    const payload = { items: [{ value: '😀abcdefghi' }] };
    const columns = [{ key: 'value', maxWidth: 8 }];

    expect(formatOutput('table', payload, { columns })).toBe('VALUE\n😀abcde…');
  });

  it('counts wide characters as two columns when aligning and truncating', () => {
    vi.stubEnv('NO_COLOR', '1');
    const payload = { items: [{ name: '監控', status: 'UP' }] };
    const columns = [{ key: 'name' }, { key: 'status' }];

    expect(formatOutput('table', payload, { columns })).toBe('NAME  STATUS\n監控  ● UP');
  });

  it('truncates wide characters by display width without splitting clusters', () => {
    vi.stubEnv('NO_COLOR', '1');
    const payload = { items: [{ name: '監控abcd' }] };
    const columns = [{ key: 'name', maxWidth: 5 }];

    expect(formatOutput('table', payload, { columns })).toBe('NAME\n監控…');
  });

  it('keeps table cells on one line without changing plain or JSON values', () => {
    const value = 'first\nsecond\tthird\r\nfourth';
    const payload = { items: [{ note: value }] };
    const columns = [{ key: 'note' }];

    expect(formatOutput('table', payload, { columns })).toBe('NOTE\nfirst second third fourth');
    expect(formatOutput('plain', payload, { columns })).toBe(value);
    expect(formatOutput('json', payload, { columns })).toBe(JSON.stringify(payload));
  });

  it('maps known status values to glyph buckets', () => {
    const cases: [string, string, string][] = [
      ['UP', '●', 'green'],
      ['ENABLED', '●', 'green'],
      ['Resolved', '●', 'green'],
      ['SUCCESS', '●', 'green'],
      ['Published', '●', 'green'],
      ['Sent', '●', 'green'],
      ['Active', '●', 'green'],
      ['active', '●', 'green'],
      ['success', '●', 'green'],
      ['DOWN', '✗', 'red'],
      ['LOOKS_DOWN', '✗', 'red'],
      ['Ongoing', '✗', 'red'],
      ['NOT_DELIVERED', '✗', 'red'],
      ['error', '✗', 'red'],
      ['Pending', '▲', 'yellow'],
      ['NotActivated', '▲', 'yellow'],
      ['ToMigrate', '▲', 'yellow'],
      ['PAUSED', '◌', 'dim'],
      ['STARTED', '◌', 'dim'],
      ['Offline', '◌', 'dim'],
      ['Archived', '◌', 'dim'],
      ['InQueue', '◌', 'dim'],
      ['CantSend', '◌', 'dim'],
      ['Paused', '◌', 'dim'],
      ['paused', '◌', 'dim'],
    ];
    for (const [value, glyph, style] of cases) {
      expect(statusGlyph(value), value).toEqual({ glyph, style });
    }
  });

  it('leaves unknown status values unstyled', () => {
    for (const value of ['RESOLVED', 'PUBLISHED', 'PENDING', 'OFFLINE', 'ARCHIVED', 'up', '—']) {
      expect(statusGlyph(value), value).toBeUndefined();
    }
  });

  it('preserves exact status literals in structured output', () => {
    const payload = { items: [{ status: 'STARTED' }, { status: 'Published' }] };

    expect(formatOutput('json', payload)).toBe(JSON.stringify(payload));
    expect(formatOutput('jsonl', payload)).toBe('{"status":"STARTED"}\n{"status":"Published"}');
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
