import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { parse } from 'yaml';
import type { OperationDefinition } from '../src/lib/types.js';

type HttpMethod = 'delete' | 'get' | 'patch' | 'post' | 'put';

interface OpenApiDocument {
  paths?: Record<string, OpenApiPathItem>;
  servers?: Array<{ url?: string }>;
}

interface OpenApiOperation {
  description?: string;
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: Record<string, unknown>;
    required?: boolean;
  };
  summary?: string;
  tags?: string[];
}

interface OpenApiParameter {
  description?: string;
  in?: string;
  name?: string;
  required?: boolean;
  schema?: {
    enum?: unknown[];
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
          ...(parameter.description ? { description: parameter.description } : {}),
          ...(parameter.schema?.enum ? { enum: parameter.schema.enum } : {}),
          in: parameter.in!,
          ...(parameter.schema?.items?.type ? { itemType: parameter.schema.items.type } : {}),
          ...(parameter.schema?.maximum !== undefined ? { maximum: parameter.schema.maximum } : {}),
          ...(parameter.schema?.minimum !== undefined ? { minimum: parameter.schema.minimum } : {}),
          name: parameter.name!,
          required: parameter.required === true,
          type: parameter.schema?.type ?? 'string',
        }));

      generated.push({
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
      });
    }
  }

  generated.sort((left, right) => left.commandId.localeCompare(right.commandId));
  const duplicate = generated.find(
    (operation, index) => index > 0 && operation.commandId === generated[index - 1]?.commandId,
  );
  if (duplicate) throw new Error(`Duplicate generated command ID: ${duplicate.commandId}`);
  return generated;
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
