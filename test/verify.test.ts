import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from '@oclif/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const keyring = vi.hoisted(() => new Map<string, string>());

// The real store reads the developer's OS keychain, which would make this
// suite depend on whoever runs it — and could leak a live key into a request.
vi.mock('@napi-rs/keyring', () => ({
  AsyncEntry: class {
    readonly key: string;

    constructor(service: string, account: string) {
      this.key = `${service}:${account}`;
    }

    async deleteCredential(): Promise<boolean> {
      return keyring.delete(this.key);
    }

    async getPassword(): Promise<string | undefined> {
      return keyring.get(this.key);
    }

    async setPassword(password: string): Promise<void> {
      keyring.set(this.key, password);
    }
  },
}));

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const API_URL = 'https://api.test.invalid/v3';
const QUICK_SETUP_NOTE = 'signature-bound endpoint that accepts no tags';

interface Page {
  data: unknown[];
  nextLink?: string;
}

/**
 * Stands in for the HTTP layer, one queued page per request. Returning a
 * Response rather than a parsed body keeps the client's own status handling,
 * redirect handling and header attribution in the path under test.
 */
function stubApi(pages: Page[]): { requests: string[] } {
  const requests: string[] = [];
  const queue = [...pages];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request.url);
      const page = queue.shift() ?? { data: [] };
      return new Response(JSON.stringify(page), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    }),
  );
  return { requests };
}

function monitor(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    createDateTime: '2026-07-20T09:12:04.000Z',
    friendlyName: 'checkout-api',
    id: 798_411,
    status: 'UP',
    tags: [{ color: '#3bd671', id: 7, name: 'agent-setup' }],
    type: 'HTTP',
    url: 'https://example.com/health',
    ...overrides,
  };
}

describe('verify', () => {
  let configDirectory: string;
  let logged: string[];
  let stderr: string[];

  beforeEach(async () => {
    configDirectory = await mkdtemp(join(tmpdir(), 'uptimerobot-cli-test-'));
    vi.stubEnv('UPTIMEROBOT_CONFIG_DIR', configDirectory);
    vi.stubEnv('UPTIMEROBOT_API_KEY', undefined);
    vi.stubEnv('UPTIMEROBOT_DEV_API_URL', API_URL);
    vi.stubEnv('UPTIMEROBOT_AGENT', '0');
    vi.stubEnv('UPTIMEROBOT_OUTPUT', undefined);
    vi.stubEnv('CI', undefined);
    // Pins the emitted commands, which otherwise depend on whether the machine
    // running the tests happens to have the CLI on PATH.
    vi.stubEnv('UPTIMEROBOT_CLI_COMMAND', 'uptimerobot');
    logged = [];
    stderr = [];
    vi.spyOn(Command.prototype, 'log').mockImplementation((message?: string) => {
      logged.push(message ?? '');
    });
    vi.spyOn(Command.prototype, 'logToStderr').mockImplementation((message?: string) => {
      stderr.push(message ?? '');
    });
  });

  afterEach(async () => {
    keyring.clear();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await rm(configDirectory, { force: true, recursive: true });
  });

  it('filters on the plural tags parameter the API actually documents', async () => {
    const { requests } = stubApi([{ data: [monitor()] }]);
    const { default: Verify } = await import('../src/commands/verify.js');

    const output = await Verify.run(['--api-key', 'u123-explicit', '--json'], {
      root: projectRoot,
    });

    expect(requests).toEqual([`${API_URL}/monitors?limit=200&tags=agent-setup`]);
    expect(output).toMatchObject({ count: 1, tags: ['agent-setup'] });
  });

  it('reduces each monitor to the facts a report can be checked against', async () => {
    stubApi([
      {
        data: [
          monitor(),
          monitor({
            createDateTime: '2026-07-20T09:13:41.000Z',
            friendlyName: 'nightly-billing',
            id: 798_412,
            status: 'PAUSED',
            tags: [
              { color: '#3bd671', id: 7, name: 'agent-setup' },
              { color: '#eee', id: 9, name: 'cron' },
            ],
            type: 'HEARTBEAT',
            url: undefined,
          }),
        ],
      },
    ]);
    const { default: Verify } = await import('../src/commands/verify.js');

    const output = await Verify.run(['--api-key', 'u123-explicit', '--json'], {
      root: projectRoot,
    });

    expect(output.monitors).toEqual([
      {
        createdAt: '2026-07-20T09:12:04.000Z',
        id: 798_411,
        name: 'checkout-api',
        status: 'UP',
        tags: ['agent-setup'],
        target: 'https://example.com/health',
        type: 'HTTP',
      },
      {
        createdAt: '2026-07-20T09:13:41.000Z',
        id: 798_412,
        name: 'nightly-billing',
        status: 'PAUSED',
        // Every tag on the monitor, so a human can see what else was applied.
        tags: ['agent-setup', 'cron'],
        // A heartbeat has nothing to point at, and that is reported, not faked.
        target: null,
        type: 'HEARTBEAT',
      },
    ]);
    expect(JSON.parse(logged[0] ?? '')).toMatchObject({ count: 2 });
  });

  it('follows the cursor instead of trusting one page to be the whole answer', async () => {
    const { requests } = stubApi([
      { data: [monitor({ id: 1 })], nextLink: 'https://api.uptimerobot.com/v3/monitors?cursor=84' },
      { data: [monitor({ id: 2 })], nextLink: 'https://api.uptimerobot.com/v3/monitors?cursor=91' },
      { data: [monitor({ id: 3 })] },
    ]);
    const { default: Verify } = await import('../src/commands/verify.js');

    const output = await Verify.run(['--api-key', 'u123-explicit', '--json'], {
      root: projectRoot,
    });

    expect(requests).toEqual([
      `${API_URL}/monitors?limit=200&tags=agent-setup`,
      `${API_URL}/monitors?limit=200&tags=agent-setup&cursor=84`,
      `${API_URL}/monitors?limit=200&tags=agent-setup&cursor=91`,
    ]);
    expect({ count: output.count, ids: output.monitors.map((entry) => entry.id) }).toEqual({
      count: 3,
      ids: [1, 2, 3],
    });
    expect(output.truncated).toBe(false);
  });

  it('stops when a cursor points back at a page it already read', async () => {
    const looping = 'https://api.uptimerobot.com/v3/monitors?cursor=84';
    const { requests } = stubApi([
      { data: [monitor({ id: 1 })], nextLink: looping },
      { data: [monitor({ id: 2 })], nextLink: looping },
    ]);
    const { default: Verify } = await import('../src/commands/verify.js');

    const output = await Verify.run(['--api-key', 'u123-explicit', '--json'], {
      root: projectRoot,
    });

    expect(requests).toHaveLength(2);
    expect(output.count).toBe(2);
  });

  it('says so when it gives up paging rather than passing a partial list off as the whole', async () => {
    vi.stubEnv('UPTIMEROBOT_OUTPUT', 'table');
    // One more page than the cap, each with a cursor of its own so the loop
    // guard cannot be what stops it.
    const { requests } = stubApi(
      Array.from({ length: 51 }, (_, index) => ({
        data: [monitor({ id: index })],
        nextLink: `https://api.uptimerobot.com/v3/monitors?cursor=${index + 1}`,
      })),
    );
    const { default: Verify } = await import('../src/commands/verify.js');

    const output = await Verify.run(['--api-key', 'u123-explicit'], { root: projectRoot });

    expect({ count: output.count, pages: requests.length, truncated: output.truncated }).toEqual({
      count: 50,
      pages: 50,
      truncated: true,
    });
    expect(stderr.join('\n')).toContain('Stopped after 50 pages.');
  });

  it('reports zero as a result rather than a failure, and says what zero cannot prove', async () => {
    // The suite has no terminal to infer human output from, and the human
    // rendering is exactly what this test is about.
    vi.stubEnv('UPTIMEROBOT_OUTPUT', 'table');
    stubApi([{ data: [] }]);
    const { default: Verify } = await import('../src/commands/verify.js');

    const output = await Verify.run(['--api-key', 'u123-explicit'], { root: projectRoot });
    const printed = logged.join('\n');

    expect(output).toMatchObject({ count: 0, monitors: [], truncated: false });
    expect(printed).toContain('No monitors carry the tag agent-setup.');
    expect(printed).toContain(QUICK_SETUP_NOTE);
    expect(printed).toContain('Zero here does not prove nothing was created');
    // Templated through the resolved invocation, so an npx caller is never
    // told to run a binary they do not have.
    expect(printed).toContain('`uptimerobot monitors list`');
  });

  it('prints a table a human can hold next to the run report', async () => {
    vi.stubEnv('UPTIMEROBOT_OUTPUT', 'table');
    stubApi([{ data: [monitor()] }]);
    const { default: Verify } = await import('../src/commands/verify.js');

    await Verify.run(['--api-key', 'u123-explicit'], { root: projectRoot });
    const printed = logged.join('\n');

    expect(printed).toContain('1 monitor carries the tag agent-setup.');
    expect(printed).toContain('ID');
    expect(printed).toContain('798411');
    expect(printed).toContain('checkout-api');
    expect(printed).toContain('HTTP');
    expect(printed).toContain('https://example.com/health');
    expect(printed).toContain('2026-07-20T09:12:04.000Z');
    expect(printed).toContain('uptimerobot-report.md');
    expect(printed).toContain(QUICK_SETUP_NOTE);
  });

  it('carries the coverage boundary into machine output too', async () => {
    stubApi([{ data: [monitor()] }]);
    const { default: Verify } = await import('../src/commands/verify.js');

    const output = await Verify.run(['--api-key', 'u123-explicit', '--json'], {
      root: projectRoot,
    });

    expect(output.coverage.basis).toBe('tags');
    expect(output.coverage.note).toContain(QUICK_SETUP_NOTE);
    expect(output.coverage.note).toContain('Treat the count as a floor, not a total.');
    expect(logged).toHaveLength(1);
  });

  it('states the same boundary in help, for a reader who never runs it', async () => {
    const { default: Verify } = await import('../src/commands/verify.js');

    expect(Verify.description).toContain(QUICK_SETUP_NOTE);
    expect(Verify.description).toContain('exits 0 whether the count is zero or a hundred');
    expect(Verify.flags.tags.description).toContain('case-sensitive');
  });

  it('accepts other tags, comma-separated and trimmed', async () => {
    const { requests } = stubApi([{ data: [] }]);
    const { default: Verify } = await import('../src/commands/verify.js');

    const output = await Verify.run(
      ['--api-key', 'u123-explicit', '--tags', ' production, staging ', '--json'],
      { root: projectRoot },
    );

    expect(requests).toEqual([`${API_URL}/monitors?limit=200&tags=production%2Cstaging`]);
    expect(output.tags).toEqual(['production', 'staging']);
    expect(logged.join('\n')).toBe(JSON.stringify(output));
  });

  it('rejects a tag list that names nothing before spending a request', async () => {
    const { requests } = stubApi([{ data: [] }]);
    const { default: Verify } = await import('../src/commands/verify.js');

    await expect(
      Verify.run(['--api-key', 'u123-explicit', '--tags', ' , ', '--json'], { root: projectRoot }),
    ).rejects.toMatchObject({
      cliError: {
        code: 'INVALID_INPUT',
        expected: 'at least one tag name',
        message: '--tags must contain at least one tag name.',
        path: 'tags',
      },
      oclif: { exit: 2 },
    });
    expect(requests).toEqual([]);
  });

  it('routes a missing credential through the error envelope without calling the API', async () => {
    // Production URL, so the credential store is consulted and finds nothing.
    vi.stubEnv('UPTIMEROBOT_DEV_API_URL', undefined);
    const { requests } = stubApi([{ data: [] }]);
    const { default: Verify } = await import('../src/commands/verify.js');

    await expect(Verify.run(['--json'], { root: projectRoot })).rejects.toMatchObject({
      cliError: { code: 'AUTH_REQUIRED' },
      oclif: { exit: 2 },
    });
    expect(requests).toEqual([]);
    expect(logged).toEqual([]);
  });

  it('surfaces an API rejection with the API status, not a generic failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        async () =>
          new Response(JSON.stringify({ message: 'Invalid API key.' }), {
            headers: { 'content-type': 'application/json' },
            status: 401,
          }),
      ),
    );
    const { default: Verify } = await import('../src/commands/verify.js');

    await expect(
      Verify.run(['--api-key', 'u123-wrong', '--json'], { root: projectRoot }),
    ).rejects.toMatchObject({
      cliError: { code: 'HTTP_401', message: 'Invalid API key.', status: 401 },
      oclif: { exit: 4 },
    });
  });

  it('reports an unreachable API as a network error rather than an empty account', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        throw new Error('getaddrinfo ENOTFOUND api.test.invalid');
      }),
    );
    const { default: Verify } = await import('../src/commands/verify.js');

    await expect(
      Verify.run(['--api-key', 'u123-explicit', '--json'], { root: projectRoot }),
    ).rejects.toMatchObject({
      cliError: { code: 'NETWORK_ERROR' },
      oclif: { exit: 1 },
    });
    expect(logged).toEqual([]);
  });

  it('attributes the request as a CLI call and never sends the key elsewhere', async () => {
    let observed: Record<string, string | null> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input) => {
        const request = input instanceof Request ? input : new Request(input);
        observed = {
          authorization: request.headers.get('authorization'),
          client: request.headers.get('x-uptimerobot-client'),
          mode: request.headers.get('x-uptimerobot-invocation-mode'),
        };
        return new Response(JSON.stringify({ data: [] }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        });
      }),
    );
    const { default: Verify } = await import('../src/commands/verify.js');

    await Verify.run(['--api-key', 'u123-explicit', '--agent', '--json'], { root: projectRoot });

    expect(observed).toEqual({
      authorization: 'Bearer u123-explicit',
      client: 'cli',
      mode: 'agent',
    });
  });
});
