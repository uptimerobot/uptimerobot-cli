import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

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
