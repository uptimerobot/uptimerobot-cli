import { isPlainRecord } from '../lib/objects.js';
import type { CliError } from '../lib/types.js';

/** A bulk operation response that reported at least one failed item. */
export interface BulkFailure {
  /** Failed item count; always at least 1. */
  failed: number;
  /** The failed `results` entries, verbatim, for the error envelope details. */
  items: readonly unknown[];
  /** Succeeded item count; 0 means every item failed. */
  succeeded: number;
}

/**
 * Detects a wholly or partially failed bulk operation. Bulk endpoints answer
 * HTTP 201 even when every item failed, so the response body is the only
 * signal that the command did not do what was asked. Returns undefined when
 * the payload is not a bulk response or when nothing failed, so any returned
 * value is a failure the caller must report.
 */
export function bulkFailure(payload: unknown): BulkFailure | undefined {
  if (!isPlainRecord(payload)) return undefined;
  const results = payload.results;
  if (!Array.isArray(results)) return undefined;

  const items = results.filter((item) => isPlainRecord(item) && item.status === 'error');
  // totalError is optional in practice, so per-item statuses stay authoritative.
  const reported = typeof payload.totalError === 'number' ? payload.totalError : 0;
  const failed = Math.max(reported, items.length);
  if (failed === 0) return undefined;

  return {
    failed,
    items,
    succeeded:
      typeof payload.totalSuccess === 'number'
        ? payload.totalSuccess
        : results.length - items.length,
  };
}

export function bulkFailureError(failure: BulkFailure): CliError {
  const counts = `${failure.failed} failed, ${failure.succeeded} succeeded`;
  const total = failure.succeeded === 0;
  return {
    code: total ? 'BULK_FAILED' : 'BULK_PARTIAL_FAILURE',
    details: failure.items,
    message: total
      ? `The bulk operation failed for every item (${counts}).`
      : `The bulk operation partially failed (${counts}).`,
  };
}

export function bulkFailureExitCode(failure: BulkFailure): number {
  return failure.succeeded === 0 ? 1 : 3;
}
