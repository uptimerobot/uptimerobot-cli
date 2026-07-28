import { createServer } from 'node:http';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { HANDWRITTEN_COMMANDS } from '../src/lib/command-suggestions.js';
import { runCli } from './helpers/run-cli.js';

describe('command aliases', () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
  });

  it('exposes auth whoami as an alias for auth status', async () => {
    const result = await runCli(['auth', 'whoami', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Show authentication status');
    expect(result.stdout).toContain('Canonical command: uptimerobot auth status');
  });

  it('suggests only handwritten commands that exist as compiled command files', async () => {
    const commandsDirectory = new URL('../dist/commands/', import.meta.url);

    await Promise.all(
      HANDWRITTEN_COMMANDS.map(async (command) => {
        const commandFile = new URL(`${command.replaceAll(' ', '/')}.js`, commandsDirectory);
        await expect(access(fileURLToPath(commandFile)), command).resolves.toBeUndefined();
      }),
    );
  });
});
