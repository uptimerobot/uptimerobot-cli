import { z } from 'zod';
import type { InputValue, OperationInput } from './types.js';
import type { OperationDefinition, OperationParameter } from '../lib/types.js';

export class InputValidationError extends Error {}

export function validateInput(
  operation: OperationDefinition,
  input: OperationInput,
): OperationInput {
  for (const parameter of operation.parameters) {
    const values = parameter.in === 'path' ? input.path : input.query;
    const value = values[parameter.name];
    if (value === undefined) {
      if (parameter.required) throw new InputValidationError(`${parameter.name} is required.`);
      continue;
    }

    const result = schemaFor(parameter).safeParse(value);
    if (!result.success) {
      throw new InputValidationError(
        `Invalid ${parameter.name}: ${result.error.issues[0]?.message ?? 'Validation failed.'}`,
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
      schema = z.number().finite().int();
      break;
    case 'number':
      schema = z.number().finite();
      break;
    default:
      schema = z.string();
  }

  if (parameter.minimum !== undefined && schema instanceof z.ZodNumber)
    schema = schema.min(parameter.minimum);
  if (parameter.maximum !== undefined && schema instanceof z.ZodNumber)
    schema = schema.max(parameter.maximum);
  if (parameter.enum) {
    schema = schema.refine((value) => parameter.enum!.includes(value), {
      error: `Expected one of: ${parameter.enum.map(String).join(', ')}`,
    });
  }
  return schema;
}
