/**
 * The small facts every scanner in this directory shares.
 *
 * It sits beside `finding.ts` and exists for the same reason: the scanners need
 * these without importing the aggregator that imports them. Keeping the budget
 * constants here in particular is what stops two walks from drifting to
 * different limits — they already carried the same numbers, in comments that
 * pointed at each other.
 */

import { relative, sep } from 'node:path';

/** Bytes a single file may hold before a scan declines to read it. */
export const DEFAULT_MAX_FILE_BYTES = 512 * 1024;

/**
 * Files an extractor could read before a whole-repository walk stops.
 *
 * Sized against a large real monorepo, where the whole tree fits inside this
 * budget: covering it costs about two seconds and finds far more candidates
 * than the 5000 this started at, which truncated silently. Two seconds once,
 * during setup, is worth a scan that reaches the end of the repository.
 */
export const DEFAULT_MAX_CANDIDATE_FILES = 20_000;

/**
 * How many directory entries a walk may examine per candidate it is allowed to
 * keep. The file budget bounds the expensive half — opening and matching — but
 * on its own it would let a repository of a million images be traversed in
 * full, because none of them are ever charged for. This bounds the cheap half
 * too, generously enough that only an enormous tree reaches it.
 */
export const ENTRIES_PER_CANDIDATE = 20;

/** Byte-order comparison; locale-aware sorting would not be reproducible. */
export function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** A repository-relative POSIX path, whatever the platform separator is. */
export function repoRelativePath(repoRoot: string, absolute: string): string {
  return relative(repoRoot, absolute).split(sep).join('/');
}

/**
 * Whether a path or name holds a control character, DEL or a backslash: such
 * a name never reaches a finding, an app or a report line.
 */
export function hasUnsafeCharacters(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f || character === '\\') return true;
  }
  return false;
}
