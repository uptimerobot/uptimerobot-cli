import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { type IncomingMessage, type Server, createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { COMPONENT_TERMS } from '../src/lib/scan/components.js';
import { runCli } from './helpers/run-cli.js';
import { runInteractiveCli } from './helpers/run-interactive-cli.js';

/**
 * A fake UptimeRobot API with the four endpoints `scan --apply` talks to.
 * Created monitors land in its monitor list, and its search rows never flip
 * `isTracked`, which is exactly the one-minute cache the real catalog has.
 */
interface Stub {
  url: string;
  hits: { method: string; path: string; body: unknown; command: string | undefined }[];
  monitors: Record<string, unknown>[];
  close(): Promise<void>;
}

interface StubOptions {
  catalog?: Record<string, Record<string, unknown>[]>;
  allowance?: { used: number; limit: number } | 'none';
  /** Status and body for the nth create (0-based); default creates; status 0 drops the socket. `thenTrack` puts the
   * monitor in the account list first, as a concurrent create would have. */
  createReplies?: Record<number, { status: number; body: unknown; thenTrack?: boolean }>;
  monitors?: Record<string, unknown>[];
  /** Every monitor page points at the same next cursor, so the list reads as partial. */
  monitorsLoop?: boolean;
  /** Every catalog search answers this status instead of rows. */
  catalogStatus?: number;
  /** Search terms whose lookup answers 503 while the rest resolve. */
  catalogDown?: string[];
  /** Every components search answers this status instead of the recorded fixture. */
  componentsStatus?: number;
  /** Every components search answers this body with 200 instead of the recorded fixture. */
  componentsBody?: unknown;
}

const row = (id: number, name: string, isTracked = false): Record<string, unknown> => ({
  id,
  name,
  logoUrl: null,
  statusPageUrl: `https://status.${name.toLowerCase()}.example/`,
  state: 'operational',
  matchedComponent: null,
  isTracked,
});

const DEFAULT_CATALOG: Record<string, Record<string, unknown>[]> = {
  stripe: [row(801, 'Stripe'), row(802, 'Stripe Terminal')],
  vercel: [row(861, 'Vercel')],
  resend: [row(77, 'Resend')],
  aws: [row(248, 'AWS')],
  github: [row(6, 'GitHub')],
  sentry: [],
};

const stubs: Stub[] = [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function providerIdOf(body: unknown): unknown {
  const config = isRecord(body) ? body.config : undefined;
  const service = isRecord(config) ? config.thirdPartyService : undefined;
  return isRecord(service) ? service.providerId : undefined;
}

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let text = '';
    request.on('data', (chunk: Buffer | string) => {
      text += chunk.toString();
    });
    request.on('end', () => resolve(text.length === 0 ? undefined : JSON.parse(text)));
  });
}

async function startStub(options: StubOptions = {}): Promise<Stub> {
  const catalog = options.catalog ?? DEFAULT_CATALOG;
  const monitors = [...(options.monitors ?? [])];
  const hits: Stub['hits'] = [];
  let creates = 0;
  let nextId = 5000;
  const server: Server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://stub');
    const body = await readBody(request);
    hits.push({
      method: request.method ?? '',
      path: `${url.pathname}${url.search}`,
      body,
      command: request.headers['x-uptimerobot-command'] as string | undefined,
    });
    const reply = (status: number, payload: unknown): void => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(payload));
    };
    if (request.method === 'GET' && url.pathname === '/v3/user/me') {
      if (options.allowance === 'none') return reply(200, { data: { email: 'x@example.test' } });
      const allowance = options.allowance ?? { used: 2, limit: 10 };
      return reply(200, {
        data: {
          email: 'x@example.test',
          dependencyMonitorsCount: allowance.used + creates,
          dependencyMonitorLimit: allowance.limit,
        },
      });
    }
    if (request.method === 'GET' && url.pathname === '/v3/monitors') {
      return reply(
        200,
        options.monitorsLoop ? { data: monitors, nextCursor: 'again' } : { data: monitors },
      );
    }
    if (request.method === 'GET' && url.pathname === '/v3/third-party-providers') {
      if (options.catalogStatus !== undefined) return reply(options.catalogStatus, 'catalog down');
      if (options.catalogDown?.includes(url.searchParams.get('search') ?? '') === true)
        return reply(503, 'catalog down');
      return reply(200, { data: catalog[url.searchParams.get('search') ?? ''] ?? [] });
    }
    const detail = /^\/v3\/third-party-providers\/(\d+)$/.exec(url.pathname);
    if (request.method === 'GET' && detail !== null) {
      // The whole tree is every recorded components answer of the provider, merged.
      const directory = join(FIXTURES, detail[1]!);
      if (!existsSync(directory))
        return reply(404, { code: '026-016', message: 'unknown provider' });
      const roots = readdirSync(directory).flatMap((name) => {
        const parsed = JSON.parse(readFileSync(join(directory, name), 'utf8')) as {
          data: unknown[];
        };
        return parsed.data;
      });
      return reply(200, { data: { id: Number(detail[1]), name: 'provider', components: roots } });
    }
    const components = /^\/v3\/third-party-providers\/(\d+)\/components$/.exec(url.pathname);
    if (request.method === 'GET' && components !== null) {
      if (options.componentsStatus !== undefined)
        return reply(options.componentsStatus, { code: 'DOWN', message: 'components down' });
      if (options.componentsBody !== undefined) return reply(200, options.componentsBody);
      const term = url.searchParams.get('search') ?? '';
      const fixture = join(FIXTURES, components[1]!, `${encodeURIComponent(term)}.json`);
      // A recorded answer per query string; a term with no recording is a test bug, not a miss.
      if (!existsSync(fixture)) return reply(599, { message: `no components fixture for ${term}` });
      return reply(200, JSON.parse(readFileSync(fixture, 'utf8')));
    }
    if (request.method === 'POST' && url.pathname === '/v3/monitors') {
      const scripted = options.createReplies?.[creates];
      creates += 1;
      const providerId = providerIdOf(body);
      if (scripted !== undefined) {
        if (scripted.thenTrack === true) {
          monitors.push({
            id: 4000 + creates,
            type: 'THIRD_PARTY_SERVICE',
            config: { thirdPartyService: { providerId } },
          });
        }
        if (scripted.status === 0) return response.destroy();
        return reply(scripted.status, scripted.body);
      }
      const monitor = {
        id: nextId,
        friendlyName: `provider-${String(providerId)}`,
        type: 'THIRD_PARTY_SERVICE',
        status: 'UP',
        config: { thirdPartyService: { providerId } },
      };
      nextId += 1;
      monitors.push(monitor);
      return reply(201, { data: monitor });
    }
    return reply(404, {
      code: 'NOT_FOUND',
      message: `No route for ${request.method} ${url.pathname}`,
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const stub: Stub = {
    url: `http://127.0.0.1:${address.port}/v3`,
    hits,
    monitors,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
  stubs.push(stub);
  return stub;
}

const roots: string[] = [];

async function writeRepository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ur-scan-apply-'));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return root;
}

const FIXTURES = join(import.meta.dirname, 'fixtures', 'third-party', 'components');

const AWS_TERRAFORM = [
  'provider "aws" {',
  '  region = "eu-central-1"',
  '}',
  'resource "aws_s3_bucket" "logs" {}',
  'resource "aws_db_instance" "main" {}',
  '',
].join('\n');

/** The skill's django-aws fixture: S3 and RDS in Frankfurt, two scoped components. */
const AWS_REPOSITORY = {
  'requirements.txt': 'boto3==1.35.80\n',
  'infra/main.tf': AWS_TERRAFORM,
};

const REPOSITORY = {
  'package.json': JSON.stringify({
    dependencies: {
      next: '15.1.0',
      stripe: '17.4.0',
      resend: '4.0.1',
      '@sentry/nextjs': '8.42.0',
      pg: '8.13.0',
    },
    devDependencies: { '@octokit/rest': '21.0.0' },
  }),
  'vercel.json': '{}',
  '.env': 'STRIPE_SECRET_KEY=sk_live_secret\n',
};

afterEach(async () => {
  await Promise.all(stubs.splice(0).map((stub) => stub.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

const env = (stub: Stub, extra: Record<string, string | undefined> = {}) => ({
  UPTIMEROBOT_AGENT: '1',
  UPTIMEROBOT_API_KEY: 'u123-secret',
  UPTIMEROBOT_DEV_API_URL: stub.url,
  ...extra,
});

const posts = (stub: Stub) => stub.hits.filter((hit) => hit.method === 'POST');

describe('uptimerobot scan --apply scopes a provider to its components', () => {
  const componentSearches = (stub: Stub) =>
    stub.hits
      .filter((hit) => hit.path.includes('/components?'))
      .map((hit) =>
        decodeURIComponent(new URL(hit.path, 'http://x').searchParams.get('search') ?? ''),
      );

  it('proposes the two Frankfurt components of the django-aws fixture and creates with exactly their ids', async () => {
    const stub = await startStub();
    const root = await writeRepository(AWS_REPOSITORY);

    const proposed = await runCli(['scan', root, '--apply', '--json'], env(stub));
    expect(proposed.exitCode).toBe(2);
    const pin = JSON.parse(proposed.stdout).proposal[0].pin as string;
    const result = await runCli(
      ['scan', root, '--apply', '--confirm', '--json', '--only', pin],
      env(stub),
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(proposed.stdout);
    expect(output.proposal[0]).toMatchObject({
      provider: 'AWS',
      status: 'create',
      scope: 'components',
      terms: [
        {
          term: 'Amazon Relational Database Service',
          region: 'eu-central-1',
          outcome: 'matched',
          leaves: 1,
        },
        {
          term: 'Amazon Simple Storage Service',
          region: 'eu-central-1',
          outcome: 'matched',
          leaves: 1,
        },
      ],
      trackedComponents: [
        {
          id: 9208,
          name: 'Amazon Relational Database Service (Frankfurt)',
          term: 'Amazon Relational Database Service',
          region: 'eu-central-1',
        },
        {
          id: 9108,
          name: 'Amazon Simple Storage Service (Frankfurt)',
          term: 'Amazon Simple Storage Service',
          region: 'eu-central-1',
        },
      ],
    });
    expect(output.proposal[0].scopeReason).toBeUndefined();
    expect(posts(stub).map((hit) => hit.body)).toEqual([
      {
        type: 'THIRD_PARTY_SERVICE',
        config: { thirdPartyService: { providerId: 248, trackedComponentIds: [9208, 9108] } },
      },
    ]);
    expect(JSON.parse(result.stdout).results[0]).toMatchObject({
      provider: 'AWS',
      status: 'created',
      trackedComponents: [{ id: 9208 }, { id: 9108 }],
    });
    expect(componentSearches(stub)).toEqual([
      'Amazon Relational Database Service',
      'Amazon Simple Storage Service',
    ]);
    const componentHits = stub.hits.filter((hit) => hit.path.includes('/components?'));
    expect(
      componentHits.map((hit) => [...new URL(hit.path, 'http://x').searchParams.keys()]),
    ).toEqual(componentHits.map(() => ['search']));
  });

  it('leaves the row unresolved when the components endpoint answers 200 without a tree', async () => {
    const stub = await startStub({ componentsBody: { message: 'maintenance' } });
    const root = await writeRepository(AWS_REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).proposal[0]).toMatchObject({
      status: 'unresolved',
      failure: { code: 'COMPONENT_SEARCH_FAILED' },
    });
    expect(posts(stub)).toEqual([]);
  });

  it('shows a hostile leaf name on one line with its format characters and backticks gone', async () => {
    const stub = await startStub({
      componentsBody: {
        data: [
          {
            id: 9001,
            name: `Evil\u202e \`[x](https://e)\`\nline two ${'x'.repeat(300)}`,
            region: null,
            global: true,
            children: [],
          },
          { id: 9002, name: '   ', region: null, global: true, children: [] },
        ],
      },
    });
    const root = await writeRepository(AWS_REPOSITORY);

    const result = await runCli(
      ['scan', root, '--apply'],
      env(stub, { UPTIMEROBOT_OUTPUT: 'table' }),
    );

    const awsLines = result.stdout.split('\n').filter((line) => line.includes('AWS'));
    expect(awsLines.length).toBeGreaterThan(1);
    expect(awsLines.join('\n')).not.toContain('\u202e');
    expect(awsLines.join('\n')).not.toContain('`');
    expect(result.stdout).toContain("Evil '[x](https://e)' line two ");
    expect(result.stdout).not.toContain('x'.repeat(200));
    expect(result.stdout).not.toContain('- AWS, :');
  });

  it('keeps a tracked row informational when its component search fails, so the creates still run', async () => {
    const stub = await startStub({
      componentsStatus: 503,
      monitors: [
        {
          id: 100,
          type: 'THIRD_PARTY_SERVICE',
          config: { thirdPartyService: { providerId: 248, trackedComponentIds: [9108] } },
        },
      ],
    });
    const root = await writeRepository({
      ...AWS_REPOSITORY,
      'package.json': '{ "dependencies": { "stripe": "17.4.0" } }',
    });

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(
      output.proposal.find((row: { provider: string }) => row.provider === 'AWS'),
    ).toMatchObject({
      status: 'already-tracked',
      monitor: { monitorId: 100 },
    });
    expect(
      output.proposal.find((row: { provider: string }) => row.provider === 'AWS').untracked,
    ).toBeUndefined();
    expect(output.results).toEqual([{ provider: 'Stripe', status: 'created', monitorId: 5000 }]);
  });

  it('reads two monitors of one provider as one list, where any that tracks everything means nothing is untracked', async () => {
    const monitor = (id: number, trackedComponentIds: number[] | null) => ({
      id,
      type: 'THIRD_PARTY_SERVICE',
      config: { thirdPartyService: { providerId: 248, trackedComponentIds } },
    });
    const root = await writeRepository(AWS_REPOSITORY);
    const union = await startStub({ monitors: [monitor(101, [9108]), monitor(100, [9208])] });
    const any = await startStub({ monitors: [monitor(100, [9108]), monitor(101, null)] });

    const unionRun = JSON.parse(
      (await runCli(['scan', root, '--apply', '--json'], env(union))).stdout,
    );
    const anyRun = JSON.parse((await runCli(['scan', root, '--apply', '--json'], env(any))).stdout);

    expect(unionRun.proposal[0]).toMatchObject({
      monitor: { monitorId: 100, trackedComponentIds: [9208, 9108] },
      untracked: [],
    });
    expect(anyRun.proposal[0]).toMatchObject({
      monitor: { trackedComponentIds: null },
      untracked: [],
    });
  });

  it('asks the endpoint once for a term seen in two regions', async () => {
    const stub = await startStub();
    const root = await writeRepository({
      'infra/eu.tf': AWS_TERRAFORM,
      'infra/us.tf': AWS_TERRAFORM.replace('eu-central-1', 'us-west-2').replace(
        'aws_db_instance',
        'aws_db_x',
      ),
    });

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    const output = JSON.parse(result.stdout);
    expect(output.proposal[0].scope).toBe('components');
    expect(componentSearches(stub)).toEqual([
      'Amazon Relational Database Service',
      'Amazon Simple Storage Service',
    ]);
    expect(output.proposal[0].trackedComponents.map((leaf: { id: number }) => leaf.id)).toEqual([
      9208, 9204, 9108, 9104,
    ]);
  });

  it('shows the scoped components and one evidence line per component to a person', async () => {
    const stub = await startStub();
    const root = await writeRepository(AWS_REPOSITORY);

    const result = await runCli(
      ['scan', root, '--apply'],
      env(stub, { UPTIMEROBOT_OUTPUT: 'table' }),
    );

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain(
      '| AWS | provider "aws", aws_s3, aws_db, +1 more | runtime | 248, operational, https://status.aws.example/ | Amazon Relational Database Service (Frankfurt), Amazon Simple Storage Service (Frankfurt) | create |',
    );
    expect(result.stdout).toContain(
      '- AWS, Amazon Simple Storage Service (Frankfurt): infra/main.tf:4 (aws_s3), region eu-central-1 from infra/main.tf:2',
    );
    expect(result.stdout).toContain(
      '- AWS, Amazon Relational Database Service (Frankfurt): infra/main.tf:5 (aws_db), region eu-central-1 from infra/main.tf:2',
    );
  });

  it('tracks the whole provider and says which term missed when one term matches nothing', async () => {
    const stub = await startStub();
    const root = await writeRepository({
      ...AWS_REPOSITORY,
      'infra/main.tf': `${AWS_TERRAFORM}resource "aws_lambda_function" "fn" {}\n`,
    });

    const result = await runCli(['scan', root, '--apply', '--json'], env(stub));

    expect(result.exitCode).toBe(2);
    const output = JSON.parse(result.stdout);
    expect(output.proposal[0]).toMatchObject({
      provider: 'AWS',
      scope: 'whole',
      scopeReason: 'term-missed',
      trackedComponents: [],
      pin: 'AWS=248:all',
    });
    await runCli(
      ['scan', root, '--apply', '--confirm', '--json', '--only', 'AWS=248:all'],
      env(stub),
    );
    expect(output.proposal[0].terms).toContainEqual({
      term: 'AWS Lambda',
      region: 'eu-central-1',
      outcome: 'missed',
      leaves: 0,
    });
    expect(posts(stub).map((hit) => hit.body)).toEqual([
      { type: 'THIRD_PARTY_SERVICE', config: { thirdPartyService: { providerId: 248 } } },
    ]);
    const readable = await runCli(
      ['scan', root, '--apply'],
      env(await startStub(), { UPTIMEROBOT_OUTPUT: 'table' }),
    );
    expect(readable.stdout).toContain(
      'no component matched AWS Lambda; tracking the whole provider',
    );
  });

  it('tracks the whole provider when a term with no region matches more than twenty leaves', async () => {
    const stub = await startStub();
    const root = await writeRepository({
      'infra/main.tf': 'resource "aws_s3_bucket" "logs" {}\n',
    });

    const result = await runCli(['scan', root, '--apply', '--json'], env(stub));

    const output = JSON.parse(result.stdout);
    expect(output.proposal[0]).toMatchObject({ scope: 'whole', scopeReason: 'too-many' });
    expect(output.proposal[0].terms).toEqual([
      { term: 'Amazon Simple Storage Service', region: null, outcome: 'matched', leaves: 23 },
    ]);
    const readable = await runCli(
      ['scan', root, '--apply'],
      env(await startStub(), { UPTIMEROBOT_OUTPUT: 'table' }),
    );
    expect(readable.stdout).toContain(
      '23 components matched, over 20; tracking the whole provider',
    );
  });

  it('tracks the whole provider when the components endpoint is not there', async () => {
    const stub = await startStub({ componentsStatus: 404 });
    const root = await writeRepository(AWS_REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.proposal[0]).toMatchObject({
      scope: 'whole',
      scopeReason: 'endpoint-unavailable',
    });
    expect(posts(stub)).toHaveLength(1);
    expect(componentSearches(stub)).toHaveLength(1);
  });

  it.each([500, 429, 400])(
    'leaves the row unresolved and creates nothing when a components call answers %i',
    async (status) => {
      const stub = await startStub({ componentsStatus: status });
      const root = await writeRepository(AWS_REPOSITORY);

      const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.stderr).error.code).toBe('CATALOG_UNRESOLVED');
      const output = JSON.parse(result.stdout);
      expect(output.proposal[0]).toMatchObject({
        status: 'unresolved',
        failure: { code: 'COMPONENT_SEARCH_FAILED' },
      });
      expect(posts(stub)).toEqual([]);
      const readable = await runCli(
        ['scan', root, '--apply', '--confirm'],
        env(stub, { UPTIMEROBOT_OUTPUT: 'table' }),
      );
      expect(readable.stdout).toContain(
        `component search for Amazon Relational Database Service failed (HTTP ${status})`,
      );
      expect(readable.stdout).not.toContain('catalog could not');
    },
  );

  it('says what an already-tracked monitor covers and which found component it does not', async () => {
    const tracked = (trackedComponentIds: number[] | null, id: number) => ({
      id,
      type: 'THIRD_PARTY_SERVICE',
      config: { thirdPartyService: { providerId: 248, trackedComponentIds } },
    });
    const root = await writeRepository(AWS_REPOSITORY);
    const scoped = await startStub({ monitors: [tracked([9108], 100)] });
    const whole = await startStub({ monitors: [tracked(null, 101)] });

    const scopedRun = JSON.parse(
      (await runCli(['scan', root, '--apply', '--json'], env(scoped))).stdout,
    );
    const wholeRun = JSON.parse(
      (await runCli(['scan', root, '--apply', '--json'], env(whole))).stdout,
    );

    expect(scopedRun.proposal[0]).toMatchObject({
      status: 'already-tracked',
      monitor: { monitorId: 100, trackedComponentIds: [9108], needsReview: false },
      untracked: ['Amazon Relational Database Service (Frankfurt)'],
    });
    expect(wholeRun.proposal[0]).toMatchObject({
      status: 'already-tracked',
      monitor: { monitorId: 101, trackedComponentIds: null },
      untracked: [],
    });
    const readable = await runCli(
      ['scan', root, '--apply'],
      env(scoped, { UPTIMEROBOT_OUTPUT: 'table' }),
    );
    expect(readable.stdout).toContain(
      'tracks 1 component; scan found Amazon Relational Database Service (Frankfurt), not tracked',
    );
    const readableWhole = await runCli(
      ['scan', root, '--apply'],
      env(whole, { UPTIMEROBOT_OUTPUT: 'table' }),
    );
    expect(readableWhole.stdout).toContain('| tracks every component |');
  });

  it('asks the endpoint nothing for a provider without component terms', async () => {
    const stub = await startStub();
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    const output = JSON.parse(result.stdout);
    expect(
      output.proposal.find((row: { provider: string }) => row.provider === 'Stripe'),
    ).toMatchObject({
      scope: 'whole',
      scopeReason: 'no-terms',
      terms: [],
    });
    expect(componentSearches(stub)).toEqual([]);
  });

  it('sends only built-in component terms as search text', async () => {
    const stub = await startStub();
    const root = await writeRepository({
      ...AWS_REPOSITORY,
      'infra/main.tf': `${AWS_TERRAFORM}resource "aws_sqs_queue" "q" {}\nresource "aws_cloudfront_distribution" "cdn" {}\n`,
    });

    await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    const searches = componentSearches(stub);
    expect(searches.length).toBeGreaterThan(2);
    expect(searches.every((term) => COMPONENT_TERMS.includes(term))).toBe(true);
  });
});

describe('uptimerobot scan --apply pins the components an agent confirms', () => {
  const componentSearches = (stub: Stub) =>
    stub.hits.filter((hit) => hit.path.includes('/components?'));

  it('names the pin on every row so the confirm run can repeat the proposal exactly', async () => {
    const stub = await startStub();
    const root = await writeRepository({
      ...AWS_REPOSITORY,
      'package.json': '{ "dependencies": { "stripe": "17.4.0" } }',
    });

    const output = JSON.parse(
      (await runCli(['scan', root, '--apply', '--json'], env(stub))).stdout,
    );

    expect(
      output.proposal.map((row: { provider: string; pin?: string }) => [row.provider, row.pin]),
    ).toEqual([
      ['AWS', 'AWS=248:9208,9108'],
      ['Stripe', 'Stripe=801:all'],
    ]);
  });

  it('creates exactly the pinned ids without a components search, even when the tree moved', async () => {
    const stub = await startStub({ componentsBody: { data: [] } });
    const root = await writeRepository(AWS_REPOSITORY);

    const result = await runCli(
      ['scan', root, '--apply', '--confirm', '--json', '--only', 'AWS=248:9208,9108'],
      env(stub),
    );

    expect(result.exitCode).toBe(0);
    expect(componentSearches(stub)).toEqual([]);
    expect(posts(stub).map((hit) => hit.body)).toEqual([
      {
        type: 'THIRD_PARTY_SERVICE',
        config: { thirdPartyService: { providerId: 248, trackedComponentIds: [9208, 9108] } },
      },
    ]);
    const output = JSON.parse(result.stdout);
    expect(output.proposal[0]).toMatchObject({
      scope: 'components',
      trackedComponents: [
        { id: 9208, name: 'Amazon Relational Database Service (Frankfurt)' },
        { id: 9108, name: 'Amazon Simple Storage Service (Frankfurt)' },
      ],
    });
  });

  it('pins the whole provider with :all', async () => {
    const stub = await startStub();
    const root = await writeRepository(AWS_REPOSITORY);

    const result = await runCli(
      ['scan', root, '--apply', '--confirm', '--json', '--only', 'AWS=248:all'],
      env(stub),
    );

    expect(result.exitCode).toBe(0);
    expect(componentSearches(stub)).toEqual([]);
    expect(posts(stub).map((hit) => hit.body)).toEqual([
      { type: 'THIRD_PARTY_SERVICE', config: { thirdPartyService: { providerId: 248 } } },
    ]);
    expect(JSON.parse(result.stdout).proposal[0]).toMatchObject({
      scope: 'whole',
      scopeReason: 'pinned-whole',
    });
  });

  it('blocks a pin naming an id the provider tree does not hold', async () => {
    const stub = await startStub();
    const root = await writeRepository(AWS_REPOSITORY);

    const result = await runCli(
      ['scan', root, '--apply', '--confirm', '--json', '--only', 'AWS=248:9208,4242'],
      env(stub),
    );

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error).toMatchObject({
      code: 'INVALID_INPUT',
      path: 'only',
      message: expect.stringContaining('4242'),
    });
    expect(JSON.parse(result.stdout).confirmation).toBe('blocked');
    expect(posts(stub)).toEqual([]);
  });

  it('refuses an off-terminal --confirm on a row with component terms unless its pin is given', async () => {
    const stub = await startStub();
    const root = await writeRepository({
      ...AWS_REPOSITORY,
      'package.json': '{ "dependencies": { "stripe": "17.4.0" } }',
    });

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error).toMatchObject({
      code: 'INVALID_INPUT',
      path: 'only',
      message:
        'pass --only AWS=248:9208,9108 to create what the proposal showed, or --only AWS=248:all for the whole provider.',
    });
    expect(posts(stub)).toEqual([]);

    const pinned = await runCli(
      [
        'scan',
        root,
        '--apply',
        '--confirm',
        '--json',
        '--only',
        'AWS=248:9208,9108',
        '--only',
        'Stripe',
      ],
      env(stub),
    );
    expect(pinned.exitCode).toBe(0);
    expect(posts(stub)).toHaveLength(2);
  });

  it('rejects a malformed pin before any request', async () => {
    const stub = await startStub();
    const root = await writeRepository(AWS_REPOSITORY);
    for (const only of ['AWS=248:', 'AWS=248:x', 'AWS=248:1,,2', 'AWS=248:-1']) {
      const result = await runCli(
        ['scan', root, '--apply', '--confirm', '--json', '--only', only],
        env(stub),
      );
      expect(result.exitCode, only).toBe(2);
      expect(JSON.parse(result.stderr).error.code, only).toBe('INVALID_INPUT');
    }
    expect(stub.hits).toEqual([]);
  });

  it.runIf(process.platform === 'darwin' || process.platform === 'linux')(
    'needs no pin at a terminal, where the run that shows is the run that creates',
    async () => {
      const stub = await startStub();
      const root = await writeRepository(AWS_REPOSITORY);
      const result = await runInteractiveCli(['scan', root, '--apply', '--confirm'], [], {
        UPTIMEROBOT_AGENT: '0',
        UPTIMEROBOT_API_KEY: 'u123-secret',
        UPTIMEROBOT_DEV_API_URL: stub.url,
      });
      expect(result.exitCode).toBe(0);
      expect(posts(stub)).toHaveLength(1);
    },
    30_000,
  );
});

describe('uptimerobot scan --apply', () => {
  it('proposes without creating in agent mode and asks for confirmation', async () => {
    const stub = await startStub();
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--json'], env(stub));

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        code: 'CONFIRMATION_REQUIRED',
        command: 'scan --apply',
        message: 'Explicit confirmation is required. Re-run with --confirm.',
      },
    });
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({
      schemaVersion: 3,
      repoRoot: root,
      allowance: { used: 2, limit: 10, proposed: 3 },
      tracked: { providerIds: [], partial: false },
      confirmation: 'required',
      results: [],
    });
    expect(
      output.proposal.map((item: { provider: string; status: string }) => [
        item.provider,
        item.status,
      ]),
    ).toEqual([
      ['Resend', 'create'],
      ['Sentry', 'not-in-catalog'],
      ['Stripe', 'create'],
      ['Vercel', 'create'],
    ]);
    expect(output.proposal[2]).toMatchObject({
      searchTerm: 'stripe',
      class: 'runtime',
      catalog: { id: 801, name: 'Stripe', state: 'operational' },
      evidence: [{ file: 'package.json', line: 1, signal: 'stripe@17.4.0', app: '.' }],
    });
    expect(posts(stub)).toEqual([]);
    expect(stub.hits.map((hit) => hit.path)).toEqual([
      '/v3/monitors?limit=200',
      '/v3/third-party-providers?search=resend',
      '/v3/third-party-providers?search=sentry',
      '/v3/third-party-providers?search=stripe',
      '/v3/third-party-providers?search=vercel',
      '/v3/user/me',
    ]);
    expect(result.stdout).not.toContain('sk_live');
  });

  it('creates the confirmed rows and reports each monitor id', async () => {
    const stub = await startStub();
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.confirmation).toBe('confirmed');
    expect(output.results).toEqual([
      { provider: 'Resend', status: 'created', monitorId: 5000 },
      { provider: 'Stripe', status: 'created', monitorId: 5001 },
      { provider: 'Vercel', status: 'created', monitorId: 5002 },
    ]);
    expect(posts(stub).map((hit) => hit.body)).toEqual([
      { type: 'THIRD_PARTY_SERVICE', config: { thirdPartyService: { providerId: 77 } } },
      { type: 'THIRD_PARTY_SERVICE', config: { thirdPartyService: { providerId: 801 } } },
      { type: 'THIRD_PARTY_SERVICE', config: { thirdPartyService: { providerId: 861 } } },
    ]);
  });

  it('tags every request of an apply run with the scan:3rd-party command header', async () => {
    const stub = await startStub();
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    expect(result.exitCode).toBe(0);
    expect(stub.hits.length).toBeGreaterThan(0);
    expect(stub.hits.every((hit) => hit.command === 'scan:3rd-party')).toBe(true);
  });

  it('creates each provider once across two confirmed runs, whatever the catalog cache says', async () => {
    const stub = await startStub();
    const root = await writeRepository(REPOSITORY);

    await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));
    const second = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    expect(second.exitCode).toBe(0);
    const output = JSON.parse(second.stdout);
    expect(
      output.proposal.map((item: { provider: string; status: string }) => [
        item.provider,
        item.status,
      ]),
    ).toEqual([
      ['Resend', 'already-tracked'],
      ['Sentry', 'not-in-catalog'],
      ['Stripe', 'already-tracked'],
      ['Vercel', 'already-tracked'],
    ]);
    expect(output.tracked.providerIds).toEqual([77, 801, 861]);
    expect(output.results).toEqual([]);
    expect(posts(stub)).toHaveLength(3);
  });

  it('writes nothing when the allowance is used up, even when confirmed', async () => {
    const stub = await startStub({ allowance: { used: 10, limit: 10 } });
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(
      output.proposal.map((item: { provider: string; status: string }) => item.status),
    ).toEqual(['over-allowance', 'not-in-catalog', 'over-allowance', 'over-allowance']);
    expect(output.allowance).toEqual({ used: 10, limit: 10, proposed: 0 });
    expect(posts(stub)).toEqual([]);
  });

  it('stops at the first failed create, reports what was created, and exits with the API code', async () => {
    const stub = await startStub({
      createReplies: { 1: { status: 429, body: { code: 'RATE_LIMITED', message: 'Slow down' } } },
    });
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    expect(result.exitCode).toBe(7);
    const output = JSON.parse(result.stdout);
    expect(output.results).toEqual([
      { provider: 'Resend', status: 'created', monitorId: 5000 },
      { provider: 'Stripe', status: 'failed', error: { code: 'HTTP_429', message: 'Slow down' } },
    ]);
    expect(posts(stub)).toHaveLength(2);
    expect(JSON.parse(result.stderr)).toMatchObject({ error: { code: 'HTTP_429' } });
  });

  it('reports a repeat create with the monitor the API answers, which is the existing one', async () => {
    const existing = {
      id: 4001,
      type: 'THIRD_PARTY_SERVICE',
      config: { thirdPartyService: { providerId: 77 } },
    };
    const stub = await startStub({
      createReplies: { 0: { status: 201, body: { data: existing } } },
    });
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.results).toEqual([
      { provider: 'Resend', status: 'created', monitorId: 4001 },
      { provider: 'Stripe', status: 'created', monitorId: 5000 },
      { provider: 'Vercel', status: 'created', monitorId: 5001 },
    ]);
  });

  it('reports a create the server may have made as outcome unknown, with no by-hand line for it', async () => {
    const stub = await startStub({
      createReplies: { 0: { status: 504, body: 'gateway timeout', thenTrack: true } },
    });
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    expect(result.exitCode).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output.results).toEqual([
      {
        provider: 'Resend',
        status: 'unknown',
        error: { code: 'HTTP_504', message: 'gateway timeout' },
      },
    ]);
    expect(posts(stub)).toHaveLength(1);

    const readable = await startStub({
      createReplies: { 0: { status: 504, body: 'gateway timeout', thenTrack: true } },
    });
    const human = await runCli(['scan', root, '--apply', '--confirm'], {
      ...env(readable),
      UPTIMEROBOT_OUTPUT: 'table',
    });
    expect(human.exitCode).toBe(1);
    expect(human.stdout).toContain('Outcome unknown');
    expect(human.stdout).toContain('Resend (gateway timeout)');
    expect(human.stdout).toContain('Not attempted: Stripe, Vercel.');
    expect(human.stdout).not.toContain('--provider-id 77');
    expect(human.stdout).toContain('--provider-id 801');
  });

  it('reports a create that answers 2xx without a monitor as unknown and stops there', async () => {
    const stub = await startStub({ createReplies: { 0: { status: 200, body: { data: [] } } } });
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    expect(result.exitCode).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output.results).toEqual([
      {
        provider: 'Resend',
        status: 'unknown',
        error: { code: 'INVALID_RESPONSE', message: expect.stringContaining('monitor') },
      },
    ]);
    expect(JSON.parse(result.stderr)).toMatchObject({ error: { code: 'INVALID_RESPONSE' } });
    expect(posts(stub)).toHaveLength(1);
  });

  it('creates with a partial tracked set and says the list stopped at its cap', async () => {
    const stub = await startStub({ monitorsLoop: true });
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.tracked.partial).toBe(true);
    expect(output.results.map((item: { status: string }) => item.status)).toEqual([
      'created',
      'created',
      'created',
    ]);
    expect(posts(stub)).toHaveLength(3);
  }, 20_000);

  it('exits non-zero when the catalog could not resolve a selected provider', async () => {
    const stub = await startStub({ catalogStatus: 503 });
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: { code: 'CATALOG_UNRESOLVED', message: expect.stringContaining('Resend') },
    });
    const output = JSON.parse(result.stdout);
    expect(output.confirmation).toBe('not-needed');
    expect(output.proposal.every((row: { status: string }) => row.status === 'unresolved')).toBe(
      true,
    );
    expect(posts(stub)).toEqual([]);

    const human = await runCli(['scan', root, '--apply', '--confirm'], {
      ...env(stub),
      UPTIMEROBOT_OUTPUT: 'table',
    });
    expect(human.exitCode).toBe(1);
    expect(human.stdout).not.toContain('Nothing to create.');
    expect(human.stdout).toContain('Unresolved, retry later: Resend, Sentry, Stripe, Vercel.');
  });

  it('creates what resolved and still exits non-zero when one selected row did not', async () => {
    const stub = await startStub({ catalogDown: ['resend'] });
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {
        code: 'CATALOG_UNRESOLVED',
        message: 'The catalog could not resolve Resend; retry later.',
      },
    });
    expect(JSON.parse(result.stdout).results).toEqual([
      { provider: 'Stripe', status: 'created', monitorId: 5000 },
      { provider: 'Vercel', status: 'created', monitorId: 5001 },
    ]);
  });

  it('rejects --only naming a build-time provider unless build-time rows are included', async () => {
    const stub = await startStub();
    const root = await writeRepository(REPOSITORY);

    const refused = await runCli(
      ['scan', root, '--apply', '--confirm', '--json', '--only', 'GitHub'],
      env(stub),
    );
    expect(refused.exitCode).toBe(2);
    expect(JSON.parse(refused.stderr)).toMatchObject({
      error: {
        code: 'INVALID_INPUT',
        path: 'only',
        message: 'GitHub is a build-time provider; add --include-build-time to propose it.',
      },
    });
    expect(stub.hits).toEqual([]);

    const included = await runCli(
      [
        'scan',
        root,
        '--apply',
        '--confirm',
        '--json',
        '--only',
        'GitHub=6:6102',
        '--include-build-time',
      ],
      env(stub),
    );
    expect(included.exitCode).toBe(0);
    expect(posts(stub).map((hit) => hit.body)).toEqual([
      {
        type: 'THIRD_PARTY_SERVICE',
        config: { thirdPartyService: { providerId: 6, trackedComponentIds: [6102] } },
      },
    ]);
  });

  it('refuses the apply-only flags without --apply', async () => {
    const stub = await startStub();
    const root = await writeRepository(REPOSITORY);

    for (const flag of ['--confirm', '--include-build-time', '--only=Stripe', '--skip=Stripe']) {
      const result = await runCli(['scan', root, flag, '--json'], env(stub));
      expect(result.exitCode, flag).not.toBe(0);
      expect(result.stderr, flag).toContain('--apply');
    }
    expect(stub.hits).toEqual([]);
  });

  it('rejects a provider named by both --only and --skip', async () => {
    const stub = await startStub();
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(
      ['scan', root, '--apply', '--json', '--only', 'Stripe=801', '--skip', 'stripe'],
      env(stub),
    );

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {
        code: 'INVALID_INPUT',
        message: '--only and --skip both name stripe.',
        path: 'skip',
      },
    });
    expect(stub.hits).toEqual([]);
  });

  it('rejects an --only or --skip name the scan did not find, and keeps the path an argument', async () => {
    const stub = await startStub();
    const root = await writeRepository(REPOSITORY);

    const typo = await runCli(['scan', root, '--apply', '--json', '--only', 'Vercell'], env(stub));
    expect(typo.exitCode).toBe(2);
    expect(JSON.parse(typo.stderr)).toMatchObject({
      error: {
        code: 'INVALID_INPUT',
        message: 'No scanned provider matches Vercell.',
        path: 'only',
      },
    });
    expect(stub.hits).toEqual([]);

    const skipTypo = await runCli(
      ['scan', root, '--apply', '--json', '--skip', 'Stripee'],
      env(stub),
    );
    expect(skipTypo.exitCode).toBe(2);
    expect(JSON.parse(skipTypo.stderr)).toMatchObject({
      error: {
        code: 'INVALID_INPUT',
        message: 'No scanned provider matches Stripee.',
        path: 'skip',
      },
    });

    const pathAfterFlag = await runCli(
      ['scan', '--apply', '--confirm', '--json', '--only', 'Resend', root],
      env(stub),
    );
    expect(pathAfterFlag.exitCode).toBe(0);
    expect(JSON.parse(pathAfterFlag.stdout).repoRoot).toBe(root);
    expect(posts(stub)).toHaveLength(1);
  });

  it('keeps terminal control characters from the API off the screen', async () => {
    const stub = await startStub({
      catalog: {
        ...DEFAULT_CATALOG,
        stripe: [
          {
            ...row(801, 'Stripe'),
            statusPageUrl: 'https://x.example/\u001b[2J\u001b]0;pwned\u0007|\nEVIL',
          },
        ],
      },
      createReplies: {
        0: { status: 422, body: { message: 'boom\u001b[31m\nCreated 3 services\tok' } },
      },
    });
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--confirm'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: stub.url,
      UPTIMEROBOT_OUTPUT: 'table',
    });

    expect(result.stdout).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/);
    expect(result.stderr).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/);
    expect(result.stderr).toContain('boom[31m Created 3 services ok (HTTP_422)');
    expect(result.stderr).not.toMatch(/\nCreated 3 services/);
    expect(result.stdout).toContain('https://x.example/[2J]0;pwned/ EVIL');
    expect(result.stdout).toContain('Not created: Resend (boom[31m Created 3 services ok).');
  });

  it('limits the run with --only and --skip by provider name, case-insensitively', async () => {
    const stub = await startStub();
    const root = await writeRepository(REPOSITORY);

    const only = await runCli(
      ['scan', root, '--apply', '--confirm', '--json', '--only', 'stripe', '--only', 'VERCEL'],
      env(stub),
    );
    expect(
      JSON.parse(only.stdout).results.map((item: { provider: string }) => item.provider),
    ).toEqual(['Stripe', 'Vercel']);
    expect(stub.hits.filter((hit) => hit.path.includes('search=resend'))).toEqual([]);

    const skip = await runCli(
      ['scan', root, '--apply', '--confirm', '--json', '--skip', 'Stripe'],
      env(stub),
    );
    const output = JSON.parse(skip.stdout);
    expect(output.proposal.map((item: { provider: string }) => item.provider)).toEqual([
      'Resend',
      'Sentry',
      'Vercel',
    ]);
    expect(output.results).toEqual([{ provider: 'Resend', status: 'created', monitorId: 5002 }]);
  });

  it('settles an ambiguous row with --only name=id and includes build-time rows on request', async () => {
    const stub = await startStub({
      catalog: { ...DEFAULT_CATALOG, vercel: [row(861, 'Vercel'), row(862, 'VERCEL')] },
    });
    const root = await writeRepository(REPOSITORY);

    const ambiguous = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));
    const first = JSON.parse(ambiguous.stdout);
    expect(
      first.proposal.find((item: { provider: string }) => item.provider === 'Vercel'),
    ).toMatchObject({
      status: 'ambiguous',
      choices: [{ id: 861 }, { id: 862 }],
    });
    expect(first.results.map((item: { provider: string }) => item.provider)).toEqual([
      'Resend',
      'Stripe',
    ]);

    const settled = await runCli(
      [
        'scan',
        root,
        '--apply',
        '--confirm',
        '--json',
        '--only',
        'Vercel=862',
        '--include-build-time',
      ],
      env(stub),
    );
    const output = JSON.parse(settled.stdout);
    expect(
      output.proposal.map((item: { provider: string; status: string }) => [
        item.provider,
        item.status,
      ]),
    ).toEqual([['Vercel', 'create']]);
    expect(output.results).toEqual([{ provider: 'Vercel', status: 'created', monitorId: 5002 }]);
    expect(posts(stub).at(-1)?.body).toEqual({
      type: 'THIRD_PARTY_SERVICE',
      config: { thirdPartyService: { providerId: 862 } },
    });

    const buildTime = await runCli(
      ['scan', root, '--apply', '--json', '--include-build-time'],
      env(stub),
    );
    expect(
      JSON.parse(buildTime.stdout).proposal.map((item: { provider: string; class: string }) => [
        item.provider,
        item.class,
      ]),
    ).toContainEqual(['GitHub', 'build-time']);
  });

  it('needs no confirmation when there is nothing to create', async () => {
    const stub = await startStub({
      monitors: [
        { id: 1, type: 'THIRD_PARTY_SERVICE', config: { thirdPartyService: { providerId: 77 } } },
        { id: 2, type: 'THIRD_PARTY_SERVICE', config: { thirdPartyService: { providerId: 801 } } },
        { id: 3, type: 'THIRD_PARTY_SERVICE', config: { thirdPartyService: { providerId: 861 } } },
      ],
    });
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--json'], env(stub));

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ confirmation: 'not-needed', results: [] });
    expect(posts(stub)).toEqual([]);
  });

  it('rejects an --only id that is not the id the provider resolved to', async () => {
    const stub = await startStub();
    const root = await writeRepository(REPOSITORY);
    const result = await runCli(
      ['scan', root, '--apply', '--confirm', '--json', '--only', 'Stripe=802'],
      env(stub),
    );

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: { code: 'INVALID_INPUT', path: 'only', message: expect.stringContaining('801') },
    });
    expect(JSON.parse(result.stdout).confirmation).toBe('blocked');
    expect(posts(stub)).toEqual([]);
  });

  it('rejects a malformed --only id before any request', async () => {
    const stub = await startStub();
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(
      ['scan', root, '--apply', '--json', '--only', 'Vercel=abc'],
      env(stub),
    );

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: { code: 'INVALID_INPUT', path: 'only' },
    });
    expect(stub.hits).toEqual([]);
  });

  it('stops on a server failure during a create and reports it as unknown', async () => {
    const stub = await startStub({ createReplies: { 0: { status: 500, body: 'upstream gone' } } });
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    expect(result.exitCode).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output.results).toEqual([
      {
        provider: 'Resend',
        status: 'unknown',
        error: { code: 'HTTP_500', message: 'upstream gone' },
      },
    ]);
    expect(posts(stub)).toHaveLength(1);

    const dropped = await startStub({ createReplies: { 0: { status: 0, body: undefined } } });
    const noStatus = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(dropped));
    expect(noStatus.exitCode).not.toBe(0);
    expect(JSON.parse(noStatus.stdout).results).toEqual([
      {
        provider: 'Resend',
        status: 'unknown',
        error: expect.objectContaining({ code: 'NETWORK_ERROR' }),
      },
    ]);
    expect(posts(dropped)).toHaveLength(1);
  }, 20_000);

  it('fails with the API error when the account list cannot be read, creating nothing', async () => {
    const stub = await startStub();
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], {
      ...env(stub),
      UPTIMEROBOT_DEV_API_URL: `${stub.url.replace(/\/v3$/, '')}/nowhere`,
    });

    expect(result.exitCode).toBe(6);
    expect(JSON.parse(result.stderr)).toMatchObject({ error: { code: 'HTTP_404' } });
    expect(result.stdout).toBe('');
    expect(posts(stub)).toEqual([]);
  });

  it('rejects an invalid UPTIMEROBOT_DEV_API_URL before any request', async () => {
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--json'], {
      UPTIMEROBOT_AGENT: '1',
      UPTIMEROBOT_API_KEY: 'u123-key',
      UPTIMEROBOT_DEV_API_URL: 'not a url',
    });

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {
        code: 'INVALID_INPUT',
        expected: 'an absolute URL',
        message: 'UPTIMEROBOT_DEV_API_URL is not a valid URL.',
        path: 'UPTIMEROBOT_DEV_API_URL',
      },
    });
  });

  it('fails before any request when no credential resolves', async () => {
    const stub = await startStub();
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--json'], {
      UPTIMEROBOT_AGENT: '1',
      UPTIMEROBOT_API_KEY: undefined,
      UPTIMEROBOT_DEV_API_URL: stub.url,
      UPTIMEROBOT_CONFIG_DIR: join(root, 'no-config-here'),
    });

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr)).toMatchObject({ error: { code: 'AUTH_URL_RESTRICTED' } });
    expect(stub.hits).toEqual([]);
  });

  it('still never reaches the network or the credential store without --apply', async () => {
    const stub = await startStub();
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--json'], {
      UPTIMEROBOT_API_KEY: undefined,
      UPTIMEROBOT_DEV_API_URL: stub.url,
      UPTIMEROBOT_CONFIG_DIR: join(root, 'no-config-here'),
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).thirdParty.candidates).toHaveLength(5);
    expect(stub.hits).toEqual([]);
  });

  it('prints a readable proposal and summary for a human', async () => {
    const stub = await startStub();
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--confirm'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      // Pins the hint lines, which otherwise depend on whether the machine
      // running the tests has the CLI on PATH.
      UPTIMEROBOT_CLI_COMMAND: 'uptimerobot',
      UPTIMEROBOT_DEV_API_URL: stub.url,
      UPTIMEROBOT_OUTPUT: 'table',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      '| Stripe | stripe@17.4.0 | runtime | 801, operational, https://status.stripe.example/ |  | create |',
    );
    expect(result.stdout).toContain(
      '| Sentry | @sentry/nextjs@8.42.0 | runtime | not in catalog |  | none |',
    );
    expect(result.stdout).toContain('2 of 10 third-party slots used, 3 proposed.');
    expect(result.stdout).toContain(
      'Created: Resend (monitor 5000), Stripe (monitor 5001), Vercel (monitor 5002).',
    );
    expect(result.stdout).not.toContain('To repeat a create by hand');
    expect(result.stdout).toContain('uptimerobot init');
  });

  it.runIf(process.platform === 'darwin' || process.platform === 'linux')(
    'asks a human once and creates on yes, creates nothing on no',
    async () => {
      const stub = await startStub();
      const root = await writeRepository(REPOSITORY);
      // The suite itself may run inside an agent; the override makes this a human run.
      const interactiveEnv = {
        UPTIMEROBOT_AGENT: '0',
        UPTIMEROBOT_API_KEY: 'u123-secret',
        UPTIMEROBOT_DEV_API_URL: stub.url,
      };

      const declined = await runInteractiveCli(
        ['scan', root, '--apply'],
        [{ waitFor: 'Create 3 third-party services. Continue? [y/N]', input: 'n\n' }],
        interactiveEnv,
      );
      expect(declined.exitCode).toBe(2);
      expect(declined.output).toContain('Nothing was created.');
      expect(declined.output).toContain('the confirmation was declined');
      expect(posts(stub)).toEqual([]);

      const accepted = await runInteractiveCli(
        ['scan', root, '--apply'],
        [{ waitFor: 'Create 3 third-party services. Continue? [y/N]', input: 'y\n' }],
        interactiveEnv,
      );
      expect(accepted.exitCode).toBe(0);
      expect(accepted.output.split('| Provider | Evidence |')).toHaveLength(2);
      expect(accepted.output).toContain('Created: Resend (monitor 5000)');
      expect(posts(stub)).toHaveLength(3);
    },
    30_000,
  );
});

describe('uptimerobot scan --apply reports a cut-short scan', () => {
  const DEEP = { ...REPOSITORY, 'a/b/c/d/e/f/g/h/i/Dockerfile': 'FROM x\nEXPOSE 80\n' };

  it('carries the truncation flag in --json output', async () => {
    const stub = await startStub();
    const root = await writeRepository(DEEP);

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ truncated: true });
    const complete = await runCli(
      ['scan', await writeRepository(REPOSITORY), '--apply', '--confirm', '--json'],
      env(stub),
    );
    expect(JSON.parse(complete.stdout)).toMatchObject({ truncated: false });
  });

  it('warns in readable output, even when there is nothing to create', async () => {
    const stub = await startStub({ catalog: {} });
    const root = await writeRepository(DEEP);

    const result = await runCli(
      ['scan', root, '--apply', '--confirm'],
      env(stub, { UPTIMEROBOT_OUTPUT: 'table' }),
    );

    expect(result.stdout).toContain('Nothing to create.');
    expect(result.stdout).toContain(
      'The scan stopped early, so this proposal may be missing providers.',
    );
  });
});
