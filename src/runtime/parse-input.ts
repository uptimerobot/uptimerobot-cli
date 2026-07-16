import type { InputValue, OperationInput } from './types.js';
import type { FlagValues, OperationDefinition, OperationParameter } from '../lib/types.js';

export function parseInput(
  operation: OperationDefinition,
  args: Record<string, unknown>,
  flags: FlagValues,
): OperationInput {
  const input: OperationInput = { path: {}, query: {} };

  for (const parameter of operation.parameters) {
    const rawValue =
      parameter.in === 'path' ? args[parameter.name] : flags[flagName(parameter.name)];
    if (rawValue === undefined) continue;
    const value = coerceValue(parameter, rawValue);
    if (parameter.in === 'path') input.path[parameter.name] = value;
    if (parameter.in === 'query') input.query[parameter.name] = value;
  }

  return input;
}

function coerceValue(parameter: OperationParameter, value: unknown): InputValue {
  if (parameter.type === 'array') {
    const values = Array.isArray(value) ? value : [value];
    return values.map(String);
  }
  if (parameter.type === 'number' || parameter.type === 'integer') return Number(value);
  if (parameter.type === 'boolean') {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return String(value);
  }
  return String(value);
}

function flagName(value: string): string {
  return value
    .replace(/_/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}
