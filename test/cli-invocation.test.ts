import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CLI_BINARY_NAME,
  CLI_COMMAND_ENVIRONMENT_VARIABLE,
  CLI_PACKAGE_NAME,
  formatInvocation,
  resolveCliInvocation,
} from '../src/lib/agent-setup/cli-invocation.js';

const NPX_COMMAND = `npx ${CLI_PACKAGE_NAME}`;
/** Windows has no executable bit and no unprivileged symlinks. */
const onWindows = process.platform === 'win32';

/** Records every candidate that was probed and matches only the given paths. */
function recordingProbe(...matches: readonly string[]) {
  const probed: string[] = [];
  return {
    probe: async (path: string): Promise<boolean> => {
      probed.push(path);
      return matches.includes(path);
    },
    probed,
  };
}

describe('CLI invocation constants', () => {
  it('matches the bin and package name published in package.json', async () => {
    const manifestPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      bin: Record<string, string>;
      name: string;
    };

    expect(CLI_PACKAGE_NAME).toBe(manifest.name);
    expect(Object.keys(manifest.bin)).toContain(CLI_BINARY_NAME);
  });
});

describe('resolveCliInvocation', () => {
  it('falls back to npx when the bin is not on PATH', async () => {
    const { probe, probed } = recordingProbe();

    const invocation = await resolveCliInvocation({
      env: { PATH: '/usr/local/bin:/usr/bin' },
      isExecutableFile: probe,
      platform: 'linux',
    });

    expect(invocation).toEqual({ command: NPX_COMMAND, source: 'npx' });
    expect(probed).toEqual(['/usr/local/bin/uptimerobot', '/usr/bin/uptimerobot']);
  });

  it('falls back to npx when PATH is not set at all', async () => {
    const { probe, probed } = recordingProbe();

    const invocation = await resolveCliInvocation({
      env: {},
      isExecutableFile: probe,
      platform: 'linux',
    });

    expect(invocation.source).toBe('npx');
    expect(probed).toEqual([]);
  });

  it('uses the bare bin name for the first executable on PATH', async () => {
    const { probe } = recordingProbe('/opt/bin/uptimerobot');

    const invocation = await resolveCliInvocation({
      env: { PATH: '/usr/bin:/opt/bin:/home/dev/bin' },
      isExecutableFile: probe,
      platform: 'linux',
    });

    expect(invocation).toEqual({
      command: 'uptimerobot',
      resolvedPath: '/opt/bin/uptimerobot',
      source: 'path',
    });
  });

  it('stops at the first match instead of scanning the rest of PATH', async () => {
    const { probe, probed } = recordingProbe('/a/uptimerobot', '/b/uptimerobot');

    const invocation = await resolveCliInvocation({
      env: { PATH: '/a:/b' },
      isExecutableFile: probe,
      platform: 'linux',
    });

    expect(invocation.resolvedPath).toBe('/a/uptimerobot');
    expect(probed).toEqual(['/a/uptimerobot']);
  });

  it('keeps scanning past an entry that cannot be read', async () => {
    const invocation = await resolveCliInvocation({
      env: { PATH: '/root/private:/usr/bin' },
      isExecutableFile: async (path) => {
        if (path.startsWith('/root/')) throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
        return true;
      },
      platform: 'linux',
    });

    expect(invocation).toEqual({
      command: 'uptimerobot',
      resolvedPath: '/usr/bin/uptimerobot',
      source: 'path',
    });
  });

  it('falls back to npx rather than throwing when every entry fails', async () => {
    const invocation = await resolveCliInvocation({
      env: { PATH: '/root/one:/root/two' },
      isExecutableFile: () => Promise.reject(new Error('EACCES')),
      platform: 'linux',
    });

    expect(invocation).toEqual({ command: NPX_COMMAND, source: 'npx' });
  });

  it('never probes a relative candidate for an empty PATH entry', async () => {
    const { probe, probed } = recordingProbe();

    await resolveCliInvocation({
      env: { PATH: ':/usr/bin:' },
      isExecutableFile: probe,
      platform: 'linux',
    });

    expect(probed).toEqual(['/usr/bin/uptimerobot']);
  });

  it('prefers an explicit command override over PATH', async () => {
    const invocation = await resolveCliInvocation({
      env: {
        [CLI_COMMAND_ENVIRONMENT_VARIABLE]: '  pnpm --silent uptimerobot  ',
        PATH: '/usr/bin',
      },
      isExecutableFile: async () => true,
      platform: 'linux',
    });

    expect(invocation).toEqual({ command: 'pnpm --silent uptimerobot', source: 'override' });
  });

  it('ignores a blank command override', async () => {
    const invocation = await resolveCliInvocation({
      env: { [CLI_COMMAND_ENVIRONMENT_VARIABLE]: '   ', PATH: '/usr/bin' },
      isExecutableFile: async () => false,
      platform: 'linux',
    });

    expect(invocation.source).toBe('npx');
  });
});

describe('resolveCliInvocation on Windows', () => {
  it('resolves the PATHEXT shim before the extension-less name', async () => {
    const { probe, probed } = recordingProbe('C:\\tools\\uptimerobot.CMD');

    const invocation = await resolveCliInvocation({
      env: { PATH: 'C:\\tools', PATHEXT: '.COM;.EXE;.CMD' },
      isExecutableFile: probe,
      platform: 'win32',
    });

    expect(invocation).toEqual({
      command: 'uptimerobot',
      resolvedPath: 'C:\\tools\\uptimerobot.CMD',
      source: 'path',
    });
    expect(probed).toEqual([
      'C:\\tools\\uptimerobot.COM',
      'C:\\tools\\uptimerobot.EXE',
      'C:\\tools\\uptimerobot.CMD',
    ]);
  });

  it('splits on semicolons, strips quoting, and still tries the bare name', async () => {
    const { probe, probed } = recordingProbe();

    const invocation = await resolveCliInvocation({
      env: { Path: '"C:\\Program Files\\nodejs";C:\\bin', PATHEXT: '.EXE' },
      isExecutableFile: probe,
      platform: 'win32',
    });

    expect(invocation.source).toBe('npx');
    expect(probed).toEqual([
      'C:\\Program Files\\nodejs\\uptimerobot.EXE',
      'C:\\Program Files\\nodejs\\uptimerobot',
      'C:\\bin\\uptimerobot.EXE',
      'C:\\bin\\uptimerobot',
    ]);
  });

  it('falls back to the documented default extensions when PATHEXT is unset', async () => {
    const { probe, probed } = recordingProbe();

    await resolveCliInvocation({
      env: { PATH: 'C:\\bin' },
      isExecutableFile: probe,
      platform: 'win32',
    });

    expect(probed).toEqual([
      'C:\\bin\\uptimerobot.COM',
      'C:\\bin\\uptimerobot.EXE',
      'C:\\bin\\uptimerobot.BAT',
      'C:\\bin\\uptimerobot.CMD',
      'C:\\bin\\uptimerobot',
    ]);
  });
});

describe('resolveCliInvocation against the filesystem', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'uptimerobot-cli-test-'));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it('finds a real executable on PATH', async () => {
    const binary = join(directory, CLI_BINARY_NAME);
    await writeFile(binary, '#!/bin/sh\n');
    await chmod(binary, 0o755);

    const invocation = await resolveCliInvocation({ env: { PATH: directory } });

    expect(invocation).toEqual({
      command: 'uptimerobot',
      resolvedPath: binary,
      source: 'path',
    });
  });

  it.skipIf(onWindows)('ignores a file without the executable bit', async () => {
    const binary = join(directory, CLI_BINARY_NAME);
    await writeFile(binary, 'not executable\n');
    await chmod(binary, 0o644);

    const invocation = await resolveCliInvocation({ env: { PATH: directory } });

    expect(invocation).toEqual({ command: NPX_COMMAND, source: 'npx' });
  });

  it('ignores a directory that shares the bin name', async () => {
    await mkdir(join(directory, CLI_BINARY_NAME), { mode: 0o755 });

    const invocation = await resolveCliInvocation({ env: { PATH: directory } });

    expect(invocation).toEqual({ command: NPX_COMMAND, source: 'npx' });
  });

  it.skipIf(onWindows)('ignores a broken symlink', async () => {
    await symlink(join(directory, 'missing-target'), join(directory, CLI_BINARY_NAME));

    const invocation = await resolveCliInvocation({ env: { PATH: directory } });

    expect(invocation).toEqual({ command: NPX_COMMAND, source: 'npx' });
  });

  it('ignores a PATH entry that does not exist', async () => {
    const invocation = await resolveCliInvocation({
      env: { PATH: join(directory, 'no-such-directory') },
    });

    expect(invocation).toEqual({ command: NPX_COMMAND, source: 'npx' });
  });
});

describe('formatInvocation', () => {
  const npx = { command: NPX_COMMAND, source: 'npx' } as const;
  const onPath = { command: CLI_BINARY_NAME, source: 'path' } as const;

  it('templates a subcommand onto the npx form', () => {
    expect(formatInvocation(npx, 'monitors list --json')).toBe(
      'npx @uptimerobot/cli monitors list --json',
    );
  });

  it('templates a subcommand onto the bare bin name', () => {
    expect(formatInvocation(onPath, 'monitors list --json')).toBe(
      'uptimerobot monitors list --json',
    );
  });

  it('joins with exactly one space regardless of padding', () => {
    expect(formatInvocation(npx, '   monitors list   ')).toBe('npx @uptimerobot/cli monitors list');
  });

  it('returns the bare command for an empty or blank subcommand', () => {
    expect(formatInvocation(npx, '')).toBe(NPX_COMMAND);
    expect(formatInvocation(npx, '   ')).toBe(NPX_COMMAND);
    expect(formatInvocation(onPath, '')).toBe('uptimerobot');
  });

  it('leaves quoting and inner spacing untouched', () => {
    const subcommand = 'monitors create --name "Prod  API" --url \'https://a.test\'';

    expect(formatInvocation(onPath, subcommand)).toBe(`uptimerobot ${subcommand}`);
  });
});
