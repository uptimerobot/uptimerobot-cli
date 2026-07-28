import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './helpers/run-cli.js';

const SECRET = 'supersecret';

describe('response redaction', () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
  });

  async function serve(payload: unknown, statusCode = 200): Promise<string> {
    const server = createServer((request, response) => {
      request.resume();
      response.statusCode = statusCode;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(payload));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    return `http://127.0.0.1:${address.port}/v3`;
  }

  function environment(apiUrl: string): Record<string, string | undefined> {
    return {
      FORCE_COLOR: undefined,
      NO_COLOR: '1',
      UPTIMEROBOT_AGENT: '0',
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: apiUrl,
    };
  }

  it('redacts credential fields from JSON output and reports them on stderr', async () => {
    const apiUrl = await serve({
      data: [{ id: 1, friendlyName: 'checkout-api', httpPassword: SECRET }],
    });

    const result = await runCli(['monitors', 'list', '--json'], environment(apiUrl));

    expect(result.stdout).not.toContain(SECRET);
    expect(result).toEqual({
      exitCode: 0,
      stderr:
        'Redacted credential-like response fields: items[0].httpPassword. ' +
        'Re-run with --reveal-secrets to show them.\n',
      stdout:
        '{"items":[{"id":1,"friendlyName":"checkout-api","httpPassword":"[REDACTED]"}],"nextCursor":null}\n',
    });
  });

  it('redacts credential fields from table output', async () => {
    const apiUrl = await serve({
      data: [{ id: 1, friendlyName: 'checkout-api', httpPassword: SECRET }],
    });

    const result = await runCli(
      ['monitors', 'list', '--format', 'table', '--all'],
      environment(apiUrl),
    );

    expect(result.stdout).not.toContain(SECRET);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[REDACTED]');
    expect(result.stderr).toContain('--reveal-secrets');
  });

  it('redacts credential fields selected through a --columns path in plain output', async () => {
    const apiUrl = await serve({
      data: [{ id: 1, friendlyName: 'checkout-api', httpPassword: SECRET }],
    });

    const result = await runCli(
      ['monitors', 'list', '--format', 'plain', '--columns', 'id,httpPassword'],
      environment(apiUrl),
    );

    expect(result.stdout).not.toContain(SECRET);
    expect({ exitCode: result.exitCode, stdout: result.stdout }).toEqual({
      exitCode: 0,
      stdout: '1\t[REDACTED]\n',
    });
  });

  it('redacts credential fields on every JSONL line', async () => {
    const apiUrl = await serve({
      data: [
        { id: 1, friendlyName: 'checkout-api', httpPassword: SECRET },
        { id: 2, friendlyName: 'status-page', apiToken: 'second-secret' },
      ],
    });

    const redacted = await runCli(['monitors', 'list', '--format', 'jsonl'], environment(apiUrl));
    const revealed = await runCli(
      ['monitors', 'list', '--format', 'jsonl', '--reveal-secrets'],
      environment(apiUrl),
    );

    expect(redacted.stdout).not.toContain(SECRET);
    expect(redacted.stdout).not.toContain('second-secret');
    expect(redacted).toEqual({
      exitCode: 0,
      stderr:
        'Redacted credential-like response fields: items[0].httpPassword, items[1].apiToken. ' +
        'Re-run with --reveal-secrets to show them.\n',
      stdout:
        '{"id":1,"friendlyName":"checkout-api","httpPassword":"[REDACTED]"}\n' +
        '{"id":2,"friendlyName":"status-page","apiToken":"[REDACTED]"}\n',
    });
    // Proves the redacted assertion above is not vacuous: the fields really do
    // reach JSONL output, one resource per line.
    expect(revealed).toEqual({
      exitCode: 0,
      stderr: '',
      stdout:
        '{"id":1,"friendlyName":"checkout-api","httpPassword":"supersecret"}\n' +
        '{"id":2,"friendlyName":"status-page","apiToken":"second-secret"}\n',
    });
  });

  it('redacts a single resource fetched by ID', async () => {
    const monitor = {
      id: 7,
      friendlyName: 'checkout-api',
      httpUsername: 'admin',
      httpPassword: SECRET,
    };
    const apiUrl = await serve(monitor);

    const redacted = await runCli(['monitors', 'get', '7', '--json'], environment(apiUrl));
    const revealed = await runCli(
      ['monitors', 'get', '7', '--json', '--reveal-secrets'],
      environment(apiUrl),
    );
    const raw = await runCli(['monitors', 'get', '7', '--raw'], environment(apiUrl));

    expect(redacted.stdout).not.toContain(SECRET);
    expect(redacted).toEqual({
      exitCode: 0,
      stderr:
        'Redacted credential-like response fields: httpPassword. ' +
        'Re-run with --reveal-secrets to show them.\n',
      // httpUsername is not a credential suffix, so it stays visible.
      stdout:
        '{"id":7,"friendlyName":"checkout-api","httpUsername":"admin","httpPassword":"[REDACTED]"}\n',
    });
    expect(revealed.stdout).toContain(SECRET);
    expect({ ...revealed, stdout: JSON.parse(revealed.stdout) }).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: monitor,
    });
    expect(raw.stdout).toContain(SECRET);
    expect({ ...raw, stdout: JSON.parse(raw.stdout) }).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: monitor,
    });
  });

  it('redacts the resource returned by a create', async () => {
    const created = { id: 99, friendlyName: 'checkout-api', httpPassword: SECRET };
    const apiUrl = await serve(created, 201);
    const args = [
      'monitors',
      'create',
      'http',
      '--name',
      'checkout-api',
      '--url',
      'https://checkout.example.com',
      '--interval',
      '60',
      '--timeout',
      '30',
    ];

    const redacted = await runCli([...args, '--json'], environment(apiUrl));
    const revealed = await runCli([...args, '--json', '--reveal-secrets'], environment(apiUrl));
    const raw = await runCli([...args, '--raw'], environment(apiUrl));

    expect(redacted.stdout).not.toContain(SECRET);
    expect(redacted).toEqual({
      exitCode: 0,
      stderr:
        'Redacted credential-like response fields: httpPassword. ' +
        'Re-run with --reveal-secrets to show them.\n',
      stdout: '{"id":99,"friendlyName":"checkout-api","httpPassword":"[REDACTED]"}\n',
    });
    expect(revealed.stdout).toContain(SECRET);
    expect({ ...revealed, stdout: JSON.parse(revealed.stdout) }).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: created,
    });
    expect(raw.stdout).toContain(SECRET);
    expect({ ...raw, stdout: JSON.parse(raw.stdout) }).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: created,
    });
  });

  it('redacts nested and repeated credential fields across every item', async () => {
    const apiUrl = await serve({
      data: [
        {
          id: 1,
          customHttpHeaders: { Authorization: 'Bearer hidden', 'X-Trace-Id': 'trace-42' },
        },
        { id: 2, httpPassword: 'second-secret' },
        { id: 3, httpPassword: 'third-secret' },
        { id: 4, apiToken: 'fourth-secret' },
      ],
    });

    const result = await runCli(['monitors', 'list', '--json'], environment(apiUrl));

    expect(result.stdout).not.toContain('hidden');
    expect(result.stdout).not.toContain('second-secret');
    expect(result.stdout).not.toContain('third-secret');
    expect(result.stdout).not.toContain('fourth-secret');
    expect({ ...result, stdout: JSON.parse(result.stdout) }).toEqual({
      exitCode: 0,
      stderr:
        'Redacted credential-like response fields: items[0].customHttpHeaders.Authorization, ' +
        'items[1].httpPassword, items[2].httpPassword, and 1 more. ' +
        'Re-run with --reveal-secrets to show them.\n',
      stdout: {
        items: [
          {
            id: 1,
            customHttpHeaders: { Authorization: '[REDACTED]', 'X-Trace-Id': 'trace-42' },
          },
          { id: 2, httpPassword: '[REDACTED]' },
          { id: 3, httpPassword: '[REDACTED]' },
          { id: 4, apiToken: '[REDACTED]' },
        ],
        nextCursor: null,
      },
    });
  });

  it('shows credential fields when --reveal-secrets is passed', async () => {
    const apiUrl = await serve({
      data: [{ id: 1, friendlyName: 'checkout-api', httpPassword: SECRET }],
    });

    const result = await runCli(
      ['monitors', 'list', '--json', '--reveal-secrets'],
      environment(apiUrl),
    );

    expect(result.stdout).toContain(SECRET);
    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout:
        '{"items":[{"id":1,"friendlyName":"checkout-api","httpPassword":"supersecret"}],"nextCursor":null}\n',
    });
  });

  it('leaves --raw output untouched as an explicit escape hatch', async () => {
    const envelope = { data: [{ id: 1, friendlyName: 'checkout-api', httpPassword: SECRET }] };
    const apiUrl = await serve(envelope);

    const result = await runCli(['monitors', 'list', '--raw'], environment(apiUrl));

    expect(result.stdout).toContain(SECRET);
    expect({ ...result, stdout: JSON.parse(result.stdout) }).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: envelope,
    });
  });

  it('stays silent when the response carries nothing to redact', async () => {
    const apiUrl = await serve({ data: [{ id: 1, friendlyName: 'checkout-api' }] });

    const result = await runCli(['monitors', 'list', '--json'], environment(apiUrl));

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '{"items":[{"id":1,"friendlyName":"checkout-api"}],"nextCursor":null}\n',
    });
  });
});
