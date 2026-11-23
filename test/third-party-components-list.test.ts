import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './helpers/run-cli.js';

const TREE = {
  data: [
    {
      id: 9100,
      name: 'Amazon Simple Storage Service',
      status: 'operational',
      region: null,
      global: false,
      children: [
        {
          id: 9108,
          name: 'Amazon Simple Storage Service (Frankfurt)',
          status: 'operational',
          region: { code: 'eu-central-1', name: 'Frankfurt' },
          global: false,
        },
      ],
    },
  ],
  regionLike: false,
};

describe('third-party-providers components list', () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
    servers.length = 0;
  });

  async function serve(): Promise<Record<string, string>> {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(TREE));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    return {
      UPTIMEROBOT_API_KEY: 'u123-secret',
      UPTIMEROBOT_DEV_API_URL: `http://127.0.0.1:${address.port}/v3`,
      NO_COLOR: '1',
    };
  }

  it('keeps the tree in JSON output and flattens it only for a table', async () => {
    const env = await serve();
    const args = ['third-party-providers', 'components', 'list', '248', '--search', 'storage'];

    const json = await runCli([...args, '--json'], env);
    const table = await runCli(args, { ...env, UPTIMEROBOT_OUTPUT: 'table' });

    expect(json.exitCode).toBe(0);
    expect(JSON.parse(json.stdout)).toEqual({
      items: TREE.data,
      nextCursor: null,
    });
    expect(table.exitCode).toBe(0);
    expect(table.stdout).toContain('PARENT');
    expect(table.stdout).toContain(
      '9108  Amazon Simple Storage Service (Frankfurt)  Amazon Simple Storage Service',
    );
    expect(table.stdout).not.toContain('9100 ');

    const all = await runCli([...args, '--all'], { ...env, UPTIMEROBOT_OUTPUT: 'table' });
    expect(all.exitCode).toBe(0);
    expect(all.stdout).toContain('9100');
    expect(all.stdout).not.toContain('PARENT');
  });
});
