import type { operations } from '../generated/operations.js';
import type { OperationDefinition } from './types.js';

type OperationCommandId = keyof typeof operations;

/**
 * The three bulk endpoints answer with a per-monitor `success` that reports
 * acceptance, not application: there is no operation id to poll and nothing
 * distinguishes queued from applied, so a caller treating exit 0 as "done" may
 * act on monitors still in their old state. A stale-cache defect that made the
 * gap tens of seconds wide was fixed in UPT-3557, so no duration is quoted —
 * the absent completion signal is the part that is structural.
 */
const BULK_DELAY_NOTE =
  'Reports acceptance, not completion. The API answers "success" for every matched monitor as soon as the write is accepted; it carries no operation id, and nothing in the response distinguishes queued from applied. Confirm with `uptimerobot monitors get <id>` before anything depends on the new state.';

/**
 * Editorial notes appended to a command's help description. `src/generated` is
 * a projection of openapi/openapi.yaml and is rewritten by
 * `pnpm openapi:generate`, so behaviour the published contract omits belongs
 * here, alongside the request curation in request-curation.ts.
 */
const DESCRIPTION_NOTES: Partial<Record<OperationCommandId, string>> = {
  'monitors:bulk:pause': BULK_DELAY_NOTE,
  'monitors:bulk:start': BULK_DELAY_NOTE,
  'monitors:bulk:update': BULK_DELAY_NOTE,
};

export function curatedCommandDescription(operation: OperationDefinition): string {
  const description = operation.description ?? operation.summary;
  const note = DESCRIPTION_NOTES[operation.commandId as OperationCommandId];
  return note === undefined ? description : `${description}\n\n${note}`;
}
