/**
 * Terminal display width for table layout. Grapheme clusters are the unit of
 * truncation so surrogate pairs, combining marks, and ZWJ sequences are never
 * split; East Asian wide/fullwidth characters and emoji count as two columns.
 */
const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

// Wide/fullwidth ranges per wcwidth, plus emoji blocks. The variation
// selector U+FE0F upgrades a cluster to emoji presentation (width 2);
// it is intentionally matched as a combining mark inside a grapheme cluster.
const WIDE_OR_EMOJI =
  // oxlint-disable-next-line no-misleading-character-class
  /[\u1100-\u115F\u2329\u232A\u2E80-\uA4CF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6\uFE0F\u{1F000}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u;

export function displayWidth(text: string): number {
  let width = 0;
  for (const { segment } of graphemeSegmenter.segment(text)) {
    width += WIDE_OR_EMOJI.test(segment) ? 2 : 1;
  }
  return width;
}

export function truncateToWidth(text: string, maxWidth: number): string {
  if (displayWidth(text) <= maxWidth) return text;
  const budget = maxWidth - 1;
  let width = 0;
  let kept = '';
  for (const { segment } of graphemeSegmenter.segment(text)) {
    const segmentWidth = WIDE_OR_EMOJI.test(segment) ? 2 : 1;
    if (width + segmentWidth > budget) break;
    width += segmentWidth;
    kept += segment;
  }
  return `${kept}…`;
}
