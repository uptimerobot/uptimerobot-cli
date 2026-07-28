import { spawn } from 'node:child_process';
import { constants } from 'node:os';

const SKILLS_INSTALL_ARGS = ['skills', 'add', 'uptimerobot/ai'] as const;
export const SKILLS_INSTALL_COMMAND = ['npx', ...SKILLS_INSTALL_ARGS].join(' ');

export async function runSkillsInstaller(): Promise<number> {
  return new Promise((resolve, reject) => {
    const windows = process.platform === 'win32';
    const executable = windows ? (process.env.ComSpec ?? 'cmd.exe') : 'npx';
    const args = windows
      ? ['/d', '/s', '/c', 'npx.cmd', ...SKILLS_INSTALL_ARGS]
      : SKILLS_INSTALL_ARGS;
    const child = spawn(executable, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', (exitCode, signal) => {
      const signalNumber = signal === null ? undefined : constants.signals[signal];
      resolve(exitCode ?? (signalNumber === undefined ? 1 : 128 + signalNumber));
    });
  });
}
