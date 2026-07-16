import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { FlagValues, OperationDefinition } from './types.js';

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
    else if (typeof value === 'string') url.searchParams.set(parameter.name, value);
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
  const hasBodyInput = bodyValue !== undefined || assignments.length > 0 || files.length > 0;
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
  for (const assignment of assignments) assignValue(objectBody, assignment);

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
  const segments = path.split('.').filter(Boolean);
  if (segments.length === 0) throw new Error('--set requires a field path.');
  let cursor = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = cursor[segment];
    if (typeof existing !== 'object' || existing === null || Array.isArray(existing))
      cursor[segment] = {};
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments.at(-1)!] = parseValue(rawValue);
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

function flagName(value: string): string {
  return value
    .replace(/_/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}
