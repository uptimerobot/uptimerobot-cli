import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runCli } from './helpers/run-cli.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

describe('destructive actions', () => {
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
            userAgent: 'uptimerobot-cli/0.1.0 mode/agent environment/local',
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
        const result = await runInteractiveCli(['monitors', 'delete', '42'], 'n\n', {
          UPTIMEROBOT_AGENT: '0',
          UPTIMEROBOT_API_KEY: 'u123-secret',
          UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
        });

        expect({
          prompted: result.includes('Delete a monitor. Continue? [y/N]'),
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

async function runInteractiveCli(
  args: string[],
  input: string,
  env: Record<string, string>,
): Promise<string> {
  const command = [process.execPath, 'bin/run.js', ...args];
  const executable = process.platform === 'darwin' ? '/usr/bin/expect' : 'script';
  const scriptArgs =
    process.platform === 'darwin'
      ? [
          '-c',
          `set timeout 10\nspawn -noecho ${command.map(tclQuote).join(' ')}\nexpect -re {Continue\\? \\[y/N\\]}\nsend -- "${input.replace('\n', '\\r')}"\nexpect eof`,
        ]
      : ['-q', '-e', '-c', command.map(shellQuote).join(' '), '/dev/null'];

  return new Promise((resolve, reject) => {
    const child = spawn(executable, scriptArgs, {
      cwd: projectRoot,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    let answered = false;
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      output += chunk;
      if (!answered && output.includes('[y/N]')) {
        answered = true;
        child.stdin.write(input);
      }
    });
    child.stderr.setEncoding('utf8').on('data', (chunk) => (output += chunk));
    child.once('error', reject);
    child.once('close', () => resolve(output));
  });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function tclQuote(value: string): string {
  return `{${value.replaceAll('\\', '\\\\').replaceAll('}', '\\}')}}`;
}
