import { describe, expect, it } from 'vitest';
import { runCli } from './helpers/run-cli.js';

// Commands the generator would restructure away if the published contract
// changed shape. A failure here is a decision to make, not a bug to patch:
// openapi:check only compares generated output to the snapshot, so both agree
// after a sync and nothing else notices the command has gone.
describe('command tree guards', () => {
  // `POST /integrations` and `PATCH /integrations/{id}` are both bare oneOfs.
  // If a discriminator is added, the generator emits typed subcommands
  // (`integrations create slack|webhook|...`) and keeps these plain commands
  // beside them, with --set remaining the untyped escape hatch.
  it.each([
    ['create', ['integrations', 'create', '--set', 'type=slack'], 'POST'],
    ['update', ['integrations', 'update', '123', '--set', 'name=renamed'], 'PATCH'],
  ])('keeps integrations %s invokable as a command', async (name, argv, method) => {
    const result = await runCli([...argv, '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(
      expect.objectContaining({ command: `integrations ${name}`, method }),
    );
  });
});
