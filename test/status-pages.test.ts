import { mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { operations } from '../src/generated/operations.js';
import { encodeFormBody } from '../src/lib/form-body.js';
import { buildRequestBody } from '../src/lib/request.js';
import type { OperationDefinition } from '../src/lib/types.js';
import { runCli } from './helpers/run-cli.js';

const createOperation = operations['status-pages:create'];
const updateOperation = operations['status-pages:update'];

async function writeTemporaryLogo(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'uptimerobot-psp-'));
  const path = join(directory, 'logo.png');
  await writeFile(path, Buffer.from('89504e470d0a1a0a', 'hex'));
  return path;
}

describe('status page request bodies', () => {
  it('sends JSON when the request carries no file upload', async () => {
    const headers = new Headers();
    const body = await buildRequestBody(
      createOperation,
      { body: '{"friendlyName":"Status","monitorIds":[123]}' },
      headers,
    );

    expect({ body: JSON.parse(String(body)), contentType: headers.get('content-type') }).toEqual({
      body: { friendlyName: 'Status', monitorIds: [123] },
      contentType: 'application/json',
    });
  });

  it('switches to multipart only when a file is uploaded', async () => {
    const headers = new Headers();
    const body = await buildRequestBody(
      createOperation,
      {
        body: '{"friendlyName":"Status","monitorIds":[123]}',
        file: [`logo=${await writeTemporaryLogo()}`],
      },
      headers,
    );

    expect(body).toBeInstanceOf(FormData);
    // The boundary is filled in by fetch, so no content-type must be forced here.
    expect(headers.get('content-type')).toBeNull();
    expect((body as FormData).getAll('monitorIds[]')).toEqual(['123']);
    expect((body as FormData).get('logo')).toBeInstanceOf(Blob);
  });
});

describe('multipart encoding', () => {
  it('appends a single-item array under a bracketed key', () => {
    const form = encodeFormBody({ monitorIds: [123] });

    expect({ bracketed: form.getAll('monitorIds[]'), bare: form.getAll('monitorIds') }).toEqual({
      bracketed: ['123'],
      bare: [],
    });
  });

  it('appends one entry per item for a multi-item array', () => {
    const form = encodeFormBody({ monitorIds: [123, 456, 789] });

    expect(form.getAll('monitorIds[]')).toEqual(['123', '456', '789']);
  });

  it('flattens nested objects to dotted paths', () => {
    const form = encodeFormBody({
      customSettings: {
        colors: { main: '#ffffff' },
        features: { showBars: true },
        page: { density: 'COMPACT', theme: 'LIGHT' },
      },
      friendlyName: 'Status',
    });

    expect(Object.fromEntries(form.entries())).toEqual({
      'customSettings.colors.main': '#ffffff',
      'customSettings.features.showBars': 'true',
      'customSettings.page.density': 'COMPACT',
      'customSettings.page.theme': 'LIGHT',
      friendlyName: 'Status',
    });
  });

  it('drops null and undefined because multipart cannot express them', () => {
    const form = encodeFormBody({ customDomain: null, friendlyName: 'Status', icon: undefined });

    expect([...form.keys()]).toEqual(['friendlyName']);
  });

  it('refuses to encode an empty array', () => {
    expect(() => encodeFormBody({ monitorIds: [] })).toThrowError(
      /monitorIds cannot be cleared in a request that uploads a file/,
    );
  });
});

describe('status pages create', () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
  });

  async function startServer(): Promise<{
    observed: { body: string; contentType: string };
    url: string;
  }> {
    const observed = { body: '', contentType: '' };
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        observed.body = Buffer.concat(chunks).toString('utf8');
        observed.contentType = request.headers['content-type'] ?? '';
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ data: { id: 900, friendlyName: 'Status' } }));
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    return { observed, url: `http://127.0.0.1:${address.port}/v3` };
  }

  it('posts a JSON array of monitor IDs for a single monitor', async () => {
    const { observed, url } = await startServer();

    const result = await runCli(
      [
        'status-pages',
        'create',
        '--set',
        'friendlyName=Status',
        '--set',
        'monitorIds=[123]',
        '--json',
      ],
      {
        UPTIMEROBOT_AGENT: '0',
        UPTIMEROBOT_API_KEY: 'u123-secret',
        UPTIMEROBOT_DEV_API_URL: url,
      },
    );

    expect({
      body: observed.body === '' ? '' : JSON.parse(observed.body),
      contentType: observed.contentType,
      exitCode: result.exitCode,
      stderr: result.stderr,
    }).toEqual({
      body: { friendlyName: 'Status', monitorIds: [123] },
      contentType: 'application/json',
      exitCode: 0,
      stderr: '',
    });
  });

  it('compiles a status page request with --dry-run', async () => {
    const result = await runCli([
      'status-pages',
      'create',
      '--set',
      'friendlyName=Status',
      '--set',
      'monitorIds=[123]',
      '--dry-run',
    ]);

    expect({ ...result, stdout: JSON.parse(result.stdout) }).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: {
        body: { friendlyName: 'Status', monitorIds: [123] },
        command: 'status-pages create',
        contentType: 'application/json',
        dryRun: true,
        method: 'POST',
        path: '/v3/psps',
      },
    });
  });

  it('rejects clearing an array in the same request as a file upload', async () => {
    const logo = await writeTemporaryLogo();
    const result = await runCli(
      [
        'status-pages',
        'update',
        '42',
        '--set',
        'monitorIds=[]',
        '--file',
        `logo=${logo}`,
        '--json',
      ],
      {
        UPTIMEROBOT_AGENT: '0',
        UPTIMEROBOT_API_KEY: 'u123-secret',
        UPTIMEROBOT_DEV_API_URL: 'http://127.0.0.1:9/v3',
      },
    );

    expect({ ...result, stderr: JSON.parse(result.stderr) }).toEqual({
      exitCode: 2,
      stderr: {
        error: {
          code: 'INVALID_INPUT',
          expected: 'a non-empty array',
          message:
            'monitorIds cannot be cleared in a request that uploads a file. Re-run without --file to send an empty monitorIds, or split this into two commands.',
          path: 'monitorIds',
        },
      },
      stdout: '',
    });
  });

  it('still uploads a logo as multipart when --file is passed', async () => {
    const { observed, url } = await startServer();
    const logo = await writeTemporaryLogo();

    const result = await runCli(
      [
        'status-pages',
        'update',
        '42',
        '--set',
        'friendlyName=Status',
        '--set',
        'monitorIds=[123]',
        '--set',
        'customSettings.page.density=COMPACT',
        '--file',
        `logo=${logo}`,
        '--json',
      ],
      {
        UPTIMEROBOT_AGENT: '0',
        UPTIMEROBOT_API_KEY: 'u123-secret',
        UPTIMEROBOT_DEV_API_URL: url,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(observed.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(observed.body).toContain('name="monitorIds[]"');
    expect(observed.body).toContain('name="customSettings.page.density"');
    expect(observed.body).toContain('name="logo"; filename="logo.png"');
  });

  it('offers --dry-run alongside --file in help output', async () => {
    const help = await runCli(['status-pages', 'create', '--help']);

    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain('--dry-run');
    expect(help.stdout).toContain('--file=<field=path>');
  });
});

describe('status page operation shape', () => {
  it('is the only pair of operations that documents multipart', () => {
    const all: readonly OperationDefinition[] = Object.values(operations);
    const multipart = all
      .filter((operation) => operation.contentTypes.includes('multipart/form-data'))
      .map((operation) => operation.commandId)
      .sort();

    expect(multipart).toEqual(['status-pages:create', 'status-pages:update']);
    expect(updateOperation.method).toBe('PATCH');
  });
});
