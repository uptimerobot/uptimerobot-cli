import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

interface Interaction {
  input: string;
  waitFor: string;
}

export interface InteractiveCliResult {
  exitCode: number;
  output: string;
}

export async function runInteractiveCli(
  args: string[],
  interactions: Interaction[],
  env: Record<string, string>,
): Promise<InteractiveCliResult> {
  const command = [process.execPath, 'bin/run.js', ...args];
  const executable = process.platform === 'darwin' ? '/usr/bin/expect' : 'script';
  const scriptArgs =
    process.platform === 'darwin'
      ? ['-c', expectScript(command, interactions)]
      : ['-q', '-e', '-c', command.map(shellQuote).join(' '), '/dev/null'];

  return new Promise((resolve, reject) => {
    const child = spawn(executable, scriptArgs, {
      cwd: projectRoot,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    let interactionIndex = 0;
    const capture = (chunk: Buffer | string) => {
      output += chunk.toString();
      if (process.platform === 'darwin') return;
      const interaction = interactions[interactionIndex];
      if (interaction && output.includes(interaction.waitFor)) {
        interactionIndex += 1;
        child.stdin.write(interaction.input);
      }
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.once('error', reject);
    child.once('close', (exitCode) => resolve({ exitCode: exitCode ?? 1, output }));
  });
}

function expectScript(command: string[], interactions: Interaction[]): string {
  const steps = interactions
    .map(
      ({ input, waitFor }) =>
        `expect -exact ${tclQuote(waitFor)}\nsend -- ${tclQuote(input.replaceAll('\n', '\r'))}`,
    )
    .join('\n');
  return `set timeout 10\nspawn -noecho ${command.map(tclQuote).join(' ')}\n${steps}\nexpect eof\nset result [wait]\nexit [lindex $result 3]`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function tclQuote(value: string): string {
  return `{${value.replaceAll('\\', '\\\\').replaceAll('}', '\\}')}}`;
}
