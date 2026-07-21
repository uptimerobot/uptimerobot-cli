import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { parse } from 'yaml';
import type {
  OperationBodyField,
  OperationBodyFieldType,
  OperationDefinition,
  OperationValueSchema,
} from '../src/lib/types.js';

type HttpMethod = 'delete' | 'get' | 'patch' | 'post' | 'put';

interface OpenApiDocument {
  components?: {
    schemas?: Record<string, OpenApiSchema>;
  };
  paths?: Record<string, OpenApiPathItem>;
  servers?: Array<{ url?: string }>;
}

interface OpenApiOperation {
  description?: string;
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: Record<string, OpenApiMediaType>;
    required?: boolean;
  };
  summary?: string;
  tags?: string[];
}

interface OpenApiMediaType {
  example?: unknown;
  examples?: Record<
    string,
    { description?: string; externalValue?: string; summary?: string; value?: unknown }
  >;
  schema?: OpenApiSchema;
}

interface OpenApiSchema {
  $ref?: string;
  additionalProperties?: boolean | OpenApiSchema;
  allOf?: OpenApiSchema[];
  default?: unknown;
  deprecated?: boolean;
  description?: string;
  discriminator?: {
    mapping?: Record<string, string>;
    propertyName?: string;
  };
  enum?: unknown[];
  example?: unknown;
  items?: OpenApiSchema;
  maximum?: number;
  maxItems?: number;
  maxLength?: number;
  minimum?: number;
  minItems?: number;
  minLength?: number;
  nullable?: boolean;
  oneOf?: OpenApiSchema[];
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  type?: string;
}

interface OpenApiParameter {
  description?: string;
  in?: string;
  name?: string;
  required?: boolean;
  schema?: {
    default?: unknown;
    enum?: unknown[];
    example?: unknown;
    items?: { type?: string };
    maximum?: number;
    minimum?: number;
    type?: string;
  };
}

type OpenApiPathItem = Partial<Record<HttpMethod, OpenApiOperation>> & {
  parameters?: OpenApiParameter[];
};

const METHODS: HttpMethod[] = ['delete', 'get', 'patch', 'post', 'put'];
const BODY_FIELD_TYPES: readonly OperationBodyFieldType[] = [
  'array',
  'boolean',
  'integer',
  'json',
  'number',
  'object',
  'string',
];
interface BodyFlagCuration {
  aliases?: string[];
  description?: string;
  flag: string;
  hidden?: boolean;
}

const BODY_FLAG_CURATIONS: Record<string, BodyFlagCuration> = {
  checkSSLErrors: { aliases: ['check-ssl-errors'], flag: 'check-ssl' },
  followRedirections: { aliases: ['follow-redirections'], flag: 'follow-redirects' },
  friendlyName: { aliases: ['friendly-name'], flag: 'name' },
  httpMethodType: { aliases: ['http-method-type'], flag: 'method' },
  regionData: {
    aliases: ['region-data'],
    description: 'Advanced regional configuration as JSON; use --region for normal selection',
    flag: 'region-config',
  },
  'regionData.MANUAL_SELECTED': {
    aliases: ['region-data-manual-selected'],
    flag: 'region-manual-selected',
  },
  'regionData.REGION': {
    aliases: ['region-data-region'],
    description: 'Checker region code (repeatable)',
    flag: 'region',
  },
  'regionData.THRESHOLD': {
    aliases: ['region-data-threshold'],
    flag: 'region-thresholds',
  },
  'regionData.THRESHOLD.as': {
    aliases: ['region-data-threshold-as'],
    flag: 'region-threshold-as',
  },
  'regionData.THRESHOLD.eu': {
    aliases: ['region-data-threshold-eu'],
    flag: 'region-threshold-eu',
  },
  'regionData.THRESHOLD.na': {
    aliases: ['region-data-threshold-na'],
    flag: 'region-threshold-na',
  },
  'regionData.THRESHOLD.oc': {
    aliases: ['region-data-threshold-oc'],
    flag: 'region-threshold-oc',
  },
  regionalData: { flag: 'regional-data', hidden: true },
};
const RESERVED_FLAGS = new Set([
  'agent',
  'all',
  'api-key',
  'body',
  'columns',
  'confirm',
  'dry-run',
  'file',
  'format',
  'json',
  'raw',
  'set',
]);
const args = parseArgs(process.argv.slice(2));
const inputPath = resolve(args.input ?? 'openapi/openapi.yaml');
const outputPath = resolve(args.output ?? 'src');

const document = parse(await readFile(inputPath, 'utf8')) as OpenApiDocument;
const operations = collectOperations(document);
await writeGeneratedFiles(outputPath, operations);
process.stdout.write(`Generated ${operations.length} commands.\n`);

function collectOperations(document: OpenApiDocument): OperationDefinition[] {
  const defaultApiUrl = document.servers?.[0]?.url ?? 'https://api.uptimerobot.com/v3';
  const generated: OperationDefinition[] = [];

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const method of METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const commandId = commandIdFor(method, path);
      const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]
        .filter((parameter) => parameter.name && parameter.in)
        .map((parameter) => ({
          ...(parameter.schema?.default !== undefined ? { default: parameter.schema.default } : {}),
          ...(parameter.description ? { description: parameter.description } : {}),
          ...(parameter.schema?.enum ? { enum: parameter.schema.enum } : {}),
          ...(parameter.schema?.example !== undefined ? { example: parameter.schema.example } : {}),
          in: parameter.in!,
          ...(parameter.schema?.items?.type ? { itemType: parameter.schema.items.type } : {}),
          ...(parameter.schema?.maximum !== undefined ? { maximum: parameter.schema.maximum } : {}),
          ...(parameter.schema?.minimum !== undefined ? { minimum: parameter.schema.minimum } : {}),
          name: parameter.name!,
          required: parameter.required === true,
          type: parameter.schema?.type ?? 'string',
        }));

      const definition: OperationDefinition = {
        commandId,
        contentTypes: Object.keys(operation.requestBody?.content ?? {}),
        defaultApiUrl,
        ...(operation.description ? { description: operation.description } : {}),
        destructive:
          method === 'delete' ||
          /\/(reset)$/.test(path) ||
          /_delete|_reset/i.test(operation.operationId ?? ''),
        method: method.toUpperCase() as OperationDefinition['method'],
        operationId: operation.operationId ?? `${method.toUpperCase()} ${path}`,
        parameters,
        path,
        requestBodyRequired: operation.requestBody?.required === true,
        summary: operation.summary ?? `${method.toUpperCase()} ${path}`,
        tags: operation.tags ?? [],
      };
      const variants = discriminatedRequestBodyVariants(document, operation);
      if (!variants) {
        const fields = ordinaryRequestBodyFields(document, operation);
        if (fields) assertBodyFlagNames(fields, parameters);
        const examples = requestBodyExamples(operation);
        generated.push({
          ...definition,
          ...(examples.length > 0 ? { requestBodyExamples: examples } : {}),
          ...(fields ? { requestBodyFields: fields } : {}),
        });
        continue;
      }

      for (const variant of variants) {
        assertBodyFlagNames(variant.fields, parameters);
        generated.push({
          ...definition,
          commandId: `${commandId}:${toKebabCase(variant.value)}`,
          requestBodyDefaults: { [variant.propertyName]: variant.value },
          ...(variant.examples.length > 0 ? { requestBodyExamples: variant.examples } : {}),
          requestBodyFields: variant.fields,
          summary: `${definition.summary} (${variant.value})`,
        });
      }
    }
  }

  generated.sort((left, right) => left.commandId.localeCompare(right.commandId));
  const duplicate = generated.find(
    (operation, index) => index > 0 && operation.commandId === generated[index - 1]?.commandId,
  );
  if (duplicate) throw new Error(`Duplicate generated command ID: ${duplicate.commandId}`);
  return generated;
}

function ordinaryRequestBodyFields(
  document: OpenApiDocument,
  operation: OpenApiOperation,
): OperationBodyField[] | undefined {
  const mediaType = operation.requestBody?.content?.['application/json'];
  if (!mediaType?.schema) return undefined;
  const schema = resolveSchema(document, mediaType.schema);
  if (schema.discriminator || schemaType(schema) !== 'object' || !schema.properties)
    return undefined;
  return collectBodyFields(document, schema);
}

interface DiscriminatedVariant {
  examples: ReturnType<typeof requestBodyExamples>;
  fields: OperationBodyField[];
  propertyName: string;
  value: string;
}

function discriminatedRequestBodyVariants(
  document: OpenApiDocument,
  operation: OpenApiOperation,
): DiscriminatedVariant[] | undefined {
  const mediaType = operation.requestBody?.content?.['application/json'];
  if (!mediaType?.schema) return undefined;
  const root = resolveSchema(document, mediaType.schema);
  const propertyName = root.discriminator?.propertyName;
  const mapping = root.discriminator?.mapping;
  if (!propertyName || !mapping || Object.keys(mapping).length === 0) return undefined;

  const variants = new Set(
    (root.oneOf ?? []).map((schema) => schema.$ref).filter((ref): ref is string => Boolean(ref)),
  );
  return Object.entries(mapping).map(([value, reference]) => {
    if (!variants.has(reference)) {
      throw new Error(`Discriminator mapping ${value} does not reference a oneOf schema.`);
    }
    const schema = resolveSchema(document, { $ref: reference });
    const discriminator = schema.properties?.[propertyName];
    if (!discriminator || discriminator.enum?.length !== 1 || discriminator.enum[0] !== value) {
      throw new Error(
        `Discriminator mapping ${value} must match ${propertyName}'s singleton enum.`,
      );
    }
    return {
      examples: requestBodyExamples(operation, propertyName, value),
      fields: collectBodyFields(document, schema, propertyName),
      propertyName,
      value,
    };
  });
}

function collectBodyFields(
  document: OpenApiDocument,
  schema: OpenApiSchema,
  discriminatorProperty?: string,
): OperationBodyField[] {
  const fields: OperationBodyField[] = [];

  function visit(candidate: OpenApiSchema, prefix: string[], parentRequired: boolean): void {
    const resolved = resolveSchema(document, candidate);
    const required = new Set(resolved.required ?? []);
    for (const [name, property] of Object.entries(resolved.properties ?? {})) {
      const path = [...prefix, name];
      if (
        path.length === 1 &&
        discriminatorProperty !== undefined &&
        name === discriminatorProperty
      )
        continue;
      const fieldSchema = resolveSchema(document, property);
      const locallyRequired = required.has(name);
      const fieldRequired = parentRequired && locallyRequired;
      fields.push(
        bodyFieldFor(document, path, fieldSchema, fieldRequired, locallyRequired && !fieldRequired),
      );
      if (schemaType(fieldSchema) === 'object' && fieldSchema.properties) {
        visit(fieldSchema, path, fieldRequired);
      }
    }
  }

  visit(schema, [], true);
  return fields;
}

function bodyFieldFor(
  document: OpenApiDocument,
  path: string[],
  schema: OpenApiSchema,
  required: boolean,
  requiredWhenParentPresent: boolean,
): OperationBodyField {
  const dottedPath = path.join('.');
  const generatedFlag = path.map(toKebabCase).join('-');
  const curation = BODY_FLAG_CURATIONS[dottedPath];
  const valueSchema = valueSchemaFor(document, schema);
  return {
    ...(curation?.aliases?.length ? { aliases: curation.aliases } : {}),
    ...(schema.deprecated === true ? { deprecated: true } : {}),
    flag: curation?.flag ?? generatedFlag,
    ...(curation?.hidden ? { hidden: true } : {}),
    path: dottedPath,
    required,
    ...(requiredWhenParentPresent ? { requiredWhenParentPresent: true } : {}),
    ...valueSchema,
    ...(curation?.description ? { description: curation.description } : {}),
  };
}

function valueSchemaFor(
  document: OpenApiDocument,
  candidate: OpenApiSchema,
  references = new Set<string>(),
): OperationValueSchema {
  if (candidate.$ref && references.has(candidate.$ref)) return { type: 'json' };
  const nextReferences = candidate.$ref ? new Set([...references, candidate.$ref]) : references;
  const schema = resolveSchema(document, candidate);
  const properties = Object.fromEntries(
    Object.entries(schema.properties ?? {}).map(([name, property]) => [
      name,
      valueSchemaFor(document, property, nextReferences),
    ]),
  );
  const additionalProperties =
    typeof schema.additionalProperties === 'object'
      ? valueSchemaFor(document, schema.additionalProperties, nextReferences)
      : schema.additionalProperties;
  return {
    ...(additionalProperties !== undefined ? { additionalProperties } : {}),
    ...(schema.default !== undefined ? { default: schema.default } : {}),
    ...(schema.deprecated === true ? { deprecated: true } : {}),
    ...(schema.description ? { description: schema.description } : {}),
    ...(schema.enum ? { enum: schema.enum } : {}),
    ...(schema.example !== undefined ? { example: schema.example } : {}),
    ...(schema.items ? { items: valueSchemaFor(document, schema.items, nextReferences) } : {}),
    ...(schema.maximum !== undefined ? { maximum: schema.maximum } : {}),
    ...(schema.maxItems !== undefined ? { maxItems: schema.maxItems } : {}),
    ...(schema.maxLength !== undefined ? { maxLength: schema.maxLength } : {}),
    ...(schema.minimum !== undefined ? { minimum: schema.minimum } : {}),
    ...(schema.minItems !== undefined ? { minItems: schema.minItems } : {}),
    ...(schema.minLength !== undefined ? { minLength: schema.minLength } : {}),
    ...(schema.nullable === true ? { nullable: true } : {}),
    ...(Object.keys(properties).length > 0 ? { properties } : {}),
    ...(schema.required?.length ? { requiredProperties: schema.required } : {}),
    type: schemaType(schema),
  };
}

function requestBodyExamples(
  operation: OpenApiOperation,
  discriminatorProperty?: string,
  discriminatorValue?: string,
): Array<{ body: unknown; name: string; summary?: string }> {
  const mediaType = operation.requestBody?.content?.['application/json'];
  if (!mediaType) return [];
  const examples = [
    ...(mediaType.example === undefined
      ? []
      : [{ body: mediaType.example, name: 'Example request' }]),
    ...Object.entries(mediaType.examples ?? {})
      .filter(([, example]) => example.value !== undefined)
      .map(([name, example]) => ({
        body: example.value,
        name,
        ...(example.summary || example.description
          ? { summary: example.summary ?? example.description }
          : {}),
      })),
  ];
  if (discriminatorProperty === undefined) return examples;
  return examples.filter(
    (example) =>
      isRecord(example.body) && example.body[discriminatorProperty] === discriminatorValue,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveSchema(
  document: OpenApiDocument,
  schema: OpenApiSchema,
  references = new Set<string>(),
): OpenApiSchema {
  let resolved = schema;
  if (schema.$ref) {
    if (references.has(schema.$ref)) throw new Error(`Circular schema reference: ${schema.$ref}`);
    const name = schema.$ref.match(/^#\/components\/schemas\/(.+)$/)?.[1];
    const referenced = name ? document.components?.schemas?.[name] : undefined;
    if (!referenced) throw new Error(`Unsupported or missing schema reference: ${schema.$ref}`);
    resolved = resolveSchema(document, referenced, new Set([...references, schema.$ref]));
  }
  if (!resolved.allOf || resolved.allOf.length === 0) return resolved;

  return resolved.allOf.reduce<OpenApiSchema>(
    (combined, member) => mergeSchemas(combined, resolveSchema(document, member, references)),
    { ...resolved, allOf: undefined },
  );
}

function mergeSchemas(left: OpenApiSchema, right: OpenApiSchema): OpenApiSchema {
  return {
    ...left,
    ...right,
    description: left.description ?? right.description,
    properties:
      left.properties || right.properties ? { ...right.properties, ...left.properties } : undefined,
    required: [...new Set([...(right.required ?? []), ...(left.required ?? [])])],
  };
}

function schemaType(schema: OpenApiSchema): OperationBodyFieldType {
  if (BODY_FIELD_TYPES.includes(schema.type as OperationBodyFieldType)) {
    return schema.type as OperationBodyFieldType;
  }
  if (schema.properties || schema.additionalProperties !== undefined) return 'object';
  const types = [...new Set((schema.oneOf ?? []).map(schemaType))];
  return types.length === 1 ? types[0]! : 'json';
}

function assertBodyFlagNames(
  fields: OperationBodyField[],
  parameters: OperationDefinition['parameters'],
): void {
  const used = new Map<string, string>();
  const reserved = new Set([
    ...RESERVED_FLAGS,
    ...parameters
      .filter((parameter) => parameter.in !== 'path')
      .map((parameter) => toKebabCase(parameter.name)),
  ]);
  for (const field of fields) {
    for (const flag of [field.flag, ...(field.aliases ?? [])]) {
      if (reserved.has(flag)) throw new Error(`Request body flag --${flag} is reserved.`);
      const existing = used.get(flag);
      if (existing && existing !== field.path) {
        throw new Error(`Request body fields ${existing} and ${field.path} both use --${flag}.`);
      }
      used.set(flag, field.path);
    }
  }
}

function commandIdFor(method: HttpMethod, path: string): string {
  const parts = path.split('/').filter(Boolean);
  const staticParts = parts
    .filter((part) => !/^\{.+\}$/.test(part))
    .map((part) => (part === 'psps' ? 'status-pages' : toKebabCase(part)));
  const hasParameter = parts.some((part) => /^\{.+\}$/.test(part));
  const endsWithParameter = /^\{.+\}$/.test(parts.at(-1) ?? '');
  const lastStatic = staticParts.at(-1);

  if (method === 'delete') return [...staticParts, 'delete'].join(':');
  if (method === 'patch' || method === 'put') return [...staticParts, 'update'].join(':');
  if (method === 'post') {
    if (['pause', 'pin', 'reset', 'start', 'unpin', 'update'].includes(lastStatic ?? '')) {
      return staticParts.join(':');
    }
    return [...staticParts, 'create'].join(':');
  }

  if (endsWithParameter) return [...staticParts, 'get'].join(':');
  if (staticParts.length === 1) return [...staticParts, 'list'].join(':');
  if (hasParameter) {
    if (['activity-log', 'alerts', 'all', 'response-time', 'uptime'].includes(lastStatic ?? '')) {
      return staticParts.join(':');
    }
    return [...staticParts, 'list'].join(':');
  }
  return staticParts.join(':');
}

async function writeGeneratedFiles(
  output: string,
  operations: OperationDefinition[],
): Promise<void> {
  const commandsPath = join(output, 'commands');
  const generatedPath = join(output, 'generated');
  const previouslyGeneratedCommands = await generatedCommandFiles(
    output,
    commandsPath,
    generatedPath,
  );
  await Promise.all(
    previouslyGeneratedCommands.map((path) => rm(join(output, path), { force: true })),
  );
  await rm(generatedPath, { force: true, recursive: true });
  await mkdir(generatedPath, { recursive: true });

  const registry = Object.fromEntries(
    operations.map((operation) => [operation.commandId, operation]),
  );
  const source = [
    "import type { OperationDefinition } from '../lib/types.js';",
    '',
    `export const operations = ${JSON.stringify(registry, null, 2)} as const satisfies Record<string, OperationDefinition>;`,
    '',
  ].join('\n');
  await writeFile(join(generatedPath, 'operations.ts'), source);

  const commandFiles: string[] = [];
  for (const operation of operations) {
    const segments = operation.commandId.split(':');
    const commandPath = join(commandsPath, ...segments) + '.ts';
    commandFiles.push(relative(output, commandPath));
    const relativePrefix = '../'.repeat(segments.length);
    const commandSource = [
      '/**',
      ' * Code generated by scripts/generate-openapi.ts',
      ' * from openapi/openapi.yaml.',
      ' *',
      ' * DO NOT EDIT — changes will be overwritten.',
      ' * Run `pnpm openapi:generate` to regenerate.',
      ' */',
      `import { createOperationCommand } from '${relativePrefix}lib/operation-command.js';`,
      `import { operations } from '${relativePrefix}generated/operations.js';`,
      '',
      `export default createOperationCommand(operations['${operation.commandId}']);`,
      '',
    ].join('\n');
    await mkdir(dirname(commandPath), { recursive: true });
    await writeFile(commandPath, commandSource);
  }
  await writeFile(
    join(generatedPath, 'command-files.json'),
    `${JSON.stringify(commandFiles.sort(), null, 2)}\n`,
  );
}

async function generatedCommandFiles(
  output: string,
  commandsPath: string,
  generatedPath: string,
): Promise<string[]> {
  try {
    const manifest = JSON.parse(
      await readFile(join(generatedPath, 'command-files.json'), 'utf8'),
    ) as unknown;
    if (!Array.isArray(manifest) || !manifest.every((path) => typeof path === 'string')) {
      throw new Error('Generated command manifest must be an array of paths.');
    }
    return manifest.filter((path) => path.startsWith('commands/') && !path.includes('..'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const generated: string[] = [];
  async function visit(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.name.endsWith('.ts')) {
        const source = await readFile(path, 'utf8');
        if (source.startsWith('/**\n * Code generated by scripts/generate-openapi.ts')) {
          generated.push(relative(output, path));
        }
      }
    }
  }
  await visit(commandsPath);
  return generated;
}

function parseArgs(values: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error(`Invalid arguments: ${values.join(' ')}`);
    result[key.slice(2)] = value;
  }
  return result;
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}
