/**
 * The one finding shape every scanner in this directory reports.
 *
 * It lives in its own module rather than in `./index.ts` so that the scanners
 * can share it without importing the aggregator that imports them. Consumers
 * outside this directory should import from `./index.js`, which re-exports
 * everything here.
 */

export interface ScanEvidence {
  /** Repo-relative POSIX path. */
  file: string;
  /** 1-indexed. Use 1 when the finding is the file's existence rather than a line. */
  line: number;
}

export interface ScanFinding {
  /** Discriminator naming what was matched, e.g. 'next-app' or 'compose-port'. */
  kind: string;
  /** The path, port, URL, or schedule as written or derived. */
  value: string;
  evidence: ScanEvidence;
  /** Optional extras, e.g. { method: 'GET' } or { service: 'api', hostIp: '127.0.0.1' }. */
  detail?: Record<string, string>;
}
