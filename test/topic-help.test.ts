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

  it('warns that bulk reports acceptance on the topic as well as its commands', async () => {
    const [topic, listing] = await Promise.all([
      runCli(['monitors', 'bulk', '--help']),
      runCli(['monitors', '--help']),
    ]);
    const help = topic.stdout.replace(/\s+/g, ' ');

    expect(topic.exitCode).toBe(0);
    expect(help).toContain('report acceptance, not completion');
    expect(help).toContain(
      'Confirm with `uptimerobot monitors get <id>` before depending on the new state.',
    );
    // The topic listing shows only the first line, so it must stay a summary.
    expect(listing.stdout.replace(/\s+/g, ' ')).toContain('monitors bulk Run bulk monitor actions');
    expect(listing.stdout).not.toContain('report acceptance, not completion');
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

  it('describes the third-party service topics instead of borrowing a subcommand summary', async () => {
    const [monitors, service, root] = await Promise.all([
      runCli(['monitors', '--help']),
      runCli(['monitors', 'third-party-service', '--help']),
      runCli(['--help']),
    ]);

    expect(monitors.stdout.replace(/\s+/g, ' ')).toContain(
      'monitors third-party-service Inspect a tracked third-party service and its incidents',
    );
    expect(service.stdout.replace(/\s+/g, ' ')).toContain(
      'monitors third-party-service incidents List and inspect provider incidents',
    );
    expect(root.stdout.replace(/\s+/g, ' ')).toContain(
      'third-party-providers Search the third-party provider catalog',
    );
  });
});
