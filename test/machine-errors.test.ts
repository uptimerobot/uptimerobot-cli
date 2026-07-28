import { describe, expect, it } from 'vitest';
import { runCli } from './helpers/run-cli.js';

describe('machine-readable CLI errors', () => {
  it('serializes parser failures when --json is requested', async () => {
    const result = await runCli(['monitors', 'get', '42', '--unknown', '--json']);

    expect({ ...result, stderr: JSON.parse(result.stderr) }).toEqual({
      exitCode: 2,
      stderr: {
        error: {
          code: 'INVALID_INPUT',
          message: 'Nonexistent flag: --unknown\nSee more help with --help',
        },
      },
      stdout: '',
    });
  });

  it('serializes unknown-command failures at the executable boundary', async () => {
    const result = await runCli(['not-a-command', '--format=json']);

    expect({ ...result, stderr: JSON.parse(result.stderr) }).toEqual({
      exitCode: 2,
      stderr: {
        error: {
          code: 'INVALID_INPUT',
          message: 'command not-a-command not found',
        },
      },
      stdout: '',
    });
  });

  it('reports a multi-segment unknown command with the configured separator', async () => {
    const machine = await runCli(['monitors', 'lst', '--json']);
    const human = await runCli(['monitors', 'lst', '--format', 'table'], { NO_COLOR: '1' });

    expect({ ...machine, stderr: JSON.parse(machine.stderr) }).toEqual({
      exitCode: 2,
      stderr: {
        error: {
          code: 'INVALID_INPUT',
          message: 'command monitors lst not found',
          suggestions: ['uptimerobot monitors list'],
        },
      },
      stdout: '',
    });
    expect(human.stderr).toContain('Error: command monitors lst not found');
    expect(human.stderr).not.toContain('monitors:lst');
  });

  // oclif's other spelling, `Command <id> not found.`, is raised by Help#showHelp
  // rather than Config#runCommand, and reaches the user through a different
  // boundary depending on how help was requested: the --help flag is served
  // outside any command, while `help ...` raises it inside one.
  it.each([
    { argv: ['help', 'monitors', 'nonsense'], boundary: 'the help command' },
    { argv: ['monitors', 'nonsense', '--help'], boundary: 'the --help flag' },
  ])('reports an unknown help subject from $boundary', async ({ argv }) => {
    const machine = await runCli(argv);
    const human = await runCli(argv, { NO_COLOR: '1', UPTIMEROBOT_OUTPUT: 'table' });

    expect(JSON.parse(machine.stderr)).toEqual({
      error: { code: 'INVALID_INPUT', message: 'Command monitors nonsense not found.' },
    });
    expect(human.stderr).toContain('Error: Command monitors nonsense not found.');
    expect(human.stderr).not.toContain('monitors:nonsense');
  });

  it('leaves colons that are not topic separators alone', async () => {
    const result = await runCli(['https://host:8080/path', '--json']);

    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {
        code: 'INVALID_INPUT',
        message: 'command https://host:8080/path not found',
      },
    });
  });

  it.each([
    { subject: ['monitors'], title: 'a topic' },
    { subject: ['monitors', 'create'], title: 'a multi-word topic' },
    { subject: ['monitors', 'list'], title: 'a command' },
  ])('renders help for $title instead of an unknown-command error', async ({ subject }) => {
    const result = await runCli(['help', ...subject], { NO_COLOR: '1' });
    const flag = await runCli([...subject, '--help'], { NO_COLOR: '1' });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toBe('');
    expect(result.stdout).toBe(flag.stdout);
  });

  it('suggests a close command miss in machine and human output', async () => {
    const machine = await runCli(['auth', 'who-am-i']);
    const human = await runCli(['auth', 'who-am-i', '--format', 'table'], { NO_COLOR: '1' });

    expect(JSON.parse(machine.stderr)).toMatchObject({
      error: { suggestions: ['uptimerobot auth whoami'] },
    });
    expect(human.stderr).toContain('Try this: uptimerobot auth whoami');
  });

  it('does not suggest an unrelated command', async () => {
    const result = await runCli(['completely-unrelated', '--json']);

    expect(JSON.parse(result.stderr).error).not.toHaveProperty('suggestions');
  });

  it.each([
    { args: ['--raw'], env: {}, source: '--raw' },
    { args: ['--format', 'jsonl'], env: {}, source: '--format jsonl' },
    { args: [], env: { UPTIMEROBOT_OUTPUT: 'json' }, source: 'UPTIMEROBOT_OUTPUT=json' },
    { args: [], env: { UPTIMEROBOT_OUTPUT: 'jsonl' }, source: 'UPTIMEROBOT_OUTPUT=jsonl' },
    { args: ['--agent'], env: {}, source: '--agent' },
    {
      args: [],
      env: {
        CLAUDECODE: undefined,
        CODEX_SANDBOX: undefined,
        CURSOR_AGENT: undefined,
        UPTIMEROBOT_AGENT: '0',
        UPTIMEROBOT_OUTPUT: undefined,
      },
      source: 'redirected stdout',
    },
  ])('serializes parser failures selected by $source', async ({ args, env }) => {
    const result = await runCli(['monitors', 'get', '42', '--unknown', ...args], env);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {
        code: 'INVALID_INPUT',
        message: expect.stringContaining('Nonexistent flag: --unknown'),
      },
    });
  });

  it.each(['table', 'plain'])(
    'keeps parser failures human-readable for --format %s',
    async (format) => {
      const result = await runCli(['monitors', 'get', '42', '--unknown', '--format', format], {
        NO_COLOR: '1',
      });

      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Error: Nonexistent flag: --unknown');
      expect(() => JSON.parse(result.stderr)).toThrow();
    },
  );

  it('does not let an invalid format disable redirected machine errors', async () => {
    const result = await runCli(['monitors', 'get', '42', '--format', 'yaml']);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {
        code: 'INVALID_INPUT',
        message: expect.stringContaining('Expected --format=yaml to be one of'),
      },
    });
  });

  it('uses the same boundary for handwritten auth commands', async () => {
    const result = await runCli(['auth', 'status', '--unknown', '--json']);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {
        code: 'INVALID_INPUT',
        message: expect.stringContaining('Nonexistent flag: --unknown'),
      },
    });
  });

  it('includes a field path for generated parameter validation', async () => {
    const result = await runCli(['monitors', 'get', 'not-a-number', '--json']);

    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {
        code: 'INVALID_INPUT',
        path: 'id',
      },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
  });

  it('includes a known request path and expected values for enum parser failures', async () => {
    const result = await runCli(['monitors', 'create', 'keyword', '--method', 'TRACE', '--json']);

    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {
        code: 'INVALID_INPUT',
        expected: 'one of: GET, POST, PUT, PATCH, DELETE, OPTIONS, QUERY',
        path: 'httpMethodType',
      },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
  });

  it('includes a known path for a missing required argument', async () => {
    const result = await runCli(['monitors', 'get', '--json']);

    expect(JSON.parse(result.stderr)).toMatchObject({
      error: { code: 'INVALID_INPUT', expected: 'a value', path: 'id' },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
  });

  it('includes a known path for a missing required query flag', async () => {
    const result = await runCli(['monitors', 'uptime-stats', '--json']);

    expect(JSON.parse(result.stderr)).toMatchObject({
      error: { code: 'INVALID_INPUT', expected: 'a value', path: 'timeFrame' },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
  });
});
