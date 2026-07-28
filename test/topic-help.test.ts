import { describe, expect, it } from 'vitest';
import { runCli } from './helpers/run-cli.js';

describe('topic help', () => {
  it('describes the monitors create topic instead of borrowing a subcommand summary', async () => {
    const result = await runCli(['monitors', '--help']);
    const help = result.stdout.replace(/\s+/g, ' ');

    expect(result.exitCode).toBe(0);
    expect(help).toContain('monitors create Create a monitor of a given type');
    expect(help).not.toContain('Create a monitor (API)');
  });

  it('describes the monitors stats response-time topic apart from the command of the same name', async () => {
    const result = await runCli(['monitors', 'stats', '--help']);
    const help = result.stdout.replace(/\s+/g, ' ');

    expect(result.exitCode).toBe(0);
    expect(help).toContain(
      'monitors stats response-time Query response time statistics overall or by region',
    );
    expect(help).toContain('monitors stats response-time Get monitor response time statistics');
  });
});
