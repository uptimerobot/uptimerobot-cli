import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { exitCodeFor, normalizeApiError } from '../src/api/errors.js';
import { runCli } from './helpers/run-cli.js';

describe('API errors', () => {
  it('uses a raw API error body as the message', () => {
    expect(normalizeApiError(401, 'Token is required')).toEqual({
      code: 'HTTP_401',
      message: 'Token is required',
      status: 401,
    });
  });

  // The upstream code is optional per endpoint and documented nowhere, so it
  // cannot decide `code` without making the vocabulary depend on which endpoint
  // answered. Same status in, same code out; the raw value rides along.
  it('derives the same code from the status whether or not the API sent one', () => {
    const supplied = normalizeApiError(404, { code: '000-004', message: 'Monitor not found' });
    const omitted = normalizeApiError(404, { message: 'Monitor not found' });

    expect(supplied).toEqual({
      apiCode: '000-004',
      code: 'HTTP_404',
      message: 'Monitor not found',
      status: 404,
    });
    expect(omitted).toEqual({
      code: 'HTTP_404',
      message: 'Monitor not found',
      status: 404,
    });
    expect(supplied.code).toBe(omitted.code);
    expect(omitted.apiCode).toBeUndefined();
  });

  it('maps every status the CLI gives a dedicated exit code', () => {
    expect({
      badRequest: exitCodeFor(400),
      conflict: exitCodeFor(409),
      forbidden: exitCodeFor(403),
      notFound: exitCodeFor(404),
      rateLimited: exitCodeFor(429),
      serverError: exitCodeFor(500),
      unauthenticated: exitCodeFor(401),
      unprocessable: exitCodeFor(422),
    }).toEqual({
      badRequest: 2,
      conflict: 8,
      forbidden: 5,
      notFound: 6,
      rateLimited: 7,
      serverError: 1,
      unauthenticated: 4,
      unprocessable: 2,
    });
  });
});

// A request the server rejected is the same class of failure as one the CLI
// rejects before sending, so it exits 2 rather than the generic 1 a caller
// cannot distinguish from a transient fault worth retrying.
describe('rejected request exit codes', () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
  });

  async function startServer(status: number, body: unknown): Promise<string> {
    const server = createServer((_request, response) => {
      response.statusCode = status;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(body));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    return `http://127.0.0.1:${address.port}/v3`;
  }

  async function createMonitor(apiUrl: string): Promise<Awaited<ReturnType<typeof runCli>>> {
    return runCli(
      [
        'monitors',
        'create',
        'http',
        '--name',
        'checkout-api',
        '--url',
        'notaurl',
        '--interval',
        '60',
        '--timeout',
        '30',
        '--json',
      ],
      {
        UPTIMEROBOT_AGENT: '0',
        UPTIMEROBOT_API_KEY: 'u123-secret',
        UPTIMEROBOT_DEV_API_URL: apiUrl,
      },
    );
  }

  it('exits 2 when the server rejects the request as invalid', async () => {
    const apiUrl = await startServer(400, { message: 'url must be a URL address' });

    const result = await createMonitor(apiUrl);

    expect({ ...result, stderr: JSON.parse(result.stderr) }).toEqual({
      exitCode: 2,
      stderr: {
        error: {
          code: 'HTTP_400',
          message: 'url must be a URL address',
          status: 400,
        },
      },
      stdout: '',
    });
  });

  it('exits 2 when the server rejects the request as unprocessable', async () => {
    const apiUrl = await startServer(422, { message: 'interval is not available on this plan' });

    const result = await createMonitor(apiUrl);

    expect({ ...result, stderr: JSON.parse(result.stderr) }).toEqual({
      exitCode: 2,
      stderr: {
        error: {
          code: 'HTTP_422',
          message: 'interval is not available on this plan',
          status: 422,
        },
      },
      stdout: '',
    });
  });

  it('exits 8 when the request conflicts with the current server state', async () => {
    const apiUrl = await startServer(409, { message: 'A monitor with this URL already exists.' });

    const result = await createMonitor(apiUrl);

    expect({ ...result, stderr: JSON.parse(result.stderr) }).toEqual({
      exitCode: 8,
      stderr: {
        error: {
          code: 'HTTP_409',
          message: 'A monitor with this URL already exists.',
          status: 409,
        },
      },
      stdout: '',
    });
  });

  it('keeps the generic exit code for a failure that retrying may clear', async () => {
    const apiUrl = await startServer(503, { message: 'Temporarily unavailable.' });

    const result = await createMonitor(apiUrl);

    expect({ ...result, stderr: JSON.parse(result.stderr) }).toEqual({
      exitCode: 1,
      stderr: {
        error: {
          code: 'HTTP_503',
          message: 'Temporarily unavailable.',
          status: 503,
        },
      },
      stdout: '',
    });
  });
});
