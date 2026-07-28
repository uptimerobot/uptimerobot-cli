import { readFileSync } from 'node:fs';
import { isPlainRecord } from './objects.js';

/**
 * oclif builds command ids by joining topics with a colon and reports an
 * unknown command with that internal spelling, so `uptimerobot monitors lst`
 * fails with `command monitors:lst not found`. This CLI sets
 * `oclif.topicSeparator` to a space, so the colon form is a syntax it does not
 * accept, and echoing it back teaches the wrong thing.
 *
 * Two spellings reach the user:
 *
 * - `command <id> not found`  — Config#runCommand, for an unroutable argv
 * - `Command <id> not found.` — Help#showHelp, for an unknown help subject
 *
 * Only the id is rewritten. Replacing every colon in the message would also
 * rewrite colons that belong to the prose, such as a URL or a `min: 5` bound,
 * so the id is captured on its own and substituted in place. The capture is
 * narrowed to the characters a command id can contain, which keeps a
 * URL-shaped argument intact. A message that is not one of the two forms is
 * returned untouched.
 */
const UNKNOWN_COMMAND = /^([Cc]ommand )([\w:-]+)( not found\.?)$/;

export function isUnknownCommandMessage(message: string): boolean {
  return UNKNOWN_COMMAND.test(message);
}

export function withConfiguredCommandId(message: string): string {
  return message.replace(
    UNKNOWN_COMMAND,
    (_full, prefix: string, id: string, suffix: string) =>
      `${prefix}${id.replaceAll(':', topicSeparator())}${suffix}`,
  );
}

let cachedSeparator: string | undefined;

/**
 * The `oclif.topicSeparator` the CLI is configured with, read from the same
 * manifest oclif itself reads so the two can never disagree. Falls back to
 * oclif's own default, which leaves the id unchanged.
 */
function topicSeparator(): string {
  if (cachedSeparator !== undefined) return cachedSeparator;

  cachedSeparator = ':';
  try {
    const manifest: unknown = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    );
    const oclif = isPlainRecord(manifest) ? manifest.oclif : undefined;
    const separator = isPlainRecord(oclif) ? oclif.topicSeparator : undefined;
    if (typeof separator === 'string' && separator.length > 0) cachedSeparator = separator;
  } catch {
    // An unreadable manifest must not replace the error being reported.
  }
  return cachedSeparator;
}
