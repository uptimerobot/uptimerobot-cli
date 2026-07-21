import { describe, expect, it } from 'vitest';
import { paginationNotice } from '../src/output/pagination-notice.js';

describe('pagination notice', () => {
  it('returns a stderr notice for a paginated table result', () => {
    expect(paginationNotice('table', { items: [{ id: 42 }], nextCursor: '84' })).toEqual({
      message: 'More results are available. Next cursor: 84',
      stream: 'stderr',
    });
  });

  it('returns the same stderr notice for plain output', () => {
    expect(paginationNotice('plain', { items: [], nextCursor: 'next-page' })).toEqual({
      message: 'More results are available. Next cursor: next-page',
      stream: 'stderr',
    });
  });

  it.each(['json', 'jsonl'] as const)('does not add a pagination notice to %s output', (format) => {
    expect(paginationNotice(format, { items: [{ id: 42 }], nextCursor: '84' })).toBeUndefined();
  });

  it.each([{ items: [], nextCursor: null }, { items: [] }, { items: [], nextCursor: '' }])(
    'does not return a notice without a usable next cursor',
    (result) => {
      expect(paginationNotice('table', result)).toBeUndefined();
    },
  );

  it('escapes terminal control characters in an opaque cursor', () => {
    expect(paginationNotice('table', { items: [], nextCursor: 'next\n\u001B[31mred' })).toEqual({
      message: 'More results are available. Next cursor: next\\n\\u001b[31mred',
      stream: 'stderr',
    });
  });
});
