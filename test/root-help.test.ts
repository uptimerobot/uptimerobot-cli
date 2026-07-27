import { describe, expect, it } from 'vitest';
import { runCli } from './helpers/run-cli.js';

describe('root help', () => {
  it('explains normalized, formatted, and raw output', async () => {
    const result = await runCli(['--help']);
    const help = result.stdout.replace(/\s+/g, ' ');

    expect(result.exitCode).toBe(0);
    expect(help).toContain('--format selects json, jsonl, table, or plain');
    expect(help).toContain('--json is shorthand for normalized JSON');
    expect(help).toContain('--raw emits the untouched API response as JSON');
  });

  it('prints the same overview for the help command as for --help', async () => {
    const command = await runCli(['help']);
    const flag = await runCli(['--help']);

    expect(command.exitCode).toBe(0);
    expect(command.stderr).toBe('');
    expect(command.stdout).toBe(flag.stdout);
  });

  it('lists the help command in the overview', async () => {
    const result = await runCli(['--help']);

    expect(result.stdout.replace(/\s+/g, ' ')).toContain('help Display help for uptimerobot');
  });
});
