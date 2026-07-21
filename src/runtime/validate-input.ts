import type { InputValue, OperationInput } from './types.js';
import type { OperationDefinition, OperationParameter } from '../lib/types.js';

export class InputValidationError extends Error {
  constructor(
    readonly path: string,
    readonly expected: string,
    message: string,
  ) {
    super(message);
  }
}

export function validateInput(
  operation: OperationDefinition,
  input: OperationInput,
): OperationInput {
  for (const parameter of operation.parameters) {
    const value = (parameter.in === 'path' ? input.path : input.query)[parameter.name];
    if (value === undefined) {
      if (parameter.required) {
        throw new InputValidationError(parameter.name, 'a value', `${parameter.name} is required.`);
      }
      continue;
    }

    const expected = firstIssue(parameter, value);
    if (expected) {
      throw new InputValidationError(
        parameter.name,
        expected,
        `Invalid ${parameter.name}: ${expected}`,
      );
    }
  }
  return input;
}

function firstIssue(parameter: OperationParameter, value: InputValue): string | undefined {
  switch (parameter.type) {
    case 'array':
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        return 'Expected a list of values';
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') return 'Expected a boolean';
      break;
    case 'integer':
      // Numeric formats are validated on the raw string so that 64-bit IDs
      // and cursors keep their exact spelling on the wire.
      if (typeof value !== 'string' || !/^-?\d+$/.test(value)) return 'Expected an integer';
      break;
    case 'number':
      if (typeof value !== 'string' || !/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) {
        return 'Expected a number';
      }
      break;
    default:
      if (typeof value !== 'string') return 'Expected a string';
  }

  const numeric = parameter.type === 'integer' || parameter.type === 'number';
  if (numeric && parameter.minimum !== undefined && Number(value) < parameter.minimum) {
    return `Expected at least ${parameter.minimum}`;
  }
  if (numeric && parameter.maximum !== undefined && Number(value) > parameter.maximum) {
    return `Expected at most ${parameter.maximum}`;
  }
  if (parameter.enum && !parameter.enum.includes(value)) {
    return `Expected one of: ${parameter.enum.map(String).join(', ')}`;
  }
  return undefined;
}
