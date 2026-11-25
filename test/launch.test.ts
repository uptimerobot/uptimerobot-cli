import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LaunchChildProcess, LaunchSpawn } from '../src/lib/agent-setup/launch.js';
import {
  isLaunchableBinary,
  launchAgent,
  planLaunch,
  resolveAgentBinary,
} from '../src/lib/agent-setup/launch.js';

const PROMPT =
  'Read uptimerobot-setup.md and uptimerobot-scan.md, then set up UptimeRobot monitoring for this repository by following the setup guide.';
/** Windows has no executable bit and no unprivileged symlinks. */
const onWindows = process.platform === 'win32';

/**
 * A stand-in for the ChildProcess launchAgent awaits: it records the once
 * listeners so a test can drive `close` and `error` by hand, without a real
 * process ever being spawned.
 */
class FakeChild implements LaunchChildProcess {
  private closeListener?: (code: number | null, signal: NodeJS.Signals | null) => void;
  private errorListener?: (error: Error) => void;

  once(
    event: 'close',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
  once(event: 'error', listener: (error: Error) => void): this;
  once(event: 'close' | 'error', listener: (...args: never[]) => void): this {
    if (event === 'close') this.closeListener = listener as never;
    else this.errorListener = listener as never;
    return this;
  }

  close(code: number | null): void {
    this.closeListener?.(code, null);
  }

  fail(error: Error): void {
    this.errorListener?.(error);
  }
}

describe('planLaunch', () => {
  it('opens claude-code interactively on the prompt alone', () => {
    expect(planLaunch('claude-code', PROMPT, { env: {} })).toEqual({
      args: [PROMPT],
      command: 'claude',
    });
  });

  it('passes an explicit skills directory as --plugin-dir before the prompt', () => {
    expect(planLaunch('claude-code', PROMPT, { env: {}, skillsDir: '/tmp/ai' })).toEqual({
      args: ['--plugin-dir', '/tmp/ai', PROMPT],
      command: 'claude',
    });
  });

  it('reads the skills directory from UPTIMEROBOT_SKILLS_DIR when none is given', () => {
    expect(
      planLaunch('claude-code', PROMPT, { env: { UPTIMEROBOT_SKILLS_DIR: '/opt/ai' } }),
    ).toEqual({ args: ['--plugin-dir', '/opt/ai', PROMPT], command: 'claude' });
  });

  it('treats a blank UPTIMEROBOT_SKILLS_DIR as absent', () => {
    expect(planLaunch('claude-code', PROMPT, { env: { UPTIMEROBOT_SKILLS_DIR: '   ' } })).toEqual({
      args: [PROMPT],
      command: 'claude',
    });
  });

  it('prefers an explicit skills directory over the environment', () => {
    expect(
      planLaunch('claude-code', PROMPT, {
        env: { UPTIMEROBOT_SKILLS_DIR: '/opt/ai' },
        skillsDir: '/explicit',
      }),
    ).toEqual({ args: ['--plugin-dir', '/explicit', PROMPT], command: 'claude' });
  });

  it.each(['codex', 'cursor', 'opencode', 'gemini'] as const)(
    'returns null for %s, which has no confirmed launch command',
    (target) => {
      expect(planLaunch(target, PROMPT, { env: {} })).toBeNull();
    },
  );
});

describe('resolveAgentBinary', () => {
  it('returns the first executable match and stops probing the rest of PATH', async () => {
    const probed: string[] = [];
    const found = await resolveAgentBinary('claude', {
      env: { PATH: '/usr/bin:/opt/bin:/home/dev/bin' },
      isExecutableFile: async (path) => {
        probed.push(path);
        return path === '/opt/bin/claude';
      },
      platform: 'linux',
    });

    expect(found).toBe('/opt/bin/claude');
    expect(probed).toEqual(['/usr/bin/claude', '/opt/bin/claude']);
  });

  it('returns undefined when the binary is not on PATH', async () => {
    await expect(
      resolveAgentBinary('claude', {
        env: { PATH: '/usr/bin' },
        isExecutableFile: async () => false,
        platform: 'linux',
      }),
    ).resolves.toBeUndefined();
  });

  it('returns undefined when PATH is unset', async () => {
    await expect(
      resolveAgentBinary('claude', { env: {}, platform: 'linux' }),
    ).resolves.toBeUndefined();
  });

  it('never throws when a probe fails, returning undefined instead', async () => {
    await expect(
      resolveAgentBinary('claude', {
        env: { PATH: '/root/one:/root/two' },
        isExecutableFile: () => Promise.reject(new Error('EACCES')),
        platform: 'linux',
      }),
    ).resolves.toBeUndefined();
  });

  it('resolves a Windows executable through PATHEXT', async () => {
    const found = await resolveAgentBinary('claude', {
      env: { PATH: 'C:\\tools', PATHEXT: '.COM;.EXE;.CMD' },
      isExecutableFile: async (path) => path === 'C:\\tools\\claude.CMD',
      platform: 'win32',
    });

    expect(found).toBe('C:\\tools\\claude.CMD');
  });

  describe('against the filesystem', () => {
    let directory: string;

    beforeEach(async () => {
      directory = await mkdtemp(join(tmpdir(), 'uptimerobot-cli-test-'));
    });

    afterEach(async () => {
      await rm(directory, { force: true, recursive: true });
    });

    it('finds a real executable on PATH', async () => {
      const binary = join(directory, 'claude');
      await writeFile(binary, '#!/bin/sh\n');
      await chmod(binary, 0o755);

      await expect(resolveAgentBinary('claude', { env: { PATH: directory } })).resolves.toBe(
        binary,
      );
    });

    it.skipIf(onWindows)('ignores a file without the executable bit', async () => {
      const binary = join(directory, 'claude');
      await writeFile(binary, 'not executable\n');
      await chmod(binary, 0o644);

      await expect(
        resolveAgentBinary('claude', { env: { PATH: directory } }),
      ).resolves.toBeUndefined();
    });

    it('ignores a directory that shares the binary name', async () => {
      await mkdir(join(directory, 'claude'));

      await expect(
        resolveAgentBinary('claude', { env: { PATH: directory } }),
      ).resolves.toBeUndefined();
    });

    it.skipIf(onWindows)('ignores a broken symlink', async () => {
      await symlink(join(directory, 'missing-target'), join(directory, 'claude'));

      await expect(
        resolveAgentBinary('claude', { env: { PATH: directory } }),
      ).resolves.toBeUndefined();
    });
  });
});

describe('isLaunchableBinary', () => {
  it('refuses a Windows .cmd or .bat shim, which spawn cannot start without a shell', () => {
    expect(isLaunchableBinary('C:\\Users\\me\\AppData\\Roaming\\npm\\claude.CMD')).toBe(false);
    expect(isLaunchableBinary('C:\\tools\\claude.bat')).toBe(false);
    expect(isLaunchableBinary('/usr/local/bin/claude')).toBe(true);
    expect(isLaunchableBinary('C:\\tools\\claude.exe')).toBe(true);
  });
});

describe('launchAgent', () => {
  it('spawns the exact command with inherited stdio and resolves the exit code', async () => {
    const child = new FakeChild();
    const spawn = vi.fn<LaunchSpawn>(() => child);

    const promise = launchAgent(
      { args: ['--plugin-dir', '/ai', PROMPT], command: 'claude' },
      { spawn },
    );
    child.close(0);

    await expect(promise).resolves.toBe(0);
    expect(spawn).toHaveBeenCalledOnce();
    expect(spawn).toHaveBeenCalledWith('claude', ['--plugin-dir', '/ai', PROMPT], {
      stdio: 'inherit',
    });
  });

  it('propagates a non-zero child exit code', async () => {
    const child = new FakeChild();
    const promise = launchAgent({ args: [], command: 'claude' }, { spawn: () => child });
    child.close(7);

    await expect(promise).resolves.toBe(7);
  });

  it('resolves non-zero when the child exits by signal with a null code', async () => {
    const child = new FakeChild();
    const promise = launchAgent({ args: [], command: 'claude' }, { spawn: () => child });
    child.close(null);

    await expect(promise).resolves.toBe(1);
  });

  it('resolves undefined when the child emits an error instead of starting', async () => {
    const child = new FakeChild();
    const promise = launchAgent({ args: [], command: 'claude' }, { spawn: () => child });
    child.fail(new Error('ENOENT'));

    await expect(promise).resolves.toBeUndefined();
  });

  it('never throws when spawn fails synchronously', async () => {
    await expect(
      launchAgent(
        { args: [], command: 'claude' },
        {
          spawn: () => {
            throw new Error('EACCES');
          },
        },
      ),
    ).resolves.toBeUndefined();
  });
});
