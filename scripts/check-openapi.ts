import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';
import { runGenerator } from './lib/run-generator.ts';

const SPEC_URL = 'https://cdn.uptimerobot.com/api/openapi.yaml';
const snapshotPath = resolve('openapi/openapi.yaml');
const remote = await fetch(SPEC_URL);
if (!remote.ok) throw new Error(`Could not download OpenAPI contract: HTTP ${remote.status}`);
const [published, snapshot] = await Promise.all([remote.text(), readFile(snapshotPath, 'utf8')]);
if (published !== snapshot) {
  throw new Error(
    'The published OpenAPI contract has changed. Run pnpm openapi:update and include the generated changes.',
  );
}

const temporary = await mkdtemp(join(tmpdir(), 'uptimerobot-openapi-check-'));
await runGenerator(snapshotPath, temporary);
const [expectedFiles, actualFiles] = await Promise.all([
  listFiles(temporary),
  listFiles(resolve('src')),
]);
const commandManifest = JSON.parse(
  await readFile(resolve('src/generated/command-files.json'), 'utf8'),
) as unknown;
if (!Array.isArray(commandManifest) || !commandManifest.every((path) => typeof path === 'string')) {
  throw new Error('Generated command manifest must be an array of paths.');
}
const generatedActualFiles = actualFiles.filter(
  (path) => path.startsWith('generated/') || commandManifest.includes(path),
);
if (JSON.stringify(expectedFiles) !== JSON.stringify(generatedActualFiles)) {
  throw new Error('Generated OpenAPI command files are stale. Run pnpm openapi:generate.');
}
for (const path of expectedFiles) {
  const [expected, actual] = await Promise.all([
    readFile(join(temporary, path), 'utf8'),
    readFile(resolve('src', path), 'utf8'),
  ]);
  if (expected !== actual) throw new Error(`Generated file is stale: src/${path}`);
}
process.stdout.write('OpenAPI snapshot and generated commands are current.\n');

async function listFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else output.push(relative(root, path));
    }
  }
  await visit(root);
  return output.sort();
}
