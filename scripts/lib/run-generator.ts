import { spawn, type StdioOptions } from 'node:child_process';
import process from 'node:process';

export async function runGenerator(
  input: string,
  output: string,
  stdio: StdioOptions = 'ignore',
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--disable-warning=ExperimentalWarning',
        '--experimental-strip-types',
        'scripts/generate-openapi.ts',
        '--input',
        input,
        '--output',
        output,
      ],
      { stdio },
    );
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`Generator exited ${code}`)),
    );
  });
}
