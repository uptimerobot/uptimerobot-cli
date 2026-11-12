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
/** `scheme://user:pass@`, consumed up to the LAST `@` before whitespace: a password may hold `@` or `/`. */
const CREDENTIALED_URL = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s]*@/gi;
const ASSIGNMENT = /(^|[\s"'`])(-{0,2}[A-Za-z][\w.-]*)=("[^"]*"|'[^']*'|`[^`]*`|[^\s"'`]*)/g;
/** Every flag, matched without its value so `-q --password x` still visits `--password`. */
const FLAG = /(^|\s)(--?[A-Za-z][\w.-]*)(?=\s|$)/g;
/**
 * The argument after a flag: quoted fragments (with `\"` escapes inside
 * double quotes), escaped characters and bare characters up to the next space.
 */
const FLAG_VALUE = /\s+(?:"(?:\\.|[^"\\])*"|'[^']*'|\\.|[^\s"'`\\])+/y;
/** A `scheme://user:pass` with no `@` reached yet, as the clip leaves it. */
const CUT_CREDENTIALED_URL = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s]*$/i;
/** Short and long option names that carry a credential without saying so in their name. */
const CREDENTIAL_FLAGS = new Set(['p', 'u', 'user', 'pass', 'passwd', 'pw', 'login', 'auth']);
/** `-phunter2`, `-uroot`: the value glued to a one-letter credential flag. */
const ATTACHED_CREDENTIAL = /^-[pu]\S/;
/** `?token=` and `&api_key=` in a URL, where no whitespace or quote precedes the name. */
const QUERY_PARAMETER = /([?&])([A-Za-z][\w.-]*)=([^&\s"'`#]*)/g;
const CREDENTIAL_HEADER =
  /((?:authorization|proxy-authorization|x-api-key|cookie)\s*:\s*)[^"'`\n]*/gi;
/** Long opaque blobs with both letters and digits — API keys, ping URLs, tokens. */
const OPAQUE_TOKEN = /(^|[\s=:"'`])([A-Za-z0-9+_-]{32,}={0,2})(?=$|[\s"'`])/g;
/** A long opaque path segment: a heartbeat push token or a signed-URL key. */
const OPAQUE_PATH_SEGMENT = /\/([A-Za-z0-9_-]{24,})(?=$|[/?#\s"'`])/g;

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
  result = redactFlagValues(result);
  result = result.replace(QUERY_PARAMETER, (match, prefix: string, name: string) =>
    isSensitiveFieldName(name) ? `${prefix}${name}=***` : match,
  );
  result = result.replace(CREDENTIAL_HEADER, '$1***');
  for (const pattern of SECRET_LITERALS) result = result.replace(pattern, '***');
  result = result.replace(OPAQUE_TOKEN, (match, prefix: string, token: string) =>
    /[A-Za-z]/.test(token) && /\d/.test(token) ? `${prefix}***` : match,
  );
  return result.replace(OPAQUE_PATH_SEGMENT, (match, segment: string) =>
    /[A-Za-z]/.test(segment) && /\d/.test(segment) ? '/***' : match,
  );
}

/**
 * Clips to `limit` and then redacts, for text a repository can make
 * arbitrarily long. A credential the clip cut in half has no `@` or closing
 * quote left for the patterns to find, so a trailing `scheme://user:pass`
 * is masked outright: nothing past the clip is shown anyway.
 */
export function redactClipped(value: string, limit: number): string {
  if (value.length <= limit) return redactSecrets(value);
  return redactSecrets(value.slice(0, limit).replace(CUT_CREDENTIALED_URL, '$1***'));
}

/**
 * Masks the argument after every sensitive flag, whatever it looks like:
 * `--password -hunter2` is a dash-led value, not a valueless flag followed
 * by another. Flags are found one at a time so a valueless `-q` never
 * swallows the sensitive flag after it.
 */
function redactFlagValues(value: string): string {
  let result = '';
  let cursor = 0;
  for (const match of value.matchAll(FLAG)) {
    const flag = match[2]!;
    const start = (match.index ?? 0) + match[1]!.length;
    if (start < cursor) continue;
    if (ATTACHED_CREDENTIAL.test(flag)) {
      result += `${value.slice(cursor, start)}${flag.slice(0, 2)}***`;
      cursor = start + flag.length;
      continue;
    }
    if (!isCredentialFlag(flag)) continue;
    FLAG_VALUE.lastIndex = start + flag.length;
    const argument = FLAG_VALUE.exec(value);
    if (argument === null || argument.index < cursor) continue;
    const gap = argument[0].match(/^\s+/)![0];
    result += `${value.slice(cursor, start)}${flag}${gap}***`;
    cursor = FLAG_VALUE.lastIndex;
  }
  return result + value.slice(cursor);
}

function isCredentialFlag(flag: string): boolean {
  const name = stripLeadingDashes(flag);
  return CREDENTIAL_FLAGS.has(name.toLowerCase()) || isSensitiveFieldName(name);
}

function stripLeadingDashes(value: string): string {
  return value.replace(/^-+/, '');
}
