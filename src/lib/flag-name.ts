/**
 * Converts an OpenAPI parameter or field name into its CLI flag spelling.
 * The generator (scripts/generate-openapi.ts) and the runtime must always
 * agree on this mapping, so both import it from here.
 */
export function flagName(value: string): string {
  return value
    .replace(/_/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}
