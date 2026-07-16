import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { parse } from 'yaml';
import { runGenerator } from './lib/run-generator.ts';

const SPEC_URL = 'https://cdn.uptimerobot.com/api/openapi.yaml';
const output = resolve('openapi/openapi.yaml');
const response = await fetch(SPEC_URL);
if (!response.ok) throw new Error(`Could not download OpenAPI contract: HTTP ${response.status}`);
const source = await response.text();
const document = parse(source) as { openapi?: string; paths?: Record<string, unknown> };
if (!document.openapi || !document.paths)
  throw new Error('Downloaded document is not an OpenAPI contract.');

await mkdir(dirname(output), { recursive: true });
await writeFile(output, source);
await runGenerator(output, 'src', 'inherit');
process.stdout.write(`Updated ${output} from ${SPEC_URL}.\n`);
