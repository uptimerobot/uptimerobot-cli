import { redactSecrets } from './redact-secrets.js';

export interface RedactedRequestPreview {
  body: unknown;
  redacted: readonly string[];
}

/** Dry-run view of a compiled request body, with credential fields replaced. */
export function redactRequestPreview(body: unknown): RedactedRequestPreview {
  const { redacted, value } = redactSecrets(body);
  return { body: value, redacted };
}
