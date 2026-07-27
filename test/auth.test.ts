import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from '@oclif/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const keyring = vi.hoisted(() => new Map<string, string>());
const keyringControl = vi.hoisted(() => ({ fail: false }));

vi.mock('@napi-rs/keyring', () => ({
  AsyncEntry: class {
    readonly key: string;

    constructor(service: string, account: string) {
      this.key = `${service}:${account}`;
    }

    async deleteCredential(): Promise<boolean> {
      if (keyringControl.fail) throw new Error('keyring unavailable');
      return keyring.delete(this.key);
    }

    async getPassword(): Promise<string | undefined> {
      if (keyringControl.fail) throw new Error('keyring unavailable');
      return keyring.get(this.key);
    }

    async setPassword(password: string): Promise<void> {
      if (keyringControl.fail) throw new Error('keyring unavailable');
      keyring.set(this.key, password);
    }
  },
}));

vi.mock('../src/lib/invocation.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/invocation.js')>();
  return { ...original, promptSecret: vi.fn() };
});

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

describe('authentication', () => {
  let configDirectory: string;

  beforeEach(async () => {
    configDirectory = await mkdtemp(join(tmpdir(), 'uptimerobot-cli-test-'));
    vi.stubEnv('UPTIMEROBOT_CONFIG_DIR', configDirectory);
    vi.stubEnv('UPTIMEROBOT_API_KEY', undefined);
    vi.stubEnv('UPTIMEROBOT_AGENT', '0');
    const { promptSecret } = await import('../src/lib/invocation.js');
    vi.mocked(promptSecret).mockReset();
  });

  afterEach(async () => {
    keyring.clear();
    keyringControl.fail = false;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await rm(configDirectory, { force: true, recursive: true });
  });

  it('validates an explicitly provided API key before saving it', async () => {
    let headers: Headers | undefined;
    let signal: AbortSignal | null | undefined;
    const request = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      headers = new Headers(init?.headers);
      signal = init?.signal;
      expect(String(input)).toBe('https://api.uptimerobot.com/v3/user/me');
      return new Response(JSON.stringify({ data: { email: 'developer@example.com' } }), {
        status: 200,
      });
    });
    vi.stubGlobal('fetch', request);
    const { default: Login } = await import('../src/commands/auth/login.js');

    await Login.run(['--api-key', 'u123-secret'], { root: projectRoot });

    expect(headers?.get('authorization')).toBe('Bearer u123-secret');
    expect(headers?.get('x-uptimerobot-client')).toBe('cli');
    expect(headers?.get('user-agent')).toMatch(/^uptimerobot-cli\/.+ mode\/human environment\/.+$/);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(keyring.get('com.uptimerobot.cli:default:api-key')).toBe('u123-secret');
  });

  it('does not accept an API URL override for persistent login', async () => {
    const request = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', request);
    const { default: Login } = await import('../src/commands/auth/login.js');

    await expect(
      Login.run(['--api-key', 'u123-secret', '--api-url', 'https://example.com/v3'], {
        root: projectRoot,
      }),
    ).rejects.toBeDefined();
    expect(request).not.toHaveBeenCalled();
    expect(keyring.size).toBe(0);
  });

  it('does not save an API key rejected by UptimeRobot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    );
    const { default: Login } = await import('../src/commands/auth/login.js');

    await expect(Login.run(['--api-key', 'invalid'], { root: projectRoot })).rejects.toMatchObject({
      oclif: { exit: 4 },
    });
    expect(keyring.size).toBe(0);
  });

  it('uses the stored API key for API commands when no override is provided', async () => {
    keyring.set('com.uptimerobot.cli:default:api-key', 'u123-stored');
    const request = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const outgoing = input instanceof Request ? input : new Request(input, init);
      expect(outgoing.headers.get('authorization')).toBe('Bearer u123-stored');
      return new Response(JSON.stringify({ data: [] }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    });
    vi.stubGlobal('fetch', request);

    const { default: MonitorsList } = await import('../src/commands/monitors/list.js');
    await (MonitorsList as Command.Class).run(['--json'], { root: projectRoot });

    expect(request).toHaveBeenCalledOnce();
  });

  it('removes the stored API key on logout', async () => {
    keyring.set('com.uptimerobot.cli:default:api-key', 'u123-stored');

    const { default: Logout } = await import('../src/commands/auth/logout.js');
    await Logout.run(['--json'], { root: projectRoot });

    expect(keyring.has('com.uptimerobot.cli:default:api-key')).toBe(false);
  });

  it('reports stored authentication without exposing the API key', async () => {
    keyring.set('com.uptimerobot.cli:default:api-key', 'u123-never-print-this');

    const { default: Status } = await import('../src/commands/auth/status.js');
    const status = await Status.run(['--json'], { root: projectRoot });

    expect(status).toEqual({ authenticated: true, source: 'keyring', type: 'api-key' });
    expect(JSON.stringify(status)).not.toContain('u123-never-print-this');
  });

  it('falls back to a 0600 plaintext config file when the keyring is unavailable', async () => {
    keyringControl.fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
    const { default: Login } = await import('../src/commands/auth/login.js');

    await Login.run(['--api-key', 'u123-file-secret'], { root: projectRoot });

    const credentialsPath = join(configDirectory, 'credentials.json');
    const stored = JSON.parse(await readFile(credentialsPath, 'utf8')) as { apiKey?: string };
    expect(stored.apiKey).toBe('u123-file-secret');
    expect(keyring.size).toBe(0);
    if (process.platform !== 'win32') {
      const mode = (await stat(credentialsPath)).mode & 0o777;
      expect(mode.toString(8)).toBe('600');
    }
  });

  it('authenticates API commands with a key stored only in the config file', async () => {
    keyringControl.fail = true;
    await writeFile(
      join(configDirectory, 'credentials.json'),
      JSON.stringify({ apiKey: 'u123-from-file' }),
    );
    const request = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const outgoing = input instanceof Request ? input : new Request(input, init);
      expect(outgoing.headers.get('authorization')).toBe('Bearer u123-from-file');
      return new Response(JSON.stringify({ data: [] }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    });
    vi.stubGlobal('fetch', request);

    const { default: MonitorsList } = await import('../src/commands/monitors/list.js');
    await (MonitorsList as Command.Class).run(['--json'], { root: projectRoot });

    expect(request).toHaveBeenCalledOnce();
  });

  it('reports the config file as the credential source in auth status', async () => {
    keyringControl.fail = true;
    await writeFile(
      join(configDirectory, 'credentials.json'),
      JSON.stringify({ apiKey: 'u123-from-file' }),
    );

    const { default: Status } = await import('../src/commands/auth/status.js');
    const status = await Status.run(['--json'], { root: projectRoot });

    expect(status).toEqual({ authenticated: true, source: 'file', type: 'api-key' });
    expect(JSON.stringify(status)).not.toContain('u123-from-file');
  });

  it('removes a file-stored API key on logout', async () => {
    keyringControl.fail = true;
    const credentialsPath = join(configDirectory, 'credentials.json');
    await writeFile(credentialsPath, JSON.stringify({ apiKey: 'u123-from-file' }));

    const { default: Logout } = await import('../src/commands/auth/logout.js');
    await Logout.run(['--json'], { root: projectRoot });

    await expect(stat(credentialsPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('emits JSON for auth status when stdout is piped, even without --json', async () => {
    keyring.set('com.uptimerobot.cli:default:api-key', 'u123-secret');
    const log = vi.spyOn(Command.prototype, 'log').mockImplementation(() => {});

    const { default: Status } = await import('../src/commands/auth/status.js');
    await Status.run([], { root: projectRoot });

    expect(log).toHaveBeenCalledWith(
      JSON.stringify({ authenticated: true, source: 'keyring', type: 'api-key' }),
    );
  });

  it('prompts for the API key in an interactive terminal when none is provided', async () => {
    const { promptSecret } = await import('../src/lib/invocation.js');
    vi.mocked(promptSecret).mockResolvedValue('u123-typed');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
    const { default: Login } = await import('../src/commands/auth/login.js');

    await Login.run([], { root: projectRoot });

    expect(vi.mocked(promptSecret)).toHaveBeenCalledOnce();
    expect(keyring.get('com.uptimerobot.cli:default:api-key')).toBe('u123-typed');
  });

  it('tells the user where to create an API key before prompting for one', async () => {
    const { promptSecret } = await import('../src/lib/invocation.js');
    vi.mocked(promptSecret).mockResolvedValue('u123-typed');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
    const { default: Login } = await import('../src/commands/auth/login.js');

    await Login.run([], { root: projectRoot });

    expect(vi.mocked(promptSecret)).toHaveBeenCalledWith(
      expect.stringContaining('https://dashboard.uptimerobot.com/integrations'),
    );
  });

  it('fails clearly when no API key can be resolved', async () => {
    const request = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', request);
    const { default: Login } = await import('../src/commands/auth/login.js');

    await expect(Login.run([], { root: projectRoot })).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      oclif: { exit: 2 },
    });
    expect(request).not.toHaveBeenCalled();
    expect(keyring.size).toBe(0);
  });

  it('never prompts for an API key in agent mode', async () => {
    vi.stubEnv('UPTIMEROBOT_AGENT', '1');
    const { promptSecret } = await import('../src/lib/invocation.js');
    const { default: Login } = await import('../src/commands/auth/login.js');

    await expect(Login.run([], { root: projectRoot })).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      oclif: { exit: 2 },
    });
    expect(vi.mocked(promptSecret)).not.toHaveBeenCalled();
  });
});
