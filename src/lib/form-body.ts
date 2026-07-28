/**
 * The multipart encoder, used only when a request carries a `--file` upload.
 * Every other request is sent as JSON, which preserves types, nesting, and
 * empty arrays that multipart cannot express.
 *
 * The API decodes multipart bodies with multer, whose `append-field` parser
 * dictates each rule below. Keeping all of them here means there is a single
 * place to change if the API ever documents a different wire format.
 *
 *   - Arrays are appended once per item under a `key[]` name. The bracket
 *     suffix makes the parser build an array even for one item; a bare
 *     repeated `key` only becomes an array from the second occurrence onwards,
 *     so a single `monitorIds` would arrive as a string and be rejected.
 *   - Nested objects are flattened to dotted paths (`customSettings.page.theme`)
 *     rather than bracketed ones. A dotted name stays a literal key on the
 *     request body and is reassembled by the API; bracket notation would build
 *     a real nested object and change which validators run against it.
 *   - Scalars are sent as `String(value)`, because multipart has no types.
 *   - `null` and `undefined` are dropped; multipart cannot represent them.
 *   - Empty arrays are rejected. `key[]=` decodes to `['']`, and for a numeric
 *     ID list that becomes `[0]` — the API's "every monitor" sentinel, which is
 *     the opposite of clearing the list.
 */
import { isPlainRecord } from './objects.js';
import { RequestInputError } from './request-input-error.js';

/** A `--file` upload whose bytes have already been read from disk. */
export interface FormFilePart {
  content: Blob;
  field: string;
  filename: string;
}

export function encodeFormBody(
  body: Readonly<Record<string, unknown>>,
  files: readonly FormFilePart[] = [],
): FormData {
  const form = new FormData();
  appendValue(form, '', body);
  for (const file of files) form.append(file.field, file.content, file.filename);
  return form;
}

function appendValue(form: FormData, path: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new RequestInputError(
        path,
        'a non-empty array',
        `${path} cannot be cleared in a request that uploads a file. ` +
          `Re-run without --file to send an empty ${path}, or split this into two commands.`,
      );
    }
    for (const item of value) form.append(`${path}[]`, stringifyFormValue(item));
    return;
  }
  if (isPlainRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      appendValue(form, path === '' ? key : `${path}.${key}`, child);
    }
    return;
  }
  form.append(path, stringifyFormValue(value));
}

function stringifyFormValue(value: unknown): string {
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}
