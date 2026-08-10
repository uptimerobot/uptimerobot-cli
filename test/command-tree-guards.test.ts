import { describe, expect, it } from 'vitest';
import { runCli } from './helpers/run-cli.js';

// Commands the generator would restructure away if the published contract
// changed shape. A failure here is a decision to make, not a bug to patch:
// openapi:check only compares generated output to the snapshot, so both agree
// after a sync and nothing else notices the command has gone.
describe('command tree guards', () => {
  // `POST /integrations` is a bare oneOf. If a discriminator is added — the
  // change that would generate `integrations create slack|webhook|...` — the
  // generator turns `integrations create` into a topic and this command
  // disappears, exactly as `monitors create` has no bare command today.
  // Adding the subcommands is welcome; removing this one is breaking, so both
  // are expected to coexist, with --set remaining the untyped escape hatch.
  it('keeps integrations create invokable as a command', async () => {
    const result = await runCli(['integrations', 'create', '--set', 'type=slack', '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({ type: 'slack' }),
        command: 'integrations create',
        method: 'POST',
      }),
    );
  });
});
