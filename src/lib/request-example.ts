import { cliRequestDefaults, curatedRequestBodyFields } from './request-curation.js';
import type { OperationDefinition, OperationValueSchema } from './types.js';

const UNAVAILABLE = Symbol('unavailable request example');

export function synthesizedRequestExample(operation: OperationDefinition): unknown | undefined {
  const fields = curatedRequestBodyFields(operation);
  if (fields.length === 0) return undefined;

  const body: Record<string, unknown> = {};
  let suppliedField = false;
  for (const field of fields.filter((candidate) => candidate.required)) {
    const value = exampleValue(field);
    if (value === UNAVAILABLE) return undefined;
    assignPath(body, field.path, value);
    suppliedField = true;
  }

  if (!suppliedField) {
    const candidate = fields.find(
      (field) =>
        !field.deprecated &&
        !field.hidden &&
        !field.path.includes('.') &&
        !isSensitiveName(field.path) &&
        exampleValue(field) !== UNAVAILABLE,
    );
    if (candidate) {
      assignPath(body, candidate.path, exampleValue(candidate));
      suppliedField = true;
    }
  }

  for (const [path, value] of Object.entries(cliRequestDefaults(operation))) {
    if (valueAtPath(body, path) === undefined) assignPath(body, path, structuredClone(value));
  }
  for (const [path, value] of Object.entries(operation.requestBodyDefaults ?? {})) {
    assignPath(body, path, structuredClone(value));
  }

  return suppliedField || Object.keys(body).length > 0 ? body : undefined;
}

function exampleValue(schema: OperationValueSchema): unknown | typeof UNAVAILABLE {
  if (schema.example !== undefined) return structuredClone(schema.example);
  if (schema.enum?.length) return structuredClone(schema.enum[0]);

  switch (schema.type) {
    case 'array': {
      if (!schema.items) return [];
      const item = exampleValue(schema.items);
      if (item === UNAVAILABLE) return UNAVAILABLE;
      return Array.from({ length: Math.max(1, schema.minItems ?? 0) }, () => structuredClone(item));
    }
    case 'boolean':
      return typeof schema.default === 'boolean' ? schema.default : false;
    case 'integer':
      return Math.ceil(exampleNumber(schema));
    case 'json':
      return {};
    case 'number':
      return exampleNumber(schema);
    case 'object': {
      const value: Record<string, unknown> = {};
      for (const property of schema.requiredProperties ?? []) {
        const propertySchema = schema.properties?.[property];
        if (!propertySchema) return UNAVAILABLE;
        const propertyValue = exampleValue(propertySchema);
        if (propertyValue === UNAVAILABLE) return UNAVAILABLE;
        value[property] = propertyValue;
      }
      return value;
    }
    case 'string': {
      const minimum = schema.minLength ?? 0;
      return minimum > 7 ? 'x'.repeat(minimum) : 'example';
    }
  }
}

function exampleNumber(schema: OperationValueSchema): number {
  const minimum = schema.minimum ?? 1;
  return schema.maximum !== undefined ? Math.min(minimum, schema.maximum) : minimum;
}

function assignPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  let cursor = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = cursor[segment];
    if (!isRecord(existing)) cursor[segment] = {};
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments.at(-1)!] = value;
}

function valueAtPath(target: Record<string, unknown>, path: string): unknown {
  let value: unknown = target;
  for (const segment of path.split('.')) {
    if (!isRecord(value)) return undefined;
    value = value[segment];
  }
  return value;
}

function isSensitiveName(name: string): boolean {
  const normalized = name.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return ['apikey', 'authorization', 'credential', 'password', 'secret', 'token'].some((suffix) =>
    normalized.endsWith(suffix),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
