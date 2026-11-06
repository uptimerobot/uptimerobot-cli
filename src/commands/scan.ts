import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Args, Flags } from '@oclif/core';
import { ApiFailure } from '../api/errors.js';
import { type ApiAccess, AuthenticationError, resolveApiAccess } from '../lib/auth.js';
import { BaseCommand } from '../lib/base-command.js';
import {
  type InvocationMode,
  confirmationAvailable,
  detectInvocationMode,
  requestConfirmation,
} from '../lib/invocation.js';
import { type SeedContext, formatSeedContext, scanRepository } from '../lib/scan/index.js';
import {
  type ApplySelection,
  type Confirmation,
  type Proposal,
  buildApplyOutput,
  confirmationRequiredError,
  formatProposal,
  formatSummary,
  malformedOnly,
  runApply,
  unknownSelections,
} from '../lib/third-party/apply.js';
import { resolveFormat } from '../output/resolve-format.js';

/**
 * Prints the seed context `uptimerobot init` hands its agent, on its own, and
 * with `--apply` turns its third-party providers into third-party services.
 *
 * Without `--apply` the scan is a pure, offline library call: it needs no API
 * key, so this command never touches the credential store, and it has no
 * side effects, so it can be run against any directory as often as the caller
 * likes to see exactly what `init` would work from. With `--apply` it
 * resolves credentials first, like every authenticated command, then reads the
 * account and the catalog, prints a proposal, and creates only what was
 * confirmed.
 */
export default class Scan extends BaseCommand {
  static override args = {
    path: Args.string({
      default: '.',
      description: 'Repository root to scan; defaults to the current directory',
    }),
  };

  static override description = `Report what this repository looks like to monitor discovery: the endpoints that could become monitors, the ones that were skipped and why, the scheduled jobs that could become heartbeats, and the third-party providers it depends on.

Without --apply no authentication is required. The scan reads the working tree and nothing else, never reaches the network, never opens a dotenv file, and writes nothing, so it runs without an API key, which is where it differs from \`uptimerobot init\`.

With --apply the third-party providers are resolved against the catalog and the account, a proposal is printed, and after confirmation one third-party service is created per proposed provider. An agent or a pipe gets no prompt and must pass --confirm.

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
    // Non-greedy, so `--only Stripe ./repo` keeps the path an argument.
    only: Flags.string({
      description: 'Provider to include, repeatable; <provider>=<id> settles an ambiguous row',
      multiple: true,
      multipleNonGreedy: true,
    }),
    skip: Flags.string({
      description: 'Provider to leave out, repeatable',
      multiple: true,
      multipleNonGreedy: true,
    }),
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
      const selection: ApplySelection = {
        includeBuildTime: flags['include-build-time'] === true,
        only: flags.only ?? [],
        skip: flags.skip ?? [],
      };
      const malformed = malformedOnly(selection.only);
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
      // Credentials come first, so a run without an account fails before the
      // scan and before any request, like every other authenticated command.
      const access = await this.resolveAccess(flags['api-key'], mode);
      const context = await scanRepository(repoRoot);
      const unknown = unknownSelections(context.thirdParty.candidates, selection);
      if (unknown.length > 0) {
        return this.fail(
          {
            code: 'INVALID_INPUT',
            expected: 'a provider the scan found',
            message: `No scanned provider matches ${unknown.join(', ')}.`,
            path: 'only',
          },
          2,
        );
      }
      await this.apply(context, access, mode, machineOutput, selection, flags.confirm === true);
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
    try {
      return await resolveApiAccess({ explicitApiKey, mode, version: this.config.pjson.version });
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return this.fail({ code: error.code, message: error.message }, error.exitCode);
      }
      if (error instanceof TypeError && error.message.includes('Invalid URL')) {
        return this.fail(
          {
            code: 'INVALID_INPUT',
            expected: 'an absolute URL',
            message: 'UPTIMEROBOT_DEV_API_URL is not a valid URL.',
            path: 'UPTIMEROBOT_DEV_API_URL',
          },
          2,
        );
      }
      throw error;
    }
  }

  /** Prints, prompts and exits as the Command contract says; the flow itself is `runApply`. */
  private async apply(
    context: SeedContext,
    access: ApiAccess,
    mode: InvocationMode,
    machineOutput: boolean,
    selection: ApplySelection,
    confirmFlag: boolean,
  ): Promise<void> {
    let shown = false;
    const printProposal = (proposal: Proposal, toStderr = false): void => {
      if (machineOutput && !toStderr) return;
      shown = true;
      for (const line of formatProposal(proposal)) {
        if (toStderr) this.logToStderr(line);
        else this.log(line);
      }
    };
    // The prompt is the one every destructive generated command uses; an agent
    // or a pipe gets no prompt and must pass --confirm.
    const confirm = async (proposal: Proposal, toCreate: number): Promise<Confirmation> => {
      if (!confirmationAvailable(mode)) {
        printProposal(proposal);
        return 'required';
      }
      // A person at a terminal must see what they confirm, even when stdout is JSON.
      printProposal(proposal, machineOutput);
      const summary = `Create ${toCreate} third-party ${toCreate === 1 ? 'service' : 'services'}`;
      return (await requestConfirmation(summary, mode)) ? 'confirmed' : 'declined';
    };

    let run;
    try {
      run = await runApply({
        candidates: context.thirdParty.candidates,
        selection,
        access,
        confirmFlag,
        confirm,
      });
    } catch (error) {
      // A refused credential anywhere, the allowance read included, ends the
      // run: a key that cannot read the account is not trusted to write to it.
      if (error instanceof ApiFailure) return this.fail(error.cliError, error.exitCode);
      throw error;
    }
    // The prompt printed the proposal; a run that never asked still shows it.
    if (!shown && (run.confirmation === 'confirmed' || run.confirmation === 'not-needed')) {
      printProposal(run.proposal);
    }

    if (machineOutput) this.log(JSON.stringify(buildApplyOutput(context, run)));
    else {
      this.log('');
      for (const line of formatSummary(run.proposal.proposal, run.results, run.confirmation)) {
        this.log(line);
      }
    }
    // A declined prompt exits like a missing confirmation: the generated
    // destructive commands do the same, and a script must tell "no" from "done".
    if (run.confirmation === 'required' || run.confirmation === 'declined') {
      return this.fail(confirmationRequiredError(run.confirmation), 2);
    }
    if (run.blocked !== undefined) {
      return this.fail(run.blocked, run.blocked.code === 'INVALID_INPUT' ? 2 : 1);
    }
    if (run.failure !== undefined) return this.fail(run.failure.cliError, run.failure.exitCode);
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
