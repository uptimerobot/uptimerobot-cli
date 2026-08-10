import type { operations } from '../generated/operations.js';
import type { OperationDefinition } from './types.js';

type OperationCommandId = keyof typeof operations;

/**
 * The three bulk endpoints answer with a per-monitor `success` before the
 * change has been applied, and the response carries no operation id to poll,
 * so a caller that treats the exit code as "done" acts on monitors that are
 * still in their old state. The delay is observed behaviour rather than
 * published contract, which is why it is recorded here.
 */
const BULK_DELAY_NOTE =
  'Applied asynchronously. The API accepts the write and reports "success" for every matched monitor immediately, but the change takes roughly 40-60 seconds to take effect, and nothing in the response distinguishes queued from applied. Poll `uptimerobot monitors get <id>` until the status reflects the change before anything depends on it.';

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
