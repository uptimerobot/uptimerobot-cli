import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from './helpers/run-cli.js';
import { runInteractiveCli } from './helpers/run-interactive-cli.js';

describe('skills install', () => {
  let fakeBin: string;

  beforeEach(() => {
    fakeBin = mkdtempSync(join(tmpdir(), 'uptimerobot-skills-'));
    const fakeNpx = join(fakeBin, 'npx');
    writeFileSync(
      fakeNpx,
      `#!/usr/bin/env node
const readline = require('node:readline');
console.log('npx args: ' + process.argv.slice(2).join(' '));
const reader = readline.createInterface({ input: process.stdin, output: process.stdout });
reader.question('Installer input: ', (answer) => {
  console.log('Installer answer: ' + answer);
  process.exitCode = Number(process.env.FAKE_NPX_EXIT_CODE || 0);
  reader.close();
});
`,
    );
    chmodSync(fakeNpx, 0o755);
  });

  afterEach(() => rmSync(fakeBin, { force: true, recursive: true }));

  it('requires an interactive terminal', async () => {
    const result = await runCli(['skills', 'install'], { UPTIMEROBOT_AGENT: '0' });

    expect(result).toEqual({
      exitCode: 2,
      stderr:
        '{"error":{"code":"CONFIRMATION_REQUIRED","message":"Interactive confirmation is required. Run npx skills add uptimerobot/ai directly in a terminal."}}\n',
      stdout: '',
    });
  });

  it('identifies the external command in help', async () => {
    const result = await runCli(['skills', 'install', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Install UptimeRobot AI skills');
    expect(result.stdout).toContain('npx skills add uptimerobot/ai');
  });

  it.runIf(process.platform === 'darwin' || process.platform === 'linux')(
    'does not run npx when confirmation is declined',
    async () => {
      const result = await runInteractiveCli(
        ['skills', 'install'],
        [{ input: 'n\n', waitFor: 'Continue? [y/N] ' }],
        {
          PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ''}`,
          UPTIMEROBOT_AGENT: '0',
        },
      );

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Installation cancelled.');
      expect(result.output).not.toContain('npx args:');
    },
  );

  it.runIf(process.platform === 'darwin' || process.platform === 'linux')(
    'does not let an agent confirm the external installer',
    async () => {
      const result = await runInteractiveCli(['skills', 'install'], [], {
        PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ''}`,
        UPTIMEROBOT_AGENT: '1',
      });

      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('CONFIRMATION_REQUIRED');
      expect(result.output).not.toContain('npx args:');
    },
  );

  it.runIf(process.platform === 'darwin' || process.platform === 'linux')(
    'hands the terminal to the external installer',
    async () => {
      const result = await runInteractiveCli(
        ['skills', 'install'],
        [
          { input: 'y\n', waitFor: 'Continue? [y/N] ' },
          { input: 'from-terminal\n', waitFor: 'Installer input: ' },
        ],
        {
          PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ''}`,
          UPTIMEROBOT_AGENT: '0',
        },
      );

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('npx args: skills add uptimerobot/ai');
      expect(result.output).toContain('Installer answer: from-terminal');
    },
  );

  it.runIf(process.platform === 'darwin' || process.platform === 'linux')(
    'returns the external installer exit code',
    async () => {
      const result = await runInteractiveCli(
        ['skills', 'install'],
        [
          { input: 'y\n', waitFor: 'Continue? [y/N] ' },
          { input: 'from-terminal\n', waitFor: 'Installer input: ' },
        ],
        {
          FAKE_NPX_EXIT_CODE: '23',
          PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ''}`,
          UPTIMEROBOT_AGENT: '0',
        },
      );

      expect(result.exitCode).toBe(23);
    },
  );

  it.runIf(process.platform === 'darwin' || process.platform === 'linux')(
    'reports when npx is unavailable',
    async () => {
      rmSync(join(fakeBin, 'npx'));
      const result = await runInteractiveCli(
        ['skills', 'install'],
        [{ input: 'y\n', waitFor: 'Continue? [y/N] ' }],
        {
          PATH: fakeBin,
          UPTIMEROBOT_AGENT: '0',
        },
      );

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('INSTALLER_NOT_FOUND');
    },
  );
});
