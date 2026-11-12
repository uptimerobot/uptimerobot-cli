import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from '@oclif/core';
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Scan from '../src/commands/scan.js';

/**
 * A tripwire rather than a stub: the scan is offline and unauthenticated, so
 * anything that reaches the credential store here is a bug in the command.
 */
vi.mock('@napi-rs/keyring', () => ({
  AsyncEntry: class {
    constructor() {
      throw new Error('scan must never read the credential store');
    }
  },
}));

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

/**
 * One repository that exercises every part of the document: an accepted URL,
 * path and port, two rejections with different reasons, and one scheduled job.
 */
const REPOSITORY = {
  'package.json': [
    '{',
    '  "description": "datadog is only a word here",',
    '  "dependencies": { "next": "15.1.0", "stripe": "17.4.0", "pg": "8.13.0" }',
    '}',
    '',
  ].join('\n'),
  '.github/workflows/nightly.yml': ['on:', '  schedule:', "    - cron: '0 3 * * *'", ''].join('\n'),
  'app/api/health/route.ts': 'export async function GET() {\n  return new Response("ok");\n}\n',
  Dockerfile: [
    'FROM node:22-alpine',
    'EXPOSE 3000',
    'HEALTHCHECK CMD curl -fsS https://status.example.com/healthz || exit 1',
    '',
  ].join('\n'),
  'docker-compose.yml': [
    'services:',
    '  web:',
    '    ports:',
    '      - "8080:80"',
    '    healthcheck:',
    '      test: ["CMD", "curl", "-f", "http://localhost:8080/healthz"]',
    '',
  ].join('\n'),
} as const;

const roots: string[] = [];
let log: MockInstance<Command['log']>;

async function makeRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ur-scan-command-'));
  roots.push(root);
  for (const [path, contents] of Object.entries(REPOSITORY)) {
    const absolute = join(root, ...path.split('/'));
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, contents);
  }
  return root;
}

/** Everything the command printed, as one string. */
function printed(): string {
  return log.mock.calls.map(([message]) => String(message ?? '')).join('\n');
}

beforeEach(() => {
  log = vi.spyOn(Command.prototype, 'log').mockImplementation(() => {});
  vi.stubEnv('UPTIMEROBOT_OUTPUT', undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('uptimerobot scan', () => {
  it('emits the seed context as JSON, naming the root it scanned', async () => {
    const root = await makeRepository();

    const context = await Scan.run([root, '--json'], { root: projectRoot });

    expect(context.schemaVersion).toBe(2);
    expect(context.repoRoot).toBe(root);
    expect(context.summary).toEqual({
      accepted: 4,
      findings: 7,
      heartbeats: 1,
      rejected: 2,
      rejectedByReason: { 'container-internal': 1, loopback: 1 },
      thirdPartyProviders: 2,
      truncated: false,
    });
    // `/healthz` is recovered from the loopback compose healthcheck: the URL
    // stays skipped, the path it declares does not.
    expect(context.accepted.map((candidate) => [candidate.target, candidate.value])).toEqual([
      ['url', 'https://status.example.com/healthz'],
      ['path', '/api/health'],
      ['path', '/healthz'],
      ['port', '8080'],
    ]);
    expect(context.heartbeats.map((heartbeat) => heartbeat.schedule)).toEqual(['0 3 * * *']);
    expect(JSON.parse(printed())).toEqual(context);
  });

  it('reports third-party providers with evidence in JSON and Markdown', async () => {
    const root = await makeRepository();

    const context = await Scan.run([root, '--json'], { root: projectRoot });

    expect(context.thirdParty).toEqual({
      candidates: [
        {
          provider: 'GitHub',
          searchTerm: 'github',
          class: 'build-time',
          evidence: [
            {
              file: '.github/workflows/nightly.yml',
              line: 1,
              kind: 'ci-file',
              signal: 'ci: .github/workflows/',
              app: '.',
            },
          ],
          hints: [],
        },
        {
          provider: 'Stripe',
          searchTerm: 'stripe',
          class: 'runtime',
          evidence: [
            { file: 'package.json', line: 3, kind: 'npm', signal: 'stripe@17.4.0', app: '.' },
          ],
          hints: [],
        },
      ],
      totals: { skipped: 1, unknown: 1 },
      skipped: [{ name: 'next', reason: 'framework', evidence: { file: 'package.json', line: 3 } }],
      unknown: [
        { name: 'pg', reason: 'protocol-client', evidence: { file: 'package.json', line: 3 } },
      ],
    });
    expect(JSON.stringify(context)).not.toContain('datadog');

    log.mockClear();
    vi.stubEnv('UPTIMEROBOT_OUTPUT', 'table');
    await Scan.run([root], { root: projectRoot });
    const output = printed();
    expect(output).toContain('## Third-party providers (candidates for third-party services)');
    expect(output).toContain('- Stripe: stripe@17.4.0 (package.json:3)');
    expect(output).toContain('- GitHub: .github/workflows/nightly.yml');
    expect(output).toContain('- next (framework or UI library)');
    expect(output).toContain('- pg (protocol client, self-hosted or unknown)');
  });

  it('reports every rejected candidate with its reason and evidence', async () => {
    const root = await makeRepository();

    const context = await Scan.run([root, '--json'], { root: projectRoot });

    expect(context.rejected).toHaveLength(2);
    const loopback = context.rejected.find((candidate) => candidate.reason === 'loopback');
    expect(loopback?.value).toBe('http://localhost:8080/healthz');
    expect(loopback?.matched).toBe('localhost');
    expect(loopback?.message).toContain('localhost');
    expect(loopback?.evidence.file).toBe('docker-compose.yml');
    expect(loopback?.evidence.line).toBeGreaterThan(0);
  });

  it('renders the document as Markdown for a human, rejections included', async () => {
    const root = await makeRepository();
    vi.stubEnv('UPTIMEROBOT_OUTPUT', 'table');

    await Scan.run([root], { root: projectRoot });

    const output = printed();
    expect(output).toContain('# Scan seed context (schema 2)');
    expect(output).toContain(`Repository: ${root}`);
    expect(output).toContain('4 accepted, 2 skipped, 1 scheduled job, 2 third-party providers.');
    expect(output).toContain('## Skipped, and why');
    expect(output).toContain('**loopback**');
    expect(output).toContain('**container-internal**');
    expect(output).toContain('## Scheduled jobs (heartbeat candidates)');
    // Every claim cites the file and line it came from.
    expect(output).toContain('app/api/health/route.ts:1');
    expect(output).not.toContain('"schemaVersion"');
  });

  // Redirected output defaults to JSON, which is right for a pipe but wrong for
  // someone saving the readable report to a file. `--format` is what every
  // generated command already offers; this one should not be the exception.
  it('honours --format table even when the output is not a terminal', async () => {
    const root = await makeRepository();

    await Scan.run([root, '--format', 'table'], { root: projectRoot });

    const output = printed();
    expect(output).toContain('# Scan seed context (schema 2)');
    expect(output).not.toContain('"schemaVersion"');
  });

  it('still emits JSON for --format json', async () => {
    const root = await makeRepository();

    await Scan.run([root, '--format', 'json'], { root: projectRoot });

    expect(JSON.parse(printed())).toMatchObject({ schemaVersion: 2 });
  });

  it('scans the current directory when no path is given', async () => {
    const root = await makeRepository();
    vi.spyOn(process, 'cwd').mockReturnValue(root);

    const context = await Scan.run(['--json'], { root: projectRoot });

    expect(context.repoRoot).toBe(root);
    expect(context.summary.accepted).toBe(4);
  });

  it('needs no API key and never reaches the network', async () => {
    const root = await makeRepository();
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    vi.stubEnv('UPTIMEROBOT_API_KEY', undefined);
    vi.stubEnv('UPTIMEROBOT_CONFIG_DIR', join(root, 'no-config-here'));

    const context = await Scan.run([root, '--json'], { root: projectRoot });

    expect(context.summary.accepted).toBe(4);
    expect(request).not.toHaveBeenCalled();
  });

  it('fails with the error envelope when the path does not exist', async () => {
    const root = await makeRepository();
    const missing = join(root, 'not-here');

    await expect(Scan.run([missing, '--json'], { root: projectRoot })).rejects.toMatchObject({
      cliError: {
        code: 'INVALID_INPUT',
        expected: 'a path to a directory',
        message: `No directory exists at ${missing}.`,
        path: 'path',
      },
      oclif: { exit: 2 },
    });
    expect(printed()).toBe('');
  });

  // Windows chmod touches only the write bit, so the directory stays listable.
  it.skipIf(process.platform === 'win32')(
    'fails when the directory exists but cannot be listed',
    async () => {
      const root = await makeRepository();
      const sealed = join(root, 'sealed');
      await mkdir(sealed);
      await chmod(sealed, 0o000);
      try {
        await expect(Scan.run([sealed, '--json'], { root: projectRoot })).rejects.toMatchObject({
          cliError: {
            code: 'INVALID_INPUT',
            message: `${sealed} cannot be read: EACCES.`,
            path: 'path',
          },
          oclif: { exit: 2 },
        });
      } finally {
        await chmod(sealed, 0o755);
      }
    },
  );

  it('fails when the path is a file rather than a directory', async () => {
    const root = await makeRepository();
    const file = join(root, 'docker-compose.yml');

    await expect(Scan.run([file, '--json'], { root: projectRoot })).rejects.toMatchObject({
      cliError: { code: 'INVALID_INPUT', message: `${file} is not a directory.` },
      oclif: { exit: 2 },
    });
  });
});
