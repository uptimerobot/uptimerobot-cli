import { isSensitiveFieldName } from '../sensitive-fields.js';

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/** Credential shapes recognisable on sight, regardless of the flag carrying them. */
const SECRET_LITERALS: readonly RegExp[] = [
  /\b[sr]k_(?:live|test)_[A-Za-z0-9]{8,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{8,}/g,
  /\bAKIA[0-9A-Z]{12,}/g,
  /\bAIza[A-Za-z0-9_-]{20,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g,
  /-----BEGIN[^-\n]*PRIVATE KEY-----/g,
];
const CREDENTIALED_URL = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]*@/gi;
const ASSIGNMENT = /(^|[\s"'`])(-{0,2}[A-Za-z][\w.-]*)=("[^"]*"|'[^']*'|`[^`]*`|[^\s"'`]*)/g;
const FLAG_WITH_VALUE = /(^|\s)(--?[A-Za-z][\w.-]*)(\s+)("[^"]*"|'[^']*'|[^\s"'`]+)/g;
/** `?token=` and `&api_key=` in a URL, where no whitespace or quote precedes the name. */
const QUERY_PARAMETER = /([?&])([A-Za-z][\w.-]*)=([^&\s"'`#]*)/g;
const CREDENTIAL_HEADER =
  /((?:authorization|proxy-authorization|x-api-key|cookie)\s*:\s*)[^"'`\n]*/gi;
/** Long opaque blobs with both letters and digits — API keys, ping URLs, tokens. */
const OPAQUE_TOKEN = /(^|[\s=:"'`])([A-Za-z0-9+_-]{32,}={0,2})(?=$|[\s"'`])/g;

/**
 * Keeps the shape of a command while dropping anything that looks like a
 * credential. A heartbeat proposal only needs to say which job it belongs to,
 * so over-redacting a long opaque argument costs nothing and under-redacting
 * would copy a secret into the CLI's output.
 */
export function redactSecrets(value: string): string {
  let result = value.replace(CREDENTIALED_URL, '$1***@');
  result = result.replace(ASSIGNMENT, (match, prefix: string, name: string) =>
    isSensitiveFieldName(stripLeadingDashes(name)) ? `${prefix}${name}=***` : match,
  );
  result = result.replace(FLAG_WITH_VALUE, (match, prefix: string, flag: string, gap: string) =>
    isSensitiveFieldName(stripLeadingDashes(flag)) ? `${prefix}${flag}${gap}***` : match,
  );
  result = result.replace(QUERY_PARAMETER, (match, prefix: string, name: string) =>
    isSensitiveFieldName(name) ? `${prefix}${name}=***` : match,
  );
  result = result.replace(CREDENTIAL_HEADER, '$1***');
  for (const pattern of SECRET_LITERALS) result = result.replace(pattern, '***');
  return result.replace(OPAQUE_TOKEN, (match, prefix: string, token: string) =>
    /[A-Za-z]/.test(token) && /\d/.test(token) ? `${prefix}***` : match,
  );
}

function stripLeadingDashes(value: string): string {
  return value.replace(/^-+/, '');
}
