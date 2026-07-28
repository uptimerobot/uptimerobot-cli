import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { runInteractiveCli } from './helpers/run-interactive-cli.js';
import { cliEnvironment, cliVersion, runCli } from './helpers/run-cli.js';

describe('destructive actions', () => {
  it('compiles a destructive JSON request with --dry-run without confirmation or authentication', async () => {
    const result = await runCli(['monitors', 'reset', '42', '--dry-run', '--json'], {
      UPTIMEROBOT_API_KEY: undefined,
      UPTIMEROBOT_DEV_API_URL: 'http://127.0.0.1:9/v3',
    });

    expect({ ...result, stdout: JSON.parse(result.stdout) }).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: {
        body: {},
        command: 'monitors reset',
        contentType: 'application/json',
        dryRun: true,
        method: 'POST',
        path: '/v3/monitors/42/reset',
      },
    });
  });

  it('refuses an agent-issued delete until explicit confirmation is supplied', async () => {
    const result = await runCli(['monitors', 'delete', '42', '--json'], {
      UPTIMEROBOT_AGENT: '1',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: 'http://127.0.0.1:9/v3',
    });

    expect({
      exitCode: result.exitCode,
      output: JSON.parse(result.stderr),
      stdout: result.stdout,
    }).toEqual({
      exitCode: 2,
      output: {
        error: {
          code: 'CONFIRMATION_REQUIRED',
          command: 'monitors delete',
          message: 'Explicit confirmation is required. Re-run with --confirm.',
        },
      },
      stdout: '',
    });
  });

  it('allows an explicitly confirmed agent delete and attributes it as agent-driven', async () => {
    let requestMetadata: Record<string, unknown> = {};
    const server = createServer((request, response) => {
      requestMetadata = {
        client: request.headers['x-uptimerobot-client'],
        method: request.method,
        mode: request.headers['x-uptimerobot-invocation-mode'],
        url: request.url,
        userAgent: request.headers['user-agent'],
      };
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ data: { deleted: true } }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    try {
      const result = await runCli(['monitors', 'delete', '42', '--confirm'], {
        UPTIMEROBOT_AGENT: '1',
        UPTIMEROBOT_API_KEY: 'u123-secret',
        UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
      });

      expect({ requestMetadata, result: { ...result, stdout: JSON.parse(result.stdout) } }).toEqual(
        {
          requestMetadata: {
            client: 'cli',
            method: 'DELETE',
            mode: 'agent',
            url: '/v3/monitors/42',
            userAgent: `uptimerobot-cli/${cliVersion} mode/agent environment/${cliEnvironment}`,
          },
          result: {
            exitCode: 0,
            stderr: '',
            stdout: { data: { deleted: true } },
          },
        },
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it.runIf(process.platform === 'darwin' || process.platform === 'linux')(
    'prompts a human and makes no delete request when confirmation is declined',
    async () => {
      let requestCount = 0;
      const server = createServer((_request, response) => {
        requestCount += 1;
        response.end('{}');
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Test server did not bind');

      try {
        const result = await runInteractiveCli(
          ['monitors', 'delete', '42'],
          [{ input: 'n\n', waitFor: 'Continue? [y/N] ' }],
          {
            UPTIMEROBOT_AGENT: '0',
            UPTIMEROBOT_API_KEY: 'u123-secret',
            UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
          },
        );

        expect({
          prompted: result.output.includes('Delete a monitor. Continue? [y/N]'),
          requestCount,
        }).toEqual({
          prompted: true,
          requestCount: 0,
        });
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  );
});
