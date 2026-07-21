import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type {
  FlagValues,
  OperationBodyField,
  OperationDefinition,
  OperationValueSchema,
} from './types.js';
import {
  cliRequestDefaults,
  curatedRequestBodyFields,
  requestCurationIssue,
} from './request-curation.js';

export class RequestInputError extends Error {
  readonly code = 'INVALID_INPUT';
  readonly exitCode = 2;

  constructor(
    readonly path: string,
    readonly expected: string,
    message = `Invalid ${path}: expected ${expected}.`,
  ) {
    super(message);
    this.name = 'RequestInputError';
  }
}

export function buildUrl(
  operation: OperationDefinition,
  args: Record<string, unknown>,
  flags: FlagValues,
  apiUrl: URL,
): URL {
  let path = operation.path;
  for (const parameter of operation.parameters.filter((candidate) => candidate.in === 'path')) {
    const value = args[parameter.name];
    if (value !== undefined)
      path = path.replace(`{${parameter.name}}`, encodeURIComponent(String(value)));
  }

  const base = apiUrl.toString().replace(/\/$/, '');
  const url = new URL(`${base}${path}`);
  for (const parameter of operation.parameters.filter((candidate) => candidate.in === 'query')) {
    const value = flags[flagName(parameter.name)];
    if (Array.isArray(value))
      value.forEach((item) => url.searchParams.append(parameter.name, item));
    else if (typeof value === 'string' || typeof value === 'boolean')
      url.searchParams.set(parameter.name, String(value));
  }
  return url;
}

export async function buildRequestBody(
  operation: OperationDefinition,
  flags: FlagValues,
  headers: Headers,
): Promise<BodyInit | undefined> {
  const bodyValue = typeof flags.body === 'string' ? await readBodyFlag(flags.body) : undefined;
  const assignments = Array.isArray(flags.set) ? flags.set : [];
  const files = Array.isArray(flags.file) ? flags.file : [];
  const bodyFields = curatedRequestBodyFields(operation);
  const hasNamedFields = bodyFields.some((field) => flags[field.flag] !== undefined);
  const hasDefaults = Object.keys(operation.requestBodyDefaults ?? {}).length > 0;
  const hasBodyInput =
    bodyValue !== undefined ||
    assignments.length > 0 ||
    files.length > 0 ||
    hasNamedFields ||
    hasDefaults;
  if (!hasBodyInput) {
    if (operation.requestBodyRequired)
      throw new Error('A request body is required. Pass --body or --set.');
    if (['PATCH', 'POST', 'PUT'].includes(operation.method)) {
      headers.set('content-type', 'application/json');
      return '{}';
    }
    return undefined;
  }

  const objectBody = toObject(bodyValue);
  for (const field of bodyFields) {
    const value = flags[field.flag];
    if (value !== undefined) assignPath(objectBody, field.path, parseBodyField(field, value));
  }
  for (const assignment of assignments) assignValue(objectBody, assignment);
  for (const [path, value] of Object.entries(operation.requestBodyDefaults ?? {})) {
    const supplied = valueAtPath(objectBody, path);
    if (supplied !== undefined && supplied !== value) {
      throw new RequestInputError(
        path,
        String(value),
        `${path} is fixed to ${String(value)} for this command.`,
      );
    }
    assignPath(objectBody, path, value);
  }
  applyRequestCuration(operation, objectBody);
  validateBodyFields(bodyFields, objectBody);

  if (operation.contentTypes.includes('multipart/form-data')) {
    const form = new FormData();
    appendFormValues(form, objectBody);
    for (const file of files) {
      const [field, path] = splitAssignment(file, '--file');
      const bytes = await readFile(path);
      form.append(field, new Blob([bytes]), basename(path));
    }
    return form;
  }

  headers.set('content-type', 'application/json');
  return JSON.stringify(objectBody);
}

function applyRequestCuration(operation: OperationDefinition, body: Record<string, unknown>): void {
  for (const [path, value] of Object.entries(cliRequestDefaults(operation))) {
    if (valueAtPath(body, path) === undefined) assignPath(body, path, value);
  }
  const issue = requestCurationIssue(operation, body);
  if (issue) throw new RequestInputError(issue.path, issue.expected);
}

function appendFormValues(form: FormData, values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((item) => form.append(key, stringifyFormValue(item)));
    else if (value !== undefined && value !== null) form.append(key, stringifyFormValue(value));
  }
}

function stringifyFormValue(value: unknown): string {
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

async function readBodyFlag(value: string): Promise<unknown> {
  const source =
    value === '-'
      ? await readStandardInput()
      : value.startsWith('@')
        ? await readFile(value.slice(1), 'utf8')
        : value;
  try {
    return JSON.parse(source);
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function toObject(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Request body must be a JSON object.');
  }
  return structuredClone(value) as Record<string, unknown>;
}

function assignValue(target: Record<string, unknown>, assignment: string): void {
  const [path, rawValue] = splitAssignment(assignment, '--set');
  assignPath(target, path, parseValue(rawValue));
}

function assignPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.').filter(Boolean);
  if (segments.length === 0) throw new Error('--set requires a field path.');
  let cursor = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = cursor[segment];
    if (typeof existing !== 'object' || existing === null || Array.isArray(existing))
      cursor[segment] = {};
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments.at(-1)!] = value;
}

function splitAssignment(value: string, flag: string): [string, string] {
  const separator = value.indexOf('=');
  if (separator <= 0 || separator === value.length - 1)
    throw new Error(`${flag} expects name=value.`);
  return [value.slice(0, separator), value.slice(separator + 1)];
}

function parseValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseBodyField(field: OperationBodyField, rawValue: unknown): unknown {
  if (field.type === 'array') {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    const itemSchema = field.items ?? { type: 'string' };
    return values.map((value, index) => {
      if (field.path === 'assignedAlertContacts' && itemSchema.type === 'object') {
        const contactId = numericId(value);
        if (contactId !== undefined) {
          return { alertContactId: contactId, recurrence: 0, threshold: 0 };
        }
      }
      return parseTypedValue(itemSchema, value, `${field.path}[${index}]`);
    });
  }
  return parseTypedValue(field, rawValue, field.path);
}

function parseTypedValue(schema: OperationValueSchema, rawValue: unknown, path: string): unknown {
  if (schema.type === 'boolean') {
    if (rawValue === true || rawValue === false) return rawValue;
    if (rawValue === 'true') return true;
    if (rawValue === 'false') return false;
    return rawValue;
  }
  if (schema.type === 'integer' || schema.type === 'number') return Number(rawValue);
  if (schema.type === 'object') {
    const value = typeof rawValue === 'string' ? parseJsonValue(rawValue, path) : rawValue;
    if (!isRecord(value)) throw new RequestInputError(path, 'an object');
    return value;
  }
  if (schema.type === 'array') {
    const value = typeof rawValue === 'string' ? parseJsonValue(rawValue, path) : rawValue;
    if (!Array.isArray(value)) throw new RequestInputError(path, 'an array');
    return value;
  }
  if (schema.type === 'json' && typeof rawValue === 'string') return parseValue(rawValue);
  return String(rawValue);
}

function parseJsonValue(value: string, path: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new RequestInputError(path, 'valid JSON');
  }
}

function validateBodyFields(
  fields: readonly OperationBodyField[],
  body: Record<string, unknown>,
): void {
  for (const field of fields) {
    const value = valueAtPath(body, field.path);
    if (value === undefined) {
      if (field.required) {
        throw new RequestInputError(
          field.path,
          'a value',
          `${field.path} is required. Pass --${field.flag} or --set.`,
        );
      }
      if (field.requiredWhenParentPresent) {
        const parentPath = field.path.split('.').slice(0, -1).join('.');
        if (parentPath && valueAtPath(body, parentPath) !== undefined) {
          throw new RequestInputError(field.path, 'a value because its parent object is present');
        }
      }
      continue;
    }
    validateSchemaValue(field, value, field.path);
  }
}

function validateSchemaValue(schema: OperationValueSchema, value: unknown, path: string): void {
  if (value === null && schema.nullable) return;
  if (schema.type === 'json') return;
  if (schema.type === 'array') {
    if (!Array.isArray(value)) throw new RequestInputError(path, 'an array');
    if (schema.minItems !== undefined && value.length < schema.minItems)
      throw new RequestInputError(path, `at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      throw new RequestInputError(path, `at most ${schema.maxItems} items`);
    if (schema.items) {
      value.forEach((item, index) => validateSchemaValue(schema.items!, item, `${path}[${index}]`));
    }
    return;
  }
  if (schema.type === 'object') {
    if (!isRecord(value)) throw new RequestInputError(path, 'an object');
    const properties = schema.properties ?? {};
    for (const property of schema.requiredProperties ?? []) {
      if (value[property] === undefined) {
        throw new RequestInputError(`${path}.${property}`, `required property ${property}`);
      }
    }
    for (const [name, propertySchema] of Object.entries(properties)) {
      if (value[name] !== undefined)
        validateSchemaValue(propertySchema, value[name], `${path}.${name}`);
    }
    if (schema.additionalProperties === false) {
      const unknownProperty = Object.keys(value).find((name) => !(name in properties));
      if (unknownProperty !== undefined) {
        throw new RequestInputError(`${path}.${unknownProperty}`, 'a documented property');
      }
    } else if (typeof schema.additionalProperties === 'object') {
      for (const [name, propertyValue] of Object.entries(value)) {
        if (!(name in properties)) {
          validateSchemaValue(schema.additionalProperties, propertyValue, `${path}.${name}`);
        }
      }
    }
    return;
  }
  if (schema.type === 'boolean' && typeof value !== 'boolean')
    throw new RequestInputError(path, 'a boolean');
  if ((schema.type === 'integer' || schema.type === 'number') && !isFiniteNumber(value))
    throw new RequestInputError(path, 'a number');
  if (schema.type === 'integer' && typeof value === 'number' && !Number.isInteger(value))
    throw new RequestInputError(path, 'an integer');
  if (schema.type === 'string' && typeof value !== 'string')
    throw new RequestInputError(path, 'a string');
  if (schema.enum && !schema.enum.includes(value)) {
    throw new RequestInputError(path, `one of: ${schema.enum.map(String).join(', ')}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum)
      throw new RequestInputError(path, `at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum)
      throw new RequestInputError(path, `at most ${schema.maximum}`);
  }
  if (typeof value === 'string') {
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength)
      throw new RequestInputError(path, `at least ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && length > schema.maxLength)
      throw new RequestInputError(path, `at most ${schema.maxLength} characters`);
  }
}

function numericId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}

function valueAtPath(target: Record<string, unknown>, path: string): unknown {
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function flagName(value: string): string {
  return value
    .replace(/_/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}
