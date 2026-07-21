/**
 * Field names that look like they carry credentials. Used to redact dry-run
 * previews and to avoid picking secret-looking fields in synthesized examples.
 */
const SENSITIVE_FIELD_SUFFIXES = [
  'apikey',
  'authorization',
  'cookie',
  'credential',
  'password',
  'passphrase',
  'privatekey',
  'secret',
  'token',
] as const;

export function isSensitiveFieldName(name: string): boolean {
  const normalized = name.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return SENSITIVE_FIELD_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}
