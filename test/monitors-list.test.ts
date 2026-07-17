import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './helpers/run-cli.js';

const ESC = String.fromCharCode(27);

describe('monitors list', () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
  });

  it('attributes CI independently from human or agent mode', async () => {
    let observedRequest: Record<string, unknown> = {};
    const server = createServer((request, response) => {
      observedRequest = {
        environment: request.headers['x-uptimerobot-execution-environment'],
        mode: request.headers['x-uptimerobot-invocation-mode'],
        userAgent: request.headers['user-agent'],
      };
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ data: [] }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(['monitors', 'list', '--json'], {
      CI: 'true',
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
    });

    expect({ observedRequest, result }).toEqual({
      observedRequest: {
        environment: 'ci',
        mode: 'human',
        userAgent: 'uptimerobot-cli/0.1.0 mode/human environment/ci',
      },
      result: {
        exitCode: 0,
        stderr: '',
        stdout: '{"items":[],"nextCursor":null}\n',
      },
    });
  });

  it('queries monitors with API-key auth and emits structured JSON', async () => {
    let observedRequest: { authorization?: string; client?: string; mode?: string; url?: string } =
      {};
    const server = createServer((request, response) => {
      observedRequest = {
        authorization: request.headers.authorization,
        client: request.headers['x-uptimerobot-client'] as string | undefined,
        mode: request.headers['x-uptimerobot-invocation-mode'] as string | undefined,
        url: request.url,
      };
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          data: [{ id: 42, friendlyName: 'checkout-api', status: 'DOWN' }],
          nextLink: 'https://api.uptimerobot.com/v3/monitors?cursor=84',
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(
      [
        'monitors',
        'list',
        '--custom-field',
        'environment:production',
        '--custom-field',
        'region:eu',
        '--status',
        'down',
        '--limit',
        '50',
        '--json',
      ],
      {
        UPTIMEROBOT_AGENT: '0',
        UPTIMEROBOT_API_KEY: 'u123-secret',
        UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
      },
    );

    expect({
      exitCode: result.exitCode,
      output: JSON.parse(result.stdout),
      request: observedRequest,
      stderr: result.stderr,
    }).toEqual({
      exitCode: 0,
      output: {
        items: [{ id: 42, friendlyName: 'checkout-api', status: 'DOWN' }],
        nextCursor: '84',
      },
      request: {
        authorization: 'Bearer u123-secret',
        client: 'cli',
        mode: 'human',
        url: '/v3/monitors?customField=environment%3Aproduction&customField=region%3Aeu&limit=50&status=down',
      },
      stderr: '',
    });
  });

  it('renders an aligned status table for a human', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          data: [
            {
              id: 42,
              friendlyName: 'checkout-api',
              type: 'HTTP',
              status: 'DOWN',
              interval: 60,
              url: 'https://checkout.example.com',
            },
            {
              id: 7,
              friendlyName: 'home',
              type: 'HTTP',
              status: 'UP',
              interval: 300,
              url: 'https://example.com',
            },
          ],
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(['monitors', 'list', '--format', 'table'], {
      FORCE_COLOR: undefined,
      NO_COLOR: undefined,
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
    });

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout:
        'ID  FRIENDLY NAME  TYPE  STATUS  INTERVAL  URL\n' +
        '42  checkout-api   HTTP  ✗ DOWN  60        https://checkout.example.com\n' +
        '7   home           HTTP  ● UP    300       https://example.com\n',
    });
  });

  it('colors glyphed status cells and bold headings when FORCE_COLOR is set', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          data: [
            {
              id: 42,
              friendlyName: 'checkout-api',
              type: 'HTTP',
              status: 'DOWN',
              interval: 60,
              url: 'https://checkout.example.com',
            },
            {
              id: 7,
              friendlyName: 'home',
              type: 'HTTP',
              status: 'UP',
              interval: 300,
              url: 'https://example.com',
            },
          ],
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(['monitors', 'list', '--format', 'table'], {
      FORCE_COLOR: '1',
      NO_COLOR: undefined,
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(`${ESC}[1mID${ESC}[0m`);
    expect(result.stdout).toContain(`${ESC}[31m✗ DOWN${ESC}[0m`);
    expect(result.stdout).toContain(`${ESC}[32m● UP${ESC}[0m`);
    expect(result.stdout.replaceAll(new RegExp(`${ESC}\\[\\d+m`, 'g'), '')).toBe(
      'ID  FRIENDLY NAME  TYPE  STATUS  INTERVAL  URL\n' +
        '42  checkout-api   HTTP  ✗ DOWN  60        https://checkout.example.com\n' +
        '7   home           HTTP  ● UP    300       https://example.com\n',
    );
  });

  it('keeps glyphs but emits no escape codes when NO_COLOR is set', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          data: [
            {
              id: 42,
              friendlyName: 'checkout-api',
              type: 'HTTP',
              status: 'DOWN',
              interval: 60,
              url: 'https://checkout.example.com',
            },
          ],
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(['monitors', 'list', '--format', 'table'], {
      // Node itself warns on stderr when NO_COLOR and FORCE_COLOR are both set,
      // so the spec-precedence combination is asserted in output.test.ts instead.
      FORCE_COLOR: undefined,
      NO_COLOR: '1',
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
    });

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout:
        'ID  FRIENDLY NAME  TYPE  STATUS  INTERVAL  URL\n' +
        '42  checkout-api   HTTP  ✗ DOWN  60        https://checkout.example.com\n',
    });
  });

  it('automatically emits JSON when stdout is piped', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ data: [{ id: 42, status: 'DOWN' }] }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(['monitors', 'list'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
    });

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '{"items":[{"id":42,"status":"DOWN"}],"nextCursor":null}\n',
    });
  });

  it('rejects a non-numeric page size before making a request', async () => {
    const result = await runCli(['monitors', 'list', '--limit', 'many', '--json'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: 'http://127.0.0.1:9/v3',
    });

    expect({
      ...result,
      stderr: JSON.parse(result.stderr),
    }).toEqual({
      exitCode: 2,
      stderr: {
        error: {
          code: 'INVALID_INPUT',
          message: expect.stringContaining('limit'),
        },
      },
      stdout: '',
    });
  });

  it('returns the original API envelope in raw mode', async () => {
    const envelope = {
      data: [{ id: 42, status: 'DOWN' }],
      nextLink: 'https://api.uptimerobot.com/v3/monitors?cursor=84',
    };
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(envelope));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(['monitors', 'list', '--raw'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
    });

    expect({ ...result, stdout: JSON.parse(result.stdout) }).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: envelope,
    });
  });

  it('emits one monitor per line in JSONL mode', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          data: [
            { id: 42, status: 'DOWN' },
            { id: 7, status: 'UP' },
          ],
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(['monitors', 'list', '--format', 'jsonl'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
    });

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '{"id":42,"status":"DOWN"}\n{"id":7,"status":"UP"}\n',
    });
  });

  it('emits headerless tab-separated rows in plain mode', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          data: [{ id: 42, friendlyName: 'checkout-api', status: 'DOWN', interval: 60 }],
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

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '42\tcheckout-api\tDOWN\t60\n',
    });
  });

  it('rejects raw output with a non-JSON format before making a request', async () => {
    const result = await runCli(['monitors', 'list', '--raw', '--format', 'table'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: 'http://127.0.0.1:9/v3',
    });

    expect({ ...result, stderr: JSON.parse(result.stderr) }).toEqual({
      exitCode: 2,
      stderr: {
        error: {
          code: 'INVALID_INPUT',
          message: '--raw can only be used with JSON output.',
        },
      },
      stdout: '',
    });
  });

  it('rejects the JSON shorthand when an explicit format is also supplied', async () => {
    const result = await runCli(['monitors', 'list', '--json', '--format', 'table'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: 'http://127.0.0.1:9/v3',
    });

    expect({ ...result, stderr: JSON.parse(result.stderr) }).toEqual({
      exitCode: 2,
      stderr: {
        error: {
          code: 'INVALID_INPUT',
          message: '--json cannot be combined with --format.',
        },
      },
      stdout: '',
    });
  });

  it('retries a transient failure through the shared API client', async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      response.setHeader('content-type', 'application/json');
      if (requests === 1) {
        response.statusCode = 503;
        response.end(JSON.stringify({ message: 'Temporarily unavailable' }));
        return;
      }
      response.end(JSON.stringify({ data: [{ id: 42, status: 'UP' }] }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(['monitors', 'list', '--json'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
    });

    expect({ ...result, requests, stdout: JSON.parse(result.stdout) }).toEqual({
      exitCode: 0,
      requests: 2,
      stderr: '',
      stdout: { items: [{ id: 42, status: 'UP' }], nextCursor: null },
    });
  });

  it('does not retry before a long Retry-After delay', async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      response.statusCode = 429;
      response.setHeader('content-type', 'application/json');
      response.setHeader('retry-after', '60');
      response.end(JSON.stringify({ code: 'RATE_LIMITED', message: 'Try again later.' }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const result = await runCli(['monitors', 'list', '--json'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
    });

    expect({ ...result, requests, stderr: JSON.parse(result.stderr) }).toEqual({
      exitCode: 7,
      requests: 1,
      stderr: {
        error: {
          code: 'RATE_LIMITED',
          message: 'Try again later.',
          status: 429,
        },
      },
      stdout: '',
    });
  });
});
