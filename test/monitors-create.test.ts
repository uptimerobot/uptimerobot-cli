import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { cliEnvironment, cliVersion, runCli } from './helpers/run-cli.js';

describe('monitor creation', () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
  });

  it('discovers every monitor type and shows only the selected variant fields', async () => {
    const parent = await runCli(['monitors', 'create', '--help']);
    const http = await runCli(['monitors', 'create', 'http', '--help']);
    const heartbeat = await runCli(['monitors', 'create', 'heartbeat', '--help']);

    expect(parent.exitCode).toBe(0);
    for (const type of [
      'api',
      'dns',
      'heartbeat',
      'http',
      'keyword',
      'ping',
      'port',
      'udp',
      'visual-comparison',
    ]) {
      expect(parent.stdout).toContain(`monitors create ${type}`);
    }

    expect(http.exitCode).toBe(0);
    expect(http.stdout).toContain('--name=<value>');
    expect(http.stdout).toContain('--interval=<number>');
    expect(http.stdout).toContain('--url=<value>');
    expect(http.stdout).toContain('--timeout=<number>');
    expect(http.stdout).toContain('--method=<option>');
    expect(http.stdout.replace(/\s+/g, ' ')).toContain(
      '<options: HEAD|GET|POST|PUT|PATCH|DELETE|OPTIONS|QUERY>',
    );
    expect(http.stdout).toContain('check-ssl');
    expect(http.stdout).toContain('follow-redirects');
    expect(http.stdout).toContain('--assigned-alert-contacts=<json>...');
    expect(http.stdout.replace(/\s+/g, ' ')).toContain('Item shape: {alertContactId*:number');
    expect(http.stdout.replace(/\s+/g, ' ')).toContain(
      'A bare numeric contact ID is also accepted',
    );
    expect(http.stdout).toContain('--maintenance-windows-ids=<number>...');
    expect(http.stdout).toContain('--region=<option>...');
    expect(http.stdout.replace(/\s+/g, ' ')).toContain('one of: na, eu, as, oc');
    expect(http.stdout).toContain('--region-config=<json>');
    expect(http.stdout).not.toContain('--regional-data');
    expect(http.stdout).toContain('Friendly name of the monitor (required,');
    expect(http.stdout.replace(/\s+/g, ' ')).toContain(
      'not sent when omitted; API default not documented',
    );
    expect(http.stdout).not.toContain('--type');
    expect(http.stdout).not.toContain('--keyword-value');
    expect(http.stdout).not.toContain('--port');

    expect(heartbeat.exitCode).toBe(0);
    expect(heartbeat.stdout).toContain('--grace-period=<number>');
    expect(heartbeat.stdout).not.toContain('--url');
    expect(heartbeat.stdout).not.toContain('--timeout');
  });

  it('shows request examples and documented defaults without sending them', async () => {
    const result = await runCli(['monitors', 'create', 'http', '--help']);
    const keyword = await runCli(['monitors', 'create', 'keyword', '--help']);
    const help = result.stdout.replace(/\s+/g, ' ');
    const keywordHelp = keyword.stdout.replace(/\s+/g, ' ');

    expect(result.exitCode).toBe(0);
    expect(help).toContain('EXAMPLES');
    expect(help).toContain('monitors create http --body');
    expect(help).toContain('https://example.com');
    expect(keyword.exitCode).toBe(0);
    expect(keywordHelp).toContain('The CLI defaults to GET; HEAD is invalid for Keyword monitors');
    expect(keywordHelp).toContain('<options: GET|POST|PUT|PATCH|DELETE|OPTIONS|QUERY>');
    expect(keywordHelp).toContain('"httpMethodType":"GET"');
    expect(keyword.stdout).toContain('"friendlyName":"My Keyword monitor"');
    expect(keyword.stdout).toContain('--body \\\n');
  });

  it('generates typed flags for monitor updates', async () => {
    const result = await runCli(['monitors', 'update', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--name=<value>');
    expect(result.stdout).toContain('--interval=<number>');
    expect(result.stdout).toContain('--check-ssl');
    expect(result.stdout).toContain('--assigned-alert-contacts=<json>...');
    expect(result.stdout).toContain('--region=<option>...');
    expect(result.stdout.replace(/\s+/g, ' ')).toContain(
      '--keyword-case-type=<option> Required for Keyword monitor. <options: 0|1>',
    );
  });

  it('compiles a request locally with --dry-run before authentication', async () => {
    const result = await runCli([
      'monitors',
      'create',
      'keyword',
      '--name',
      'Status page keyword',
      '--url',
      'https://status.example.com',
      '--interval',
      '60',
      '--timeout',
      '30',
      '--keyword-type',
      'ALERT_EXISTS',
      '--keyword-case-type',
      'CaseSensitive',
      '--keyword-value',
      'All systems operational',
      '--http-password',
      'supersecret',
      '--custom-http-headers',
      '{"Authorization":"Bearer hidden","X-Trace-Id":"trace-42"}',
      '--dry-run',
    ]);

    expect(result.stdout).not.toContain('supersecret');
    expect(result.stdout).not.toContain('Bearer hidden');
    expect({ ...result, stdout: JSON.parse(result.stdout) }).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: {
        body: expect.objectContaining({
          customHttpHeaders: {
            Authorization: '[REDACTED]',
            'X-Trace-Id': 'trace-42',
          },
          httpMethodType: 'GET',
          httpPassword: '[REDACTED]',
          type: 'KEYWORD',
        }),
        command: 'monitors create keyword',
        contentType: 'application/json',
        dryRun: true,
        method: 'POST',
        path: '/v3/monitors',
        redacted: ['httpPassword', 'customHttpHeaders.Authorization'],
      },
    });
  });

  it.each(['jsonl', 'table', 'plain'])('rejects --dry-run with --format %s', async (format) => {
    const result = await runCli(['monitors', 'reset', '42', '--dry-run', '--format', format]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      '--dry-run emits a JSON request preview and cannot use this output option.',
    );
  });

  it('exposes the generated monitor request schema without authentication', async () => {
    const result = await runCli(['monitors', 'schema', 'keyword']);
    const example = await runCli(['monitors', 'schema', 'keyword', '--example']);
    const output = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(output).toMatchObject({
      command: 'monitors create keyword',
      fixedValues: { type: 'KEYWORD' },
      method: 'POST',
      path: '/monitors',
    });
    expect(output.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ flag: 'keyword-value', path: 'keywordValue', required: true }),
      ]),
    );
    expect(output.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          default: 'GET',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'QUERY'],
          example: 'GET',
          path: 'httpMethodType',
        }),
      ]),
    );
    expect(output.examples[0].body).toMatchObject({ httpMethodType: 'GET' });
    expect({ ...example, stdout: JSON.parse(example.stdout) }).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: expect.objectContaining({ httpMethodType: 'GET', type: 'KEYWORD' }),
    });
  });

  it('locally validates the packaged example for every monitor type', async () => {
    const types = [
      'api',
      'dns',
      'heartbeat',
      'http',
      'keyword',
      'ping',
      'port',
      'udp',
      'visual-comparison',
    ];

    const results = await Promise.all(
      types.map(async (type) => ({
        result: await runCli(['monitors', 'schema', type, '--example']),
        type,
      })),
    );

    for (const { result, type } of results) {
      expect(result.exitCode, `${type}: ${result.stderr}`).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toHaveProperty('type');
    }
  });

  it('documents the fields unique to every generated monitor type', async () => {
    const expectations: Array<[string, string[]]> = [
      [
        'keyword',
        ['--keyword-type=<option>', '--keyword-case-type=<option>', '--keyword-value=<value>'],
      ],
      ['ping', ['--url=<value>', '--timeout=<number>']],
      ['port', ['--port=<number>', '--timeout=<number>']],
      ['dns', ['--config=<json>', '--config-dns-records-a=<value>...']],
      [
        'api',
        ['--config-api-assertions-logic=<option>', '--config-api-assertions-checks=<json>...'],
      ],
      ['udp', ['--port=<number>', '--config-udp-packet-loss-threshold=<number>']],
      [
        'visual-comparison',
        [
          '--config-visual-comparison-sensitivity-threshold=<number>',
          '--config-visual-comparison-viewport=<option>',
        ],
      ],
    ];

    const results = await Promise.all(
      expectations.map(async ([type, flags]) => ({
        flags,
        result: await runCli(['monitors', 'create', type, '--help']),
      })),
    );

    for (const { flags, result } of results) {
      expect(result.exitCode).toBe(0);
      for (const flag of flags) expect(result.stdout).toContain(flag);
      expect(result.stdout).not.toContain('--type');
    }
  });

  it('renders nested enum and range constraints for structured fields', async () => {
    const result = await runCli(['monitors', 'create', 'api', '--help']);
    const help = result.stdout.replace(/\s+/g, ' ');

    expect(result.exitCode).toBe(0);
    expect(help).toContain('comparison*:string');
    expect(help).toContain('greater_than');
    expect(help).toContain('property*:string');
    expect(help).toContain('max length: 500');
  });

  it('synthesizes useful examples when a JSON-body operation has no authored example', async () => {
    const maintenance = await runCli(['maintenance-windows', 'create', '--help']);
    const update = await runCli(['monitors', 'update', '--help']);

    expect(maintenance.exitCode).toBe(0);
    expect(maintenance.stdout).toContain('EXAMPLES');
    expect(maintenance.stdout).toContain('maintenance-windows create --body');
    expect(maintenance.stdout).toContain('"name":"Friday Maintenance window"');
    expect(maintenance.stdout).toContain('"interval":"once"');
    expect(update.exitCode).toBe(0);
    expect(update.stdout).toContain('EXAMPLES');
    expect(update.stdout).toContain('monitors update 123 --body');
    expect(update.stdout).toContain('"friendlyName"');
  });

  it('creates an HTTP monitor from type-safe human-friendly flags', async () => {
    let observedRequest: Record<string, unknown> = {};
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      observedRequest = {
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        contentType: request.headers['content-type'],
        method: request.method,
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
        '--name',
        'checkout-api',
        '--url',
        'https://checkout.example.com',
        '--interval',
        '60',
        '--timeout',
        '30',
        '--method',
        'GET',
        '--check-ssl',
        '--follow-redirects',
        '--tag-names',
        'production',
        '--tag-names',
        'checkout',
        '--maintenance-windows-ids',
        '123',
        '--maintenance-windows-ids',
        '234',
        '--config-ip-version',
        'ipv6Only',
        '--region-data-region',
        'na',
        '--region-data-region',
        'eu',
        '--region-data-threshold-na',
        '5000',
        '--custom-fields',
        '{"team":"checkout"}',
        '--json',
      ],
      {
        UPTIMEROBOT_AGENT: '0',
        UPTIMEROBOT_API_KEY: 'u123-secret',
        UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
      },
    );

    expect({
      observedRequest,
      result: { ...result, stdout: result.stdout ? JSON.parse(result.stdout) : '' },
    }).toEqual({
      observedRequest: {
        body: {
          checkSSLErrors: true,
          config: { ipVersion: 'ipv6Only' },
          customFields: { team: 'checkout' },
          followRedirections: true,
          friendlyName: 'checkout-api',
          httpMethodType: 'GET',
          interval: 60,
          maintenanceWindowsIds: [123, 234],
          regionData: { REGION: ['na', 'eu'], THRESHOLD: { na: 5000 } },
          tagNames: ['production', 'checkout'],
          timeout: 30,
          type: 'HTTP',
          url: 'https://checkout.example.com',
        },
        contentType: 'application/json',
        method: 'POST',
        url: '/v3/monitors',
        userAgent: `uptimerobot-cli/${cliVersion} mode/human environment/${cliEnvironment}`,
      },
      result: {
        exitCode: 0,
        stderr: '',
        stdout: { data: { friendlyName: 'checkout-api', id: 99 } },
      },
    });
  });

  it('rejects missing and invalid variant fields before authentication', async () => {
    const missingPort = await runCli([
      'monitors',
      'create',
      'port',
      '--name',
      'smtp',
      '--url',
      'smtp.example.com',
      '--interval',
      '60',
      '--timeout',
      '30',
      '--json',
    ]);
    const shortInterval = await runCli([
      'monitors',
      'create',
      'http',
      '--name',
      'web',
      '--url',
      'https://example.com',
      '--interval',
      '29',
      '--timeout',
      '30',
      '--json',
    ]);

    expect({ ...missingPort, stderr: JSON.parse(missingPort.stderr) }).toEqual({
      exitCode: 2,
      stderr: {
        error: {
          code: 'INVALID_INPUT',
          expected: 'a value',
          message: 'port is required. Pass --port or --set.',
          path: 'port',
        },
      },
      stdout: '',
    });
    expect({ ...shortInterval, stderr: JSON.parse(shortInterval.stderr) }).toEqual({
      exitCode: 2,
      stderr: {
        error: {
          code: 'INVALID_INPUT',
          expected: 'at least 30',
          message: 'Invalid interval: expected at least 30.',
          path: 'interval',
        },
      },
      stdout: '',
    });
  });

  it('does not allow a typed command body to select another monitor type', async () => {
    const result = await runCli([
      'monitors',
      'create',
      'http',
      '--body',
      '{"friendlyName":"web","interval":60,"timeout":30,"type":"KEYWORD","url":"https://example.com"}',
      '--json',
    ]);

    expect({ ...result, stderr: JSON.parse(result.stderr) }).toEqual({
      exitCode: 2,
      stderr: {
        error: {
          code: 'INVALID_INPUT',
          expected: 'HTTP',
          message: 'type is fixed to HTTP for this command.',
          path: 'type',
        },
      },
      stdout: '',
    });
  });
});
