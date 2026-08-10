import { describe, expect, it } from 'vitest';
import { cliVersion, runCli } from './helpers/run-cli.js';

describe('version command', () => {
  it('emits the version, platform, and node runtime as separate fields', async () => {
    const result = await runCli(['version', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      node: process.versions.node,
      platform: expect.stringMatching(/^\S+-\S+$/),
      version: cliVersion,
    });
  });

  it('reports the same facts as the --version flag', async () => {
    const flag = await runCli(['--version']);
    const command = await runCli(['version', '--json']);
    const info = JSON.parse(command.stdout);

    expect(flag.stdout.trim()).toBe(
      `@uptimerobot/cli/${info.version} ${info.platform} node-v${info.node}`,
    );
  });

  it('defaults to JSON when stdout is not a terminal', async () => {
    const result = await runCli(['version'], { UPTIMEROBOT_AGENT: '0' });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).version).toBe(cliVersion);
  });

  it('emits the single record on one line for jsonl', async () => {
    const result = await runCli(['version', '--format', 'jsonl']);

    expect(result.stdout.trimEnd().split('\n')).toHaveLength(1);
    expect(JSON.parse(result.stdout).version).toBe(cliVersion);
  });

  it('renders a readable table', async () => {
    const result = await runCli(['version', '--format', 'table'], { NO_COLOR: '1' });
    const [heading, row] = result.stdout.trimEnd().split('\n');

    expect(result.exitCode).toBe(0);
    expect(heading?.split(/\s+/)).toEqual(['VERSION', 'PLATFORM', 'NODE']);
    expect(row?.split(/\s+/)).toEqual([cliVersion, expect.any(String), process.versions.node]);
  });

  it('renders a tab-separated row for plain', async () => {
    const result = await runCli(['version', '--format', 'plain']);
    const fields = result.stdout.trimEnd().split('\t');

    expect(fields[0]).toBe(cliVersion);
    expect(fields[2]).toBe(process.versions.node);
  });

  it('honours UPTIMEROBOT_OUTPUT', async () => {
    const result = await runCli(['version'], { NO_COLOR: '1', UPTIMEROBOT_OUTPUT: 'table' });

    expect(result.stdout).toContain('VERSION');
    expect(result.stdout).toContain(cliVersion);
  });

  it('rejects --json combined with --format', async () => {
    const result = await runCli(['version', '--json', '--format', 'json']);

    expect({ ...result, stderr: JSON.parse(result.stderr) }).toEqual({
      exitCode: 2,
      stderr: {
        error: { code: 'INVALID_INPUT', message: '--json cannot be combined with --format.' },
      },
      stdout: '',
    });
  });

  it('lists the version command in the overview', async () => {
    const result = await runCli(['--help']);

    expect(result.stdout.replace(/\s+/g, ' ')).toContain('version Show the CLI version');
  });
});
