import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './helpers/run-cli.js';

describe('API operations', () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
  });

  it('only exposes column-selection flags on collection commands', async () => {
    const collectionHelp = await runCli(['monitors', 'list', '--help']);
    const detailHelp = await runCli(['monitors', 'get', '--help']);
    const mutationHelp = await runCli(['monitors', 'create', '--help']);
    const normalizedCollectionHelp = collectionHelp.stdout.replace(/\s+/g, ' ');

    expect(collectionHelp.exitCode).toBe(0);
    expect(collectionHelp.stdout).toContain('--columns=<a,b.c>');
    expect(collectionHelp.stdout).toContain('--all');
    expect(normalizedCollectionHelp).toContain('may expose sensitive API fields');
    expect(detailHelp.exitCode).toBe(0);
    expect(detailHelp.stdout).not.toContain('--columns');
    expect(detailHelp.stdout).not.toContain('--all');
    expect(detailHelp.stdout.replace(/\s+/g, ' ')).toContain('$ uptimerobot monitors get 123');
    expect(mutationHelp.exitCode).toBe(0);
    expect(mutationHelp.stdout).not.toContain('--columns');
    expect(mutationHelp.stdout).not.toContain('--all');
  });

  it('rejects column-selection flags on detail commands', async () => {
    const result = await runCli(['monitors', 'get', '42', '--columns', 'id']);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Nonexistent flag: --columns');
    expect(result.stdout).toBe('');
  });

  it('does not accept a custom API URL as a command-line flag', async () => {
    const result = await runCli([
      'user',
      'me',
      '--api-url',
      'http://127.0.0.1:1/v3',
      '--api-key',
      'u123-secret',
      '--json',
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Nonexistent flag: --api-url');
    expect(result.stdout).toBe('');
  });

  it('uses the development API URL exactly as provided', async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ data: { email: 'developer@example.com' } }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(['user', 'me', '--json'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}`,
    });

    expect({ ...result, requests, stdout: JSON.parse(result.stdout) }).toEqual({
      exitCode: 0,
      requests: 1,
      stderr: '',
      stdout: { data: { email: 'developer@example.com' } },
    });
  });

  it('normalizes paginated collections without losing opaque cursor precision', async () => {
    const requestedCursor = '319849971381467001';
    const cursor = '319849971381467712';
    let requestUrl: string | undefined;
    const server = createServer((request, response) => {
      requestUrl = request.url;
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          data: [{ id: '319849971381467713', status: 'ONGOING' }],
          nextLink: `https://api.uptimerobot.com/v3/incidents?cursor=${cursor}`,
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(['incidents', 'list', '--cursor', requestedCursor, '--json'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
    });

    expect({ ...result, requestUrl, stdout: JSON.parse(result.stdout) }).toEqual({
      exitCode: 0,
      requestUrl: `/v3/incidents?cursor=${requestedCursor}`,
      stderr: '',
      stdout: {
        items: [{ id: '319849971381467713', status: 'ONGOING' }],
        nextCursor: cursor,
      },
    });
  });

  it('shows a continuation notice for human collection output', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          data: [{ id: 42, friendlyName: 'Checkout', status: 'UP' }],
          nextLink: 'https://api.uptimerobot.com/v3/monitors?cursor=next-page',
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(['monitors', 'list', '--format', 'plain'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Checkout');
    expect(result.stderr).toBe('More results are available. Next cursor: next-page\n');
  });

  it('normalizes pagination responses that expose the cursor directly', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ data: [{ id: 1, name: 'production' }], nextCursorId: 42 }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(['tags', 'list', '--json'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
    });

    expect({ ...result, stdout: JSON.parse(result.stdout) }).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: { items: [{ id: 1, name: 'production' }], nextCursor: '42' },
    });
  });

  it('normalizes collection responses represented by a root array', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify([{ id: 7, friendlyName: 'on-call' }]));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(['user', 'alert-contacts', '--json'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
    });

    expect({ ...result, stdout: JSON.parse(result.stdout) }).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: { items: [{ id: 7, friendlyName: 'on-call' }], nextCursor: null },
    });
  });

  it('creates a monitor from shell-friendly body assignments', async () => {
    let observedRequest: Record<string, unknown> = {};
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      observedRequest = {
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        contentType: request.headers['content-type'],
        method: request.method,
        mode: request.headers['x-uptimerobot-invocation-mode'],
        url: request.url,
        userAgent: request.headers['user-agent'],
      };
      response.statusCode = 201;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ data: { id: 99, friendlyName: 'checkout-api' } }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(
      [
        'monitors',
        'create',
        'http',
        '--set',
        'friendlyName=checkout-api',
        '--set',
        'url=https://checkout.example.com',
        '--set',
        'interval=60',
        '--set',
        'timeout=30',
        '--json',
      ],
      {
        UPTIMEROBOT_AGENT: '0',
        UPTIMEROBOT_API_KEY: 'u123-secret',
        UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
      },
    );

    expect({ observedRequest, result: { ...result, stdout: JSON.parse(result.stdout) } }).toEqual({
      observedRequest: {
        body: {
          friendlyName: 'checkout-api',
          interval: 60,
          timeout: 30,
          type: 'HTTP',
          url: 'https://checkout.example.com',
        },
        contentType: 'application/json',
        method: 'POST',
        mode: 'human',
        url: '/v3/monitors',
        userAgent: 'uptimerobot-cli/0.1.0 mode/human environment/local',
      },
      result: {
        exitCode: 0,
        stderr: '',
        stdout: { data: { friendlyName: 'checkout-api', id: 99 } },
      },
    });
  });

  it('preserves the API error code and HTTP status in structured output', async () => {
    const server = createServer((_request, response) => {
      response.statusCode = 401;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ code: '003-005', message: 'Invalid token.' }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(['monitors', 'list', '--json'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'invalid',
      UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
    });

    expect({ ...result, stderr: JSON.parse(result.stderr) }).toEqual({
      exitCode: 4,
      stderr: {
        error: {
          code: '003-005',
          message: 'Invalid token.',
          status: 401,
        },
      },
      stdout: '',
    });
  });

  it('retries a transient failure for every safe read command', async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      response.setHeader('content-type', 'application/json');
      if (requests === 1) {
        response.statusCode = 500;
        response.end(JSON.stringify({ message: 'Temporarily unavailable.' }));
        return;
      }
      response.end(JSON.stringify({ data: { email: 'developer@example.com' } }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(['user', 'me', '--json'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
    });

    expect({ ...result, requests, stdout: JSON.parse(result.stdout) }).toEqual({
      exitCode: 0,
      requests: 2,
      stderr: '',
      stdout: { data: { email: 'developer@example.com' } },
    });
  });

  it('sends JSON content type for a bodyless API write', async () => {
    let observedRequest: Record<string, unknown> = {};
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      observedRequest = {
        body: Buffer.concat(chunks).toString('utf8'),
        contentType: request.headers['content-type'],
        method: request.method,
        url: request.url,
      };
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ data: { status: 'PAUSED' } }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(['monitors', 'pause', '42', '--json'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
    });

    expect({ observedRequest, result: { ...result, stdout: JSON.parse(result.stdout) } }).toEqual({
      observedRequest: {
        body: '{}',
        contentType: 'application/json',
        method: 'POST',
        url: '/v3/monitors/42/pause',
      },
      result: {
        exitCode: 0,
        stderr: '',
        stdout: { data: { status: 'PAUSED' } },
      },
    });
  });
});
