import { fileURLToPath } from 'node:url';
import type { Command } from '@oclif/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

const keyring = vi.hoisted(() => new Map<string, string>());

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

describe('authentication', () => {
  afterEach(() => {
    keyring.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('validates an explicitly provided API key before saving it', async () => {
    let authorization: string | undefined;
    const request = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get('authorization') ?? undefined;
      expect(String(input)).toBe('https://api.uptimerobot.com/v3/user/me');
      return new Response(JSON.stringify({ data: { email: 'developer@example.com' } }), {
        status: 200,
      });
    });
    vi.stubGlobal('fetch', request);
    const { default: Login } = await import('../src/commands/auth/login.js');

    await Login.run(['--api-key', 'u123-secret'], { root: projectRoot });

    expect({ authorization, saved: keyring.get('com.uptimerobot.cli:default:api-key') }).toEqual({
      authorization: 'Bearer u123-secret',
      saved: 'u123-secret',
    });
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
});
