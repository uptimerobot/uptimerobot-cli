import { z } from 'zod';
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
    const values = parameter.in === 'path' ? input.path : input.query;
    const value = values[parameter.name];
    if (value === undefined) {
      if (parameter.required) {
        throw new InputValidationError(parameter.name, 'a value', `${parameter.name} is required.`);
      }
      continue;
    }

    const result = schemaFor(parameter).safeParse(value);
    if (!result.success) {
      const expected = result.error.issues[0]?.message ?? 'a valid value';
      throw new InputValidationError(
        parameter.name,
        expected,
        `Invalid ${parameter.name}: ${expected}`,
      );
    }
    values[parameter.name] = result.data as InputValue;
  }
  return input;
}

function schemaFor(parameter: OperationParameter): z.ZodType {
  let schema: z.ZodType;
  switch (parameter.type) {
    case 'array':
      schema = z.array(z.string());
      break;
    case 'boolean':
      schema = z.boolean();
      break;
    case 'integer':
      // Numeric formats are validated on the raw string so that 64-bit IDs
      // and cursors keep their exact spelling on the wire.
      schema = z.string().regex(/^-?\d+$/, 'Expected an integer');
      break;
    case 'number':
      schema = z.string().regex(/^-?(?:\d+\.?\d*|\.\d+)$/, 'Expected a number');
      break;
    default:
      schema = z.string();
  }

  const numeric = parameter.type === 'integer' || parameter.type === 'number';
  if (parameter.minimum !== undefined && numeric) {
    const { minimum } = parameter;
    schema = schema.refine((value) => Number(value) >= minimum, {
      error: `Expected at least ${minimum}`,
    });
  }
  if (parameter.maximum !== undefined && numeric) {
    const { maximum } = parameter;
    schema = schema.refine((value) => Number(value) <= maximum, {
      error: `Expected at most ${maximum}`,
    });
  }
  if (parameter.enum) {
    schema = schema.refine((value) => parameter.enum!.includes(value), {
      error: `Expected one of: ${parameter.enum.map(String).join(', ')}`,
    });
  }
  return schema;
}
