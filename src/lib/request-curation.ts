import type { operations } from '../generated/operations.js';
import type {
  OperationBodyField,
  OperationDefinition,
  OperationExample,
  OperationValueSchema,
} from './types.js';

export interface RequestCurationIssue {
  expected: string;
  path: string;
}

interface RequestCuration {
  defaults?: Readonly<Record<string, unknown>>;
  field?: (field: OperationBodyField) => OperationBodyField;
  issue?: (body: Readonly<Record<string, unknown>>) => RequestCurationIssue | undefined;
}

type OperationCommandId = keyof typeof operations;

const REQUEST_CURATIONS: Partial<Record<OperationCommandId, RequestCuration>> = {
  'monitors:create:api': {
    field: (field) => curateApiAssertionTarget(field, field.path),
  },
  'monitors:create:keyword': {
    defaults: { httpMethodType: 'GET' },
    field: (field) =>
      field.path === 'httpMethodType'
        ? {
            ...field,
            default: 'GET',
            description:
              'HTTP method to use. The CLI defaults to GET; HEAD is invalid for Keyword monitors',
            enum: field.enum?.filter((value) => value !== 'HEAD'),
            example: 'GET',
          }
        : field,
    issue: (body) =>
      body.httpMethodType === 'HEAD'
        ? {
            expected: 'a method other than HEAD for Keyword monitors',
            path: 'httpMethodType',
          }
        : undefined,
  },
};

export function cliRequestDefaults(
  operation: OperationDefinition,
): Readonly<Record<string, unknown>> {
  return curationFor(operation)?.defaults ?? {};
}

export function curatedRequestBodyField(
  operation: OperationDefinition,
  field: OperationBodyField,
): OperationBodyField {
  return curationFor(operation)?.field?.(field) ?? field;
}

export function curatedRequestBodyFields(
  operation: OperationDefinition,
): readonly OperationBodyField[] {
  return (operation.requestBodyFields ?? []).map((field) =>
    curatedRequestBodyField(operation, field),
  );
}

export function curatedRequestExampleBody(operation: OperationDefinition, body: unknown): unknown {
  if (!isRecord(body)) return body;
  const curated = structuredClone(body);
  for (const [path, value] of Object.entries(cliRequestDefaults(operation))) {
    if (valueAtPath(curated, path) === undefined) assignPath(curated, path, value);
  }
  return curated;
}

export function curatedRequestExamples(
  operation: OperationDefinition,
): readonly OperationExample[] {
  return (operation.requestBodyExamples ?? []).map((example) => ({
    ...example,
    body: curatedRequestExampleBody(operation, example.body),
  }));
}

export function requestCurationIssue(
  operation: OperationDefinition,
  body: Readonly<Record<string, unknown>>,
): RequestCurationIssue | undefined {
  return curationFor(operation)?.issue?.(body);
}

function curationFor(operation: OperationDefinition): RequestCuration | undefined {
  return REQUEST_CURATIONS[operation.commandId as OperationCommandId];
}

function curateApiAssertionTarget<T extends OperationValueSchema>(schema: T, path: string): T {
  const curated = {
    ...schema,
    ...(schema.items ? { items: curateApiAssertionTarget(schema.items, `${path}[]`) } : {}),
    ...(schema.properties
      ? {
          properties: Object.fromEntries(
            Object.entries(schema.properties).map(([name, property]) => [
              name,
              curateApiAssertionTarget(property, `${path}.${name}`),
            ]),
          ),
        }
      : {}),
  } as T;
  return path === 'config.apiAssertions.checks[].target' && curated.type === 'object'
    ? ({
        ...curated,
        description:
          'Temporarily treated as arbitrary JSON because the published schema conflicts with its examples',
        type: 'json',
      } as T)
    : curated;
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

function valueAtPath(target: Readonly<Record<string, unknown>>, path: string): unknown {
  let value: unknown = target;
  for (const segment of path.split('.')) {
    if (!isRecord(value)) return undefined;
    value = value[segment];
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
