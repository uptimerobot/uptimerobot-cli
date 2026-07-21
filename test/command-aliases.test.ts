import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './helpers/run-cli.js';

describe('command aliases', () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
  });

  it('exposes auth whoami as an alias for auth status', async () => {
    const result = await runCli(['auth', 'whoami', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Show authentication status');
    expect(result.stdout).toContain('Canonical command: uptimerobot auth status');
  });

  it('identifies user me as the canonical command in user get help', async () => {
    const result = await runCli(['user', 'get', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Canonical command: uptimerobot user me');
  });

  it('exposes user get as an alias for user me', async () => {
    let requestUrl: string | undefined;
    const server = createServer((request, response) => {
      requestUrl = request.url;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ data: { email: 'developer@example.com' } }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(['user', 'get', '--json'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(requestUrl).toBe('/v3/user/me');
    expect(JSON.parse(result.stdout)).toEqual({ data: { email: 'developer@example.com' } });
  });
});
