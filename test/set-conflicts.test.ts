import { describe, expect, it } from 'vitest';
import { runCli } from './helpers/run-cli.js';

// --body is a base document that typed flags and --set both layer onto, so it
// loses to either without complaint. Typed flags and --set are peers: when both
// name the same field there is nothing to say which was meant, so it is an error.
describe('--set against typed flags', () => {
  it('rejects a typed flag and --set that give the same field different values', async () => {
    const result = await runCli([
      'monitors',
      'create',
      'http',
      '--name',
      'TYPED',
      '--url',
      'https://example.com',
      '--interval',
      '60',
      '--timeout',
      '30',
      '--set',
      'friendlyName=FROM_SET',
      '--dry-run',
    ]);

    expect({ ...result, stderr: JSON.parse(result.stderr) }).toEqual({
      exitCode: 2,
      stderr: {
        error: {
          code: 'INVALID_INPUT',
          expected: 'a single value',
          message:
            'friendlyName received conflicting values: --name TYPED and --set friendlyName=FROM_SET. Pass only one.',
          path: 'friendlyName',
        },
      },
      stdout: '',
    });
  });

  it('accepts a typed flag and --set that agree', async () => {
    const result = await runCli([
      'monitors',
      'create',
      'http',
      '--name',
      'SAME',
      '--url',
      'https://example.com',
      '--interval',
      '60',
      '--timeout',
      '30',
      '--set',
      'friendlyName=SAME',
      '--dry-run',
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).body).toEqual(
      expect.objectContaining({ friendlyName: 'SAME' }),
    );
  });

  it('lets a typed flag override --body without complaint', async () => {
    const result = await runCli([
      'monitors',
      'create',
      'http',
      '--body',
      JSON.stringify({
        friendlyName: 'FROM_BODY',
        interval: 60,
        timeout: 30,
        url: 'https://example.com',
      }),
      '--name',
      'FROM_FLAG',
      '--dry-run',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).body).toEqual(
      expect.objectContaining({ friendlyName: 'FROM_FLAG' }),
    );
  });

  it('lets --set override --body without complaint', async () => {
    const result = await runCli([
      'monitors',
      'create',
      'http',
      '--body',
      JSON.stringify({
        friendlyName: 'FROM_BODY',
        interval: 60,
        timeout: 30,
        url: 'https://example.com',
      }),
      '--set',
      'friendlyName=FROM_SET',
      '--dry-run',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).body).toEqual(
      expect.objectContaining({ friendlyName: 'FROM_SET' }),
    );
  });
});
