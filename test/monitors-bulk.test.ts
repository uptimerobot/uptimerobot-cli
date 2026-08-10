import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import type { CliResult } from './helpers/run-cli.js';
import { runCli } from './helpers/run-cli.js';

describe('monitors bulk', () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
  });

  async function startServer(body: unknown): Promise<string> {
    const server = createServer((_request, response) => {
      response.statusCode = 201;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(body));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    return `http://127.0.0.1:${address.port}/v3`;
  }

  // The endpoints answer success per monitor on acceptance and return no
  // operation id, so the only way to know a bulk write landed is to re-read the
  // monitors. Help is where a caller finds that out.
  it('documents the missing completion signal in every bulk command help', async () => {
    const [pause, start, update] = await Promise.all([
      runCli(['monitors', 'bulk', 'pause', '--help']),
      runCli(['monitors', 'bulk', 'start', '--help']),
      runCli(['monitors', 'bulk', 'update', '--help']),
    ]);
    const documented = {
      confirmsWithGet: true,
      exitCode: 0,
      namesTheDelay: true,
      saysAccepted: true,
      saysNoCompletionSignal: true,
    };

    expect({
      pause: describesAsyncApply(pause),
      start: describesAsyncApply(start),
      update: describesAsyncApply(update),
    }).toEqual({ pause: documented, start: documented, update: documented });
  });

  it('exits 1 when every item in the bulk operation failed', async () => {
    const payload = {
      results: [{ monitorId: 1, status: 'error', error: 'nope' }],
      totalSuccess: 0,
      totalError: 1,
    };
    const apiUrl = await startServer(payload);

    const result = await runCli(['monitors', 'bulk', 'pause', '--tag-id', '42', '--json'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: apiUrl,
    });

    expect({
      exitCode: result.exitCode,
      stderr: JSON.parse(result.stderr),
      stdout: JSON.parse(result.stdout),
    }).toEqual({
      exitCode: 1,
      stderr: {
        error: {
          code: 'BULK_FAILED',
          details: [{ monitorId: 1, status: 'error', error: 'nope' }],
          message: 'The bulk operation failed for every item (1 failed, 0 succeeded).',
        },
      },
      stdout: payload,
    });
  });

  it('exits 3 when only some items in the bulk operation failed', async () => {
    const payload = {
      results: [
        { monitorId: 1, monitorName: 'checkout-api', status: 'success' },
        { monitorId: 2, monitorName: 'home', status: 'error', error: 'nope', code: '400-001' },
      ],
      totalSuccess: 1,
      totalError: 1,
    };
    const apiUrl = await startServer(payload);

    const result = await runCli(['monitors', 'bulk', 'start', '--group-id', '1', '--json'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: apiUrl,
    });

    expect({
      exitCode: result.exitCode,
      stderr: JSON.parse(result.stderr),
      stdout: JSON.parse(result.stdout),
    }).toEqual({
      exitCode: 3,
      stderr: {
        error: {
          code: 'BULK_PARTIAL_FAILURE',
          details: [
            { monitorId: 2, monitorName: 'home', status: 'error', error: 'nope', code: '400-001' },
          ],
          message: 'The bulk operation partially failed (1 failed, 1 succeeded).',
        },
      },
      stdout: payload,
    });
  });

  it('exits 0 and stays silent on stderr when every item succeeded', async () => {
    const payload = {
      results: [
        { monitorId: 1, monitorName: 'checkout-api', status: 'success' },
        { monitorId: 2, monitorName: 'home', status: 'success' },
      ],
      totalSuccess: 2,
      totalError: 0,
    };
    const apiUrl = await startServer(payload);

    const result = await runCli(['monitors', 'bulk', 'pause', '--tag-id', '42', '--json'], {
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: apiUrl,
    });

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: `${JSON.stringify(payload)}\n`,
    });
  });
});

function describesAsyncApply(result: CliResult): Record<string, boolean | number> {
  const help = result.stdout.replace(/\s+/g, ' ');
  return {
    confirmsWithGet: help.includes('`uptimerobot monitors get <id>`'),
    exitCode: result.exitCode,
    namesTheDelay: help.includes('Reports acceptance, not completion'),
    saysAccepted: help.includes(
      'answers "success" for every matched monitor as soon as the write is accepted',
    ),
    saysNoCompletionSignal: help.includes(
      'nothing in the response distinguishes queued from applied',
    ),
  };
}
