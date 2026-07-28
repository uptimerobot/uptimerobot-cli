import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn }));

import { runSkillsInstaller } from '../src/lib/skills-installer.js';

describe('runSkillsInstaller', () => {
  beforeEach(() => spawn.mockReset());

  it('runs the repository installer with inherited terminal IO', async () => {
    const child = new EventEmitter();
    spawn.mockReturnValue(child);

    const result = runSkillsInstaller();
    child.emit('close', 0);

    await expect(result).resolves.toBe(0);
    const executable = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npx';
    const args =
      process.platform === 'win32'
        ? ['/d', '/s', '/c', 'npx.cmd', 'skills', 'add', 'uptimerobot/ai']
        : ['skills', 'add', 'uptimerobot/ai'];
    expect(spawn).toHaveBeenCalledWith(executable, args, { stdio: 'inherit' });
  });

  it('preserves a nonzero installer exit code', async () => {
    const child = new EventEmitter();
    spawn.mockReturnValue(child);

    const result = runSkillsInstaller();
    child.emit('close', 23);

    await expect(result).resolves.toBe(23);
  });

  it('maps an installer signal to its conventional exit status', async () => {
    const child = new EventEmitter();
    spawn.mockReturnValue(child);

    const result = runSkillsInstaller();
    child.emit('close', null, 'SIGTERM');

    await expect(result).resolves.toBe(143);
  });

  it('rejects when npx cannot be started', async () => {
    const child = new EventEmitter();
    spawn.mockReturnValue(child);
    const error = Object.assign(new Error('spawn npx ENOENT'), { code: 'ENOENT' });

    const result = runSkillsInstaller();
    child.emit('error', error);

    await expect(result).rejects.toBe(error);
  });
});
