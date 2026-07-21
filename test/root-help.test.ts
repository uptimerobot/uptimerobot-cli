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
});
