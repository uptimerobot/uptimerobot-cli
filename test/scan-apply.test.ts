import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { type IncomingMessage, type Server, createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './helpers/run-cli.js';
import { runInteractiveCli } from './helpers/run-interactive-cli.js';

/**
 * A fake UptimeRobot API with the four endpoints `scan --apply` talks to.
 * Created monitors land in its monitor list, and its search rows never flip
 * `isTracked`, which is exactly the one-minute cache the real catalog has.
 */
interface Stub {
  url: string;
  hits: { method: string; path: string; body: unknown }[];
  monitors: Record<string, unknown>[];
  close(): Promise<void>;
}

interface StubOptions {
  catalog?: Record<string, Record<string, unknown>[]>;
  allowance?: { used: number; limit: number } | 'none';
  /** Status and body for the nth create (0-based); default creates. */
  createReplies?: Record<number, { status: number; body: unknown }>;
  monitors?: Record<string, unknown>[];
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
  github: [row(6, 'GitHub')],
  sentry: [],
};

const stubs: Stub[] = [];

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
    hits.push({ method: request.method ?? '', path: `${url.pathname}${url.search}`, body });
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
      return reply(200, { data: monitors });
    }
    if (request.method === 'GET' && url.pathname === '/v3/third-party-providers') {
      return reply(200, { data: catalog[url.searchParams.get('search') ?? ''] ?? [] });
    }
    if (request.method === 'POST' && url.pathname === '/v3/monitors') {
      const scripted = options.createReplies?.[creates];
      creates += 1;
      if (scripted !== undefined) return reply(scripted.status, scripted.body);
      const providerId =
        typeof body === 'object' && body !== null
          ? (body as { config?: { thirdPartyService?: { providerId?: unknown } } }).config
              ?.thirdPartyService?.providerId
          : undefined;
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
      schemaVersion: 2,
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

  it('reports a create refused as already tracked and goes on', async () => {
    const stub = await startStub({
      createReplies: {
        0: { status: 409, body: { code: 'ALREADY_TRACKED', message: 'Provider already tracked' } },
      },
    });
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.results).toEqual([
      { provider: 'Resend', status: 'already-tracked' },
      { provider: 'Stripe', status: 'created', monitorId: 5000 },
      { provider: 'Vercel', status: 'created', monitorId: 5001 },
    ]);
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
    expect(posts(stub).at(-1)?.body).toMatchObject({
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

  it('stops on a server failure during a create and reports it', async () => {
    const stub = await startStub({ createReplies: { 0: { status: 503, body: 'upstream gone' } } });
    const root = await writeRepository(REPOSITORY);

    const result = await runCli(['scan', root, '--apply', '--confirm', '--json'], env(stub));

    expect(result.exitCode).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output.results).toEqual([
      {
        provider: 'Resend',
        status: 'failed',
        error: { code: 'HTTP_503', message: 'upstream gone' },
      },
    ]);
    expect(posts(stub)).toHaveLength(1);
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
      UPTIMEROBOT_DEV_API_URL: stub.url,
      UPTIMEROBOT_OUTPUT: 'table',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      '| Stripe | stripe@17.4.0 | runtime | 801, operational, https://status.stripe.example/ | create |',
    );
    expect(result.stdout).toContain(
      '| Sentry | @sentry/nextjs@8.42.0 | runtime | not in catalog | none |',
    );
    expect(result.stdout).toContain('2 of 10 third-party slots used, 3 proposed.');
    expect(result.stdout).toContain(
      'Created: Resend (monitor 5000), Stripe (monitor 5001), Vercel (monitor 5002).',
    );
    expect(result.stdout).not.toContain('To repeat a create by hand');
    expect(result.stdout).toContain('uptimerobot init');
  });

  it('asks a human once and creates on yes, creates nothing on no', async () => {
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
      [{ waitFor: 'Create 3 third-party services? [y/N]', input: 'n\n' }],
      interactiveEnv,
    );
    expect(declined.exitCode).toBe(2);
    expect(declined.output).toContain('Nothing was created.');
    expect(declined.output).toContain('the confirmation was declined');
    expect(posts(stub)).toEqual([]);

    const accepted = await runInteractiveCli(
      ['scan', root, '--apply'],
      [{ waitFor: 'Create 3 third-party services? [y/N]', input: 'y\n' }],
      interactiveEnv,
    );
    expect(accepted.exitCode).toBe(0);
    expect(accepted.output).toContain('Created: Resend (monitor 5000)');
    expect(posts(stub)).toHaveLength(3);
  }, 30_000);
});
