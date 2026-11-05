/**
 * The one cursor loop every list reader shares: follow `nextCursor` until the
 * API stops handing one out, a cursor repeats (a loop that would never end),
 * or the page cap is reached. The cap is the only way `truncated` becomes
 * true, so a caller can say its list is a prefix rather than the whole.
 */
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

export async function pageThrough(options: PageOptions): Promise<{ truncated: boolean }> {
  const maxPages = options.maxPages ?? MAX_PAGES;
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const normalized = normalizeResult(await options.fetchPage(cursor));
    const items =
      isPlainRecord(normalized) && Array.isArray(normalized.items) ? normalized.items : [];
    options.onItems(items);
    const next =
      isPlainRecord(normalized) && typeof normalized.nextCursor === 'string'
        ? normalized.nextCursor
        : undefined;
    if (next === undefined || next.length === 0 || seenCursors.has(next)) {
      return { truncated: false };
    }
    seenCursors.add(next);
    cursor = next;
  }
  return { truncated: true };
}
