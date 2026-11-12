/**
 * The one cursor loop every list reader shares: follow `nextCursor` until the
 * API stops handing one out, a cursor repeats (a loop that would never end),
 * or the page cap is reached. A repeated cursor and the cap both make
 * `truncated` true, with the reason: either way the list is a prefix, not
 * the whole, but a caller reports them differently. A 2xx body that is not a
 * list is refused here, once, rather than read as a complete empty list.
 */
import { ApiFailure } from '../api/errors.js';
import { isPlainRecord } from './objects.js';
import { normalizeResult } from '../output/normalize-result.js';

/** 10,000 items at the default page size, far past any real account. */
export const MAX_PAGES = 50;
export const PAGE_SIZE = 200;

export interface PageOptions {
  /** Fetches one page; the payload is read through `normalizeResult`. */
  fetchPage: (cursor: string | undefined) => Promise<unknown>;
  /** Receives the items of each page in order. */
  onItems: (items: readonly unknown[]) => void;
  maxPages?: number;
}

export type PageResult =
  | { truncated: false }
  | { truncated: true; reason: 'repeated-cursor' | 'page-cap' };

export async function pageThrough(options: PageOptions): Promise<PageResult> {
  const maxPages = options.maxPages ?? MAX_PAGES;
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const normalized = normalizeResult(await options.fetchPage(cursor));
    if (!isPlainRecord(normalized) || !Array.isArray(normalized.items)) {
      throw new ApiFailure(
        { code: 'INVALID_RESPONSE', message: 'The list did not return a page of items.' },
        1,
      );
    }
    options.onItems(normalized.items);
    const next =
      isPlainRecord(normalized) && typeof normalized.nextCursor === 'string'
        ? normalized.nextCursor
        : undefined;
    if (next === undefined || next.length === 0) return { truncated: false };
    if (seenCursors.has(next)) return { truncated: true, reason: 'repeated-cursor' };
    seenCursors.add(next);
    cursor = next;
  }
  return { truncated: true, reason: 'page-cap' };
}
