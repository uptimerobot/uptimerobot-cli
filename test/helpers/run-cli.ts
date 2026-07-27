import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

/** The CLI's own version, read from package.json (matches the runtime user-agent). */
export const cliVersion: string = JSON.parse(
  readFileSync(`${projectRoot}package.json`, 'utf8'),
).version;

/**
 * The execution environment the spawned CLI will report. runCli inherits
 * process.env, so this mirrors the CLI's own CI detection and stays correct
 * both locally (`local`) and in CI (`ci`).
 */
export const cliEnvironment: 'ci' | 'local' = /^(1|true|yes)$/i.test(process.env.CI ?? '')
  ? 'ci'
  : 'local';

export interface CliResult {
  stderr: string;
  stdout: string;
  exitCode: number;
}

export async function runCli(
  args: string[],
  env: Record<string, string | undefined> = {},
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['bin/run.js', ...args], {
      cwd: projectRoot,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    let stdout = '';
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.once('error', reject);
    child.once('close', (exitCode) => resolve({ stderr, stdout, exitCode: exitCode ?? 1 }));
  });
}
