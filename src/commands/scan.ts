import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Args, Flags } from '@oclif/core';
import { createApiClient } from '../api/client.js';
import { ApiFailure } from '../api/errors.js';
import { AuthenticationError, PRODUCTION_API_URL, resolveApiKey } from '../lib/auth.js';
import { BaseCommand } from '../lib/base-command.js';
import {
  type InvocationMode,
  confirmationAvailable,
  detectInvocationMode,
  isCI,
  requestConfirmation,
} from '../lib/invocation.js';
import { type SeedContext, formatSeedContext, scanRepository } from '../lib/scan/index.js';
import {
  type Confirmation,
  type CreateResult,
  type Proposal,
  confirmationRequiredError,
  createProposed,
  formatProposal,
  formatSummary,
  parseOnly,
  prepareProposal,
} from '../lib/third-party/apply.js';
import type { ApiAccess } from '../lib/third-party/resolve.js';
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
/** The `--apply` result, in the shape the Command contract documents. */
export interface ApplyOutput {
  schemaVersion: number;
  repoRoot: string;
  proposal: Proposal['proposal'];
  allowance: Proposal['allowance'];
  tracked: Proposal['tracked'];
  confirmation: Confirmation;
  results: CreateResult[];
}

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
    'api-key': Flags.string({
      description: 'UptimeRobot API key; only read with --apply',
      env: 'UPTIMEROBOT_API_KEY',
    }),
    apply: Flags.boolean({
      description:
        'Resolve the third-party providers the scan found against the catalog and create a third-party service for each, after confirmation',
    }),
    confirm: Flags.boolean({ description: 'Skip the confirmation question before creating' }),
    'include-build-time': Flags.boolean({
      description: 'Also propose build-time providers (CI, code host, registries)',
    }),
    only: Flags.string({
      description: 'Provider to include, repeatable; <provider>=<id> settles an ambiguous row',
      multiple: true,
    }),
    skip: Flags.string({ description: 'Provider to leave out, repeatable', multiple: true }),
    // Named and spelled exactly as the generated commands spell it, so the one
    // hand-written command that prints a document is not the odd one out. It
    // matters most when redirecting: a pipe defaults to JSON, so saving the
    // readable report to a file needs a way to say so.
    format: Flags.string({
      description: 'Output format; json is normalized and jsonl emits one resource per line',
      options: ['json', 'jsonl', 'table', 'plain'],
    }),
    json: Flags.boolean({ description: 'Emit structured JSON output' }),
  };

  static override summary = 'Scan a repository for monitor and heartbeat candidates';

  async run(): Promise<SeedContext> {
    const { args, flags } = await this.parse(Scan);
    const repoRoot = await this.resolveRepoRoot(args.path);
    const mode = detectInvocationMode(flags.agent === true);
    const format = resolveFormat({ format: flags.format, json: flags.json }, mode);
    const machineOutput = format === 'json' || format === 'jsonl';

    if (flags.apply === true) {
      // Credentials come first, so a run without an account fails before the
      // scan and before any request, like every other authenticated command.
      const access = await this.resolveAccess(flags['api-key'], mode);
      const context = await scanRepository(repoRoot);
      await this.apply(context, access, mode, machineOutput, {
        confirm: flags.confirm === true,
        includeBuildTime: flags['include-build-time'] === true,
        only: flags.only ?? [],
        skip: flags.skip ?? [],
      });
      return context;
    }

    const context = await scanRepository(repoRoot);
    if (machineOutput) this.log(JSON.stringify(context));
    // The Markdown rendering already ends in a newline, and `log` adds one.
    else this.log(formatSeedContext(context).trimEnd());
    return context;
  }

  private async resolveAccess(
    explicitApiKey: string | undefined,
    mode: InvocationMode,
  ): Promise<ApiAccess> {
    const apiUrl = new URL(process.env.UPTIMEROBOT_DEV_API_URL ?? PRODUCTION_API_URL);
    let apiKey: string;
    try {
      apiKey = await resolveApiKey(explicitApiKey, apiUrl.toString());
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return this.fail({ code: error.code, message: error.message }, error.exitCode);
      }
      throw error;
    }
    const client = createApiClient({
      apiKey,
      apiUrl,
      environment: isCI() ? 'ci' : 'local',
      mode,
      version: this.config.pjson.version,
    });
    return { client, apiUrl };
  }

  /** Proposal, confirmation, creates, summary; exits as the Command contract says. */
  private async apply(
    context: SeedContext,
    access: ApiAccess,
    mode: InvocationMode,
    machineOutput: boolean,
    flags: { confirm: boolean; includeBuildTime: boolean; only: string[]; skip: string[] },
  ): Promise<void> {
    const malformed = flags.only.find(
      (entry) => entry.includes('=') && parseOnly(entry).id === undefined,
    );
    if (malformed !== undefined) {
      return this.fail(
        {
          code: 'INVALID_INPUT',
          expected: '<provider> or <provider>=<catalog id>',
          message: `--only ${malformed} names no catalog id.`,
          path: 'only',
        },
        2,
      );
    }
    let proposal: Proposal;
    try {
      // A refused credential anywhere, the allowance read included, ends the
      // run: a key that cannot read the account is not trusted to write to it.
      proposal = await prepareProposal(context.thirdParty.candidates, flags, access);
    } catch (error) {
      if (error instanceof ApiFailure) return this.fail(error.cliError, error.exitCode);
      throw error;
    }
    const toCreate = proposal.proposal.filter((row) => row.status === 'create').length;

    if (!machineOutput) for (const line of formatProposal(proposal)) this.log(line);

    let confirmation: Confirmation = toCreate === 0 ? 'not-needed' : 'confirmed';
    if (toCreate > 0 && !flags.confirm) {
      const summary = `Create ${toCreate} third-party ${toCreate === 1 ? 'service' : 'services'}?`;
      // The prompt is the one every destructive generated command uses; an agent
      // or a pipe gets no prompt and must pass --confirm.
      const asked = confirmationAvailable(mode);
      confirmation =
        asked && (await requestConfirmation(summary.slice(0, -1), mode))
          ? 'confirmed'
          : asked
            ? 'declined'
            : 'required';
    }

    let results: CreateResult[] = [];
    let failure: ApiFailure | undefined;
    if (confirmation === 'confirmed' && toCreate > 0) {
      ({ results, failure } = await createProposed(proposal.proposal, access));
    }

    const output: ApplyOutput = {
      schemaVersion: context.schemaVersion,
      repoRoot: context.repoRoot,
      proposal: proposal.proposal,
      allowance: proposal.allowance,
      tracked: proposal.tracked,
      confirmation,
      results,
    };
    if (machineOutput) this.log(JSON.stringify(output));
    else {
      this.log('');
      for (const line of formatSummary(proposal.proposal, results, confirmation)) this.log(line);
    }
    // A declined prompt exits like a missing confirmation: the generated
    // destructive commands do the same, and a script must tell "no" from "done".
    if (confirmation === 'required' || confirmation === 'declined') {
      return this.fail(confirmationRequiredError(confirmation), 2);
    }
    if (failure !== undefined) return this.fail(failure.cliError, failure.exitCode);
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
