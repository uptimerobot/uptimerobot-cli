import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from './helpers/run-cli.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

/** A command that prints several lines without authentication or networking. */
const DRY_RUN = [
  'monitors',
  'create',
  'http',
  '--name',
  'X',
  '--url',
  'https://example.com',
  '--interval',
  '60',
  '--timeout',
  '30',
  '--dry-run',
];

describe('broken stdout pipe', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'uptimerobot-broken-pipe-'));
  });

  afterEach(() => rmSync(directory, { force: true, recursive: true }));

  it('exits quietly when the reader is already gone', async () => {
    const result = await runCliWithoutStdoutReader(DRY_RUN);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it.runIf(process.platform === 'darwin' || process.platform === 'linux').each([
    { name: 'head -3', reader: 'head -3' },
    { name: 'grep -q', reader: 'grep -q friendlyName' },
    { name: 'head -c', reader: 'head -c 10' },
  ])('exits quietly when $name closes the pipe early', async ({ reader }) => {
    const result = await runCliThroughReader(DRY_RUN, reader, directory);

    expect(result.cliStderr).toBe('');
    expect(result.cliExitCode).toBe(0);
  });

  it.runIf(process.platform === 'darwin' || process.platform === 'linux')(
    'keeps the output the reader did receive',
    async () => {
      const full = await runCli(DRY_RUN);
      const truncated = await runCliThroughReader(DRY_RUN, 'head -3', directory);

      expect(truncated.readerStdout).toBe(full.stdout.split('\n').slice(0, 3).join('\n') + '\n');
      expect(truncated.readerStdout).not.toBe('');
    },
  );

  it('is unaffected when the reader consumes everything', async () => {
    const result = await runCli(DRY_RUN);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({ dryRun: true, method: 'POST' });
  });

  it('still reports a failure on stderr when the reader closes stdout', async () => {
    const result = await runCliWithoutStdoutReader(['monitors', 'lst', '--json']);

    expect(JSON.parse(result.stderr).error.code).toBe('INVALID_INPUT');
    expect(result.exitCode).toBe(2);
  });
});

interface ClosedStdoutResult {
  exitCode: number;
  stderr: string;
}

/**
 * Runs the CLI with the read end of its stdout pipe closed before it writes
 * anything, so every write fails with EPIPE. This is the deterministic half of
 * the reproduction: a shell pipeline only breaks once the reader chooses to
 * leave, whereas this leaves no reader at all.
 */
async function runCliWithoutStdoutReader(args: string[]): Promise<ClosedStdoutResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['bin/run.js', ...args], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.stdout.destroy();
    child.once('error', reject);
    child.once('close', (exitCode) => resolve({ stderr, exitCode: exitCode ?? 1 }));
  });
}

interface ReaderResult {
  cliExitCode: number;
  cliStderr: string;
  readerStdout: string;
}

/**
 * Runs `uptimerobot ... | <reader>` in a real shell. The CLI's own stderr and
 * exit code are captured in files, because a POSIX pipeline reports only the
 * reader's status and the CLI's is the one under test.
 */
async function runCliThroughReader(
  args: string[],
  reader: string,
  directory: string,
): Promise<ReaderResult> {
  const stderrFile = join(directory, 'cli-stderr');
  const statusFile = join(directory, 'cli-status');
  const cli = [process.execPath, join(projectRoot, 'bin/run.js'), ...args].map(quote).join(' ');
  const script = `{ ${cli} 2>${quote(stderrFile)}; echo $? >${quote(statusFile)}; } | ${reader}`;

  const readerStdout = await new Promise<string>((resolve, reject) => {
    const shell = spawn('sh', ['-c', script], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    shell.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    shell.once('error', reject);
    shell.once('close', () => resolve(stdout));
  });

  return {
    cliExitCode: Number(readFileSync(statusFile, 'utf8').trim()),
    cliStderr: readFileSync(stderrFile, 'utf8'),
    readerStdout,
  };
}

function quote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
