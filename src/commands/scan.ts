import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../lib/base-command.js';
import { detectInvocationMode } from '../lib/invocation.js';
import { type SeedContext, formatSeedContext, scanRepository } from '../lib/scan/index.js';
import { resolveFormat } from '../output/resolve-format.js';

/**
 * Prints the seed context `uptimerobot init` hands its agent, on its own.
 *
 * Two things follow from the scan being a pure, offline library. It needs no
 * API key, so this command never touches the credential store — unlike `init`,
 * which resolves authentication before it does anything. And it has no side
 * effects, so it can be run against any directory, as often as the caller
 * likes, to see exactly what `init` would work from.
 */
export default class Scan extends BaseCommand {
  static override args = {
    path: Args.string({
      default: '.',
      description: 'Repository root to scan; defaults to the current directory',
    }),
  };

  static override description = `Report what this repository looks like to monitor discovery: the endpoints that could become monitors, the ones that were skipped and why, and the scheduled jobs that could become heartbeats.

No authentication is required. The scan reads the working tree and nothing else — it never reaches the network, never opens a dotenv file, and writes nothing — so it runs without an API key, which is where it differs from \`uptimerobot init\`.

Skipped candidates are reported alongside the accepted ones, each with its reason and the file and line it was found at, because knowing why something must not be monitored is as useful as knowing what can be.`;

  static override flags = {
    agent: Flags.boolean({ description: 'Mark this invocation as agent-driven' }),
    json: Flags.boolean({ description: 'Emit structured JSON output' }),
  };

  static override summary = 'Scan a repository for monitor and heartbeat candidates';

  async run(): Promise<SeedContext> {
    const { args, flags } = await this.parse(Scan);
    const repoRoot = await this.resolveRepoRoot(args.path);
    const context = await scanRepository(repoRoot);

    const format = resolveFormat({ json: flags.json }, detectInvocationMode(flags.agent === true));
    if (format === 'json' || format === 'jsonl') this.log(JSON.stringify(context));
    // The Markdown rendering already ends in a newline, and `log` adds one.
    else this.log(formatSeedContext(context).trimEnd());
    return context;
  }

  /**
   * The scanners answer a missing directory with an empty result, which would
   * report a mistyped path as a repository with nothing in it. So the root is
   * checked once here, where the caller can still be told what was wrong with
   * what they typed.
   */
  private async resolveRepoRoot(path: string): Promise<string> {
    const repoRoot = resolve(path);
    try {
      const entry = await stat(repoRoot);
      if (entry.isDirectory()) return repoRoot;
    } catch {
      return this.fail(
        {
          code: 'INVALID_INPUT',
          expected: 'a path to a directory',
          message: `No directory exists at ${repoRoot}.`,
          path: 'path',
        },
        2,
      );
    }
    return this.fail(
      {
        code: 'INVALID_INPUT',
        expected: 'a path to a directory',
        message: `${repoRoot} is not a directory.`,
        path: 'path',
      },
      2,
    );
  }
}
