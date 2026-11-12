import { access, lstat, open, readFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { Flags } from '@oclif/core';
import type { CliInvocation } from '../lib/agent-setup/cli-invocation.js';
import { formatInvocation, resolveCliInvocation } from '../lib/agent-setup/cli-invocation.js';
import type { LaunchPlan } from '../lib/agent-setup/launch.js';
import {
  isLaunchableBinary,
  launchAgent,
  planLaunch,
  resolveAgentBinary,
} from '../lib/agent-setup/launch.js';
import type { SkillsInstallReport } from '../lib/agent-setup/plant.js';
import { SkillsInstallError, installSkills, uninstallSkills } from '../lib/agent-setup/plant.js';
import { AGENT_TARGET_DEFINITIONS } from '../lib/agent-setup/registry.js';
import { renderSetupGuide } from '../lib/agent-setup/setup-guide.js';
import { AGENT_SETUP_TAG } from '../lib/agent-setup/tag.js';
import type { AgentTarget } from '../lib/agent-targets.js';
import { AGENT_TARGETS, DEFAULT_AGENT_TARGET, detectAgentTargets } from '../lib/agent-targets.js';
import {
  type ApiAccess,
  AuthenticationError,
  InvalidApiUrlError,
  resolveApiAccess,
} from '../lib/auth.js';
import { BaseCommand } from '../lib/base-command.js';
import type { SelectionChoice } from '../lib/invocation.js';
import { detectInvocationMode, promptSelection } from '../lib/invocation.js';
import type { SeedContext } from '../lib/scan/index.js';
import { formatSeedContext, scanRepository } from '../lib/scan/index.js';
import {
  type OfferDecision,
  type OfferOutcome,
  decideOffer,
  offerThirdParty,
  renderOutcome,
  wantsApplyHint,
} from '../lib/third-party/init-offer.js';
import { resolveFormat } from '../output/resolve-format.js';

/** No signup address is published in this repository, so the public one is used. */
const SIGNUP_URL = 'https://uptimerobot.com/signUp';

/**
 * Where the pre-scan is left for the agent to read.
 *
 * Named to match the run report the agent writes when it is done
 * (`uptimerobot-report.md`), so the two halves of one setup sit next to each
 * other at the project root and read as the pair they are: what was found,
 * then what was created.
 */
const SEED_CONTEXT_FILE_NAME = 'uptimerobot-scan.md';

/**
 * Where the self-contained setup guide is left for the agent to follow.
 *
 * The scan says what is in the repository; the guide says what to do with it,
 * driving the whole flow through the `uptimerobot` CLI so no skill has to be
 * installed. The two are written together and read together — the handoff
 * points the agent at both — but they stay separate files: the scan is pure
 * data a rerun regenerates from the tree, the guide is the fixed contract.
 */
const SETUP_GUIDE_FILE_NAME = 'uptimerobot-setup.md';

/** What the agent writes at the end; named here only so the hint can say so. */
const RUN_REPORT_FILE_NAME = 'uptimerobot-report.md';

/**
 * A namespace of this command's own, deliberately not `uptimerobot:skills`.
 *
 * The skills block is spliced into AGENTS.md, a file neither command owns
 * outright; two writers sharing one marker would each treat the other's region
 * as theirs to rewrite. Different namespaces keep the two independent even if
 * they ever land in the same file.
 */
const SEED_MARKER_NAMESPACE = 'uptimerobot:scan';
const SEED_BEGIN_PREFIX = `<!-- ${SEED_MARKER_NAMESPACE}:begin`;
const SEED_END_MARKER = `<!-- ${SEED_MARKER_NAMESPACE}:end -->`;

/**
 * The guide gets its own namespace, distinct from the scan's, for the same
 * reason the scan's is distinct from the skills block: if two of these ever
 * shared a file, one marker per writer keeps each region owned by exactly one
 * of them.
 */
const SETUP_MARKER_NAMESPACE = 'uptimerobot:setup';
const SETUP_BEGIN_PREFIX = `<!-- ${SETUP_MARKER_NAMESPACE}:begin`;
const SETUP_END_MARKER = `<!-- ${SETUP_MARKER_NAMESPACE}:end -->`;

/** `kept` means the file exists but carries no marker, so it is not ours. */
type MarkedFileRemoval = 'absent' | 'kept' | 'removed';
type MarkedFileWrite = 'created' | 'unchanged' | 'updated';

/** One marked file to write: its path, its body, and the codes a failure uses. */
interface MarkedFile {
  beginPrefix: string;
  existsCode: string;
  path: string;
  rendered: string;
  writeCode: string;
}

interface MarkedFileOutput {
  outcome: MarkedFileWrite;
  path: string;
}

interface InitSeedOutput extends MarkedFileOutput {
  schemaVersion: number;
  summary: SeedContext['summary'];
}

interface InitSkillsOutput {
  agentsFile: string | null;
  /** Ready-to-print lines; for an agent installer they are the whole point. */
  instructions: readonly string[];
  method: SkillsInstallReport['method'];
  outcome: SkillsInstallReport['outcome'];
}

interface InitOutput {
  /** How this machine reaches the CLI, e.g. `uptimerobot` or `npx @uptimerobot/cli`. */
  invocation: string;
  /** The command init would open the agent with, or null when it will not open one. */
  launchCommand: string | null;
  /** True only when init spawned the agent itself; always false under --json. */
  launched: boolean;
  nextSteps: readonly string[];
  /** The sentence to give the agent, verbatim. */
  prompt: string;
  repoRoot: string;
  seedContext: InitSeedOutput;
  /** The self-contained guide the agent follows; written alongside the scan. */
  setupGuide: MarkedFileOutput;
  /** Null when --no-agent skipped setup. */
  skills: InitSkillsOutput | null;
  target: AgentTarget | null;
  /** The third-party offer, or null when it was not made (see `decideOffer`). */
  thirdParty: OfferOutcome | null;
  /** Proves afterwards what the agent actually created. */
  verifyCommand: string;
}

interface InitCleanOutput {
  repoRoot: string;
  seedContext: { outcome: MarkedFileRemoval; path: string };
  setupGuide: { outcome: MarkedFileRemoval; path: string };
  skills: {
    agentsFile: string | null;
    outcome: 'absent' | 'removed';
    /** True when removing our block emptied AGENTS.md and it was deleted. */
    removedFile: boolean;
  };
}

export default class Init extends BaseCommand {
  static override description = `Prepare this repository to use the UptimeRobot CLI and, unless it is skipped, set up a coding agent to call it.

The repository is scanned for endpoints and scheduled jobs and the result is written to ${SEED_CONTEXT_FILE_NAME} at the project root, for your agent to read. The scan is pure pattern matching: it reaches no network, runs nothing, and never reads .env values.

Precedence:
- --clean is terminal: it removes previously planted configuration, exits, and cannot be combined with --target or --no-agent. It only removes local files, so it needs no API key.
- --target and --no-agent are mutually exclusive.
- --json implies non-interactive, exactly like --yes.
- Without --target, a non-interactive run that cannot resolve exactly one agent fails and lists the detected candidates instead of prompting or guessing.
- By default an interactive run finishes by opening the resolved agent on the scan, when it is Claude Code and \`claude\` is on PATH. --no-launch, --json, --yes and a non-interactive shell keep to the printed hint instead.
- --max-monitors caps how many monitors the guide proposes in one run. It is a ceiling, not a target: candidates over it are reported as skipped, never dropped silently.`;
  static override flags = {
    'api-key': Flags.string({
      description: 'UptimeRobot API key',
      env: 'UPTIMEROBOT_API_KEY',
      helpValue: '<key>',
    }),
    agent: Flags.boolean({ description: 'Mark this invocation as agent-driven' }),
    json: Flags.boolean({ description: 'Emit structured JSON output' }),
    'max-monitors': Flags.integer({
      default: 50,
      description: 'Ceiling on how many monitors the setup guide proposes in one run',
      min: 1,
    }),
    // Each exclusion is declared once, on the flag that wins the pairing, so a
    // conflict reports a single reason instead of the same clash twice.
    'no-agent': Flags.boolean({
      description: 'Skip coding-agent setup entirely; scan and write the seed context only',
      exclusive: ['target'],
    }),
    'no-launch': Flags.boolean({
      description: 'Do not open the coding agent; only write the scan and print the handoff hint',
    }),
    'no-third-party': Flags.boolean({
      description: 'Do not offer to create third-party services for the providers the scan found',
    }),
    target: Flags.option({ options: AGENT_TARGETS })({
      description: 'Coding agent to set up for',
    }),
    clean: Flags.boolean({
      description: 'Remove the files a previous run wrote, then exit',
      exclusive: ['no-agent', 'target'],
    }),
    yes: Flags.boolean({ description: 'Never prompt; run non-interactively' }),
  };
  static override summary = 'Set up this repository and a coding agent to use UptimeRobot';

  async run(): Promise<InitOutput | InitCleanOutput> {
    const { flags } = await this.parse(Init);
    const root = resolve(process.cwd());
    // Resolved before the clean branch because both modes report through
    // the same envelope, and neither of these reads anything but flags and the
    // environment.
    const mode = detectInvocationMode(flags.agent === true);
    const format = resolveFormat({ json: flags.json }, mode);
    const machineOutput = format === 'json' || format === 'jsonl';

    if (flags.clean === true) {
      // Terminal mode: cleaning never falls through to setup. It runs
      // before the authentication gate because it only removes locally
      // planted files, so a logged-out caller can still clean up.
      return this.clean(root, machineOutput);
    }

    // Authentication is resolved before anything is scanned or written, so a
    // caller without an account is routed to signup immediately. The shared
    // resolver owns the precedence between --api-key, UPTIMEROBOT_API_KEY and
    // a stored login, which keeps init consistent with every API command.
    let access: ApiAccess;
    try {
      access = await resolveApiAccess({
        explicitApiKey: flags['api-key'],
        mode,
        version: this.config.pjson.version,
      });
    } catch (error) {
      if (error instanceof AuthenticationError) return this.failAuthentication(error);
      if (error instanceof InvalidApiUrlError) return this.fail(error.cliError, error.exitCode);
      throw error;
    }

    const interactive =
      flags.yes !== true &&
      !machineOutput &&
      mode === 'human' &&
      process.stdin.isTTY === true &&
      process.stdout.isTTY === true;

    // Resolved once and threaded through everything that emits a command, so
    // the seed context, the planted block, the hint, the verification command
    // and the target-choice error cannot disagree about whether this machine
    // has the binary.
    const invocation = await resolveCliInvocation();
    let target: AgentTarget | undefined = flags.target;
    if (target === undefined && flags['no-agent'] !== true) {
      const candidates = await detectAgentTargets();
      if (candidates.length === 1) {
        // One agent on the machine is not a question worth asking.
        target = candidates[0];
      } else if (interactive) {
        // Several agents, or none: which one to set up is genuinely the user's
        // call, so ask rather than deciding for them. Claude Code is only the
        // pre-selected answer, not the silent one.
        target = await promptSelection(
          'Which coding agent should set this up?',
          agentChoices(candidates),
          { default: preferredTarget(candidates) ?? DEFAULT_AGENT_TARGET, mode },
        );
      } else {
        // No one to ask — under --json, --yes, a pipe, CI or an agent runtime.
        // Prefer Claude Code if it is here; otherwise the list below explains.
        target = preferredTarget(candidates);
      }
      if (target === undefined) {
        return this.fail(
          {
            code: 'TARGET_REQUIRED',
            details: { candidates },
            expected: `one of: ${AGENT_TARGETS.join(', ')}`,
            message: chooseTargetMessage(candidates, invocation),
          },
          2,
        );
      }
    }

    // Deterministic and offline. It exists to bound the agent's search rather
    // than to answer the question itself, which is why the file it writes
    // keeps the rejections too.
    const context = await scanRepository(root);
    const seedPath = join(root, SEED_CONTEXT_FILE_NAME);
    const previousSeed = await readMarkedFile(seedPath);
    const decision: OfferDecision = decideOffer({
      interactive,
      optedOut: flags['no-third-party'] === true,
      hasRuntimeCandidates: context.thirdParty.candidates.some((c) => c.class === 'runtime'),
      previousSeed,
      seedBeginPrefix: SEED_BEGIN_PREFIX,
      seedWritable: await canWriteSeed(seedPath, root),
    });
    // The guide is checked before anything is created on the account, as the
    // seed file was through the offer decision: a foreign guide found after the
    // offer would end the run with monitors made and no guide to use them.
    const setupGuideFile = this.setupGuideFile(root, invocation, flags['max-monitors']);
    if (decision === 'offer') await this.ownedMarkedFile(setupGuideFile);
    const thirdParty =
      decision === 'offer'
        ? await offerThirdParty({ context, access, mode, invocation, io: this })
        : null;
    // Only this run's offer is recorded: the live monitor list, not the seed
    // file, is the record of what exists.
    const outcomeLines = thirdParty === null ? [] : renderOutcome(thirdParty, invocation);
    const seedContext = await this.writeSeedContext(root, context, invocation, outcomeLines);
    // Written next to the scan and on the same terms, so the two halves of the
    // handoff always arrive together. Unconditional, like the scan: a --no-agent
    // run still leaves the guide for whichever agent the user opens later.
    const setupGuide = await this.writeMarkedFile(setupGuideFile);

    // A resolved target means agent setup was asked for; --no-agent leaves it
    // undefined, and that is the only difference between the two paths.
    const report =
      target === undefined
        ? undefined
        : await this.attempt(() =>
            installSkills({ cwd: root, invocation, target, version: this.config.pjson.version }),
          );

    // How this run would open the agent, decided before the envelope is built
    // so --json can still report the intent. Null when there is nothing to
    // open: --no-agent resolved no target, --no-launch opted out, or the target
    // has no confirmed launch command (everything but Claude Code).
    const plan =
      target === undefined || flags['no-launch'] === true
        ? null
        : planLaunch(target, agentPrompt());

    // The binary is looked up, never executed, and only where a spawn could
    // actually follow: an interactive human shell. --json, --yes, a piped shell
    // and CI all leave `interactive` false and keep to the printed hint.
    const binary =
      plan !== null && interactive ? await resolveAgentBinary(plan.command) : undefined;
    const willLaunch =
      plan !== null && interactive && binary !== undefined && isLaunchableBinary(binary);

    const output: InitOutput = {
      invocation: invocation.command,
      launchCommand: plan === null ? null : describeLaunch(plan),
      launched: willLaunch,
      nextSteps: nextSteps(target, invocation, wantsApplyHint(decision)),
      prompt: agentPrompt(),
      repoRoot: root,
      seedContext,
      setupGuide,
      skills:
        report === undefined
          ? null
          : {
              agentsFile: report.agentsFilePath ?? null,
              instructions: report.instructions,
              method: report.method,
              outcome: report.outcome,
            },
      target: target ?? null,
      thirdParty,
      verifyCommand: verifyCommand(invocation),
    };

    if (machineOutput) {
      this.log(JSON.stringify(output));
      return output;
    }

    if (willLaunch && plan !== null && target !== undefined) {
      // The hint is replaced by the session itself: report what was scanned,
      // then hand the terminal to the agent and take on its exit code.
      for (const line of scanSummaryLines(output, context)) this.log(line);
      this.log('');
      this.log(`Opening ${AGENT_TARGET_DEFINITIONS[target].label} on ${SEED_CONTEXT_FILE_NAME}.`);
      const exitCode = await launchAgent(plan);
      if (exitCode !== undefined) {
        process.exitCode = exitCode;
        return output;
      }
      // The binary was found but never started (bad shebang, a Windows .cmd
      // shim, EACCES): the hint stands in for the session that did not open.
      this.log('');
      this.log(
        `${AGENT_TARGET_DEFINITIONS[target].label} could not be started; use the prompt below instead.`,
      );
      for (const line of handoffTail(output)) this.log(line);
      return { ...output, launched: false };
    }

    for (const line of handoffLines(output, context)) this.log(line);
    if (plan !== null && interactive && target !== undefined && !willLaunch) {
      // A launch was wanted but nothing could open, so the hint stands and
      // one line explains why.
      this.log('');
      this.log(
        binary === undefined
          ? `\`${plan.command}\` is not on PATH, so ${AGENT_TARGET_DEFINITIONS[target].label} was not opened; run the command above once it is installed.`
          : `\`${binary}\` is a Windows shim that cannot be opened from here, so ${AGENT_TARGET_DEFINITIONS[target].label} was not opened; run the command above yourself.`,
      );
    }
    return output;
  }

  /** Turns the setup library's typed failures into the CLI's error envelope. */
  private async attempt<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SkillsInstallError) {
        return this.fail({ code: error.code, message: error.message, path: error.path }, 1);
      }
      throw error;
    }
  }

  /**
   * Only a total absence of credentials means the caller may not have an
   * account yet, so only that case is rerouted to signup. Every other
   * authentication failure keeps the resolver's own code, exit code and
   * remedy: a restricted API URL or unavailable storage means the caller
   * already has a key that init cannot read, and signup would misdirect them.
   */
  private failAuthentication(error: AuthenticationError): never {
    if (error.code !== 'AUTH_REQUIRED') {
      return this.fail({ code: error.code, message: error.message }, error.exitCode);
    }
    return this.fail(
      {
        code: 'AUTH_REQUIRED',
        details: { signupUrl: SIGNUP_URL },
        message: `No UptimeRobot API key was found. Create an account at ${SIGNUP_URL}, then run \`uptimerobot auth login\`, set UPTIMEROBOT_API_KEY, or pass --api-key.`,
        suggestions: ['uptimerobot auth login'],
      },
      error.exitCode,
    );
  }

  /**
   * The whole file, marker included. Nothing is spliced: this command owns
   * every byte of it, and the marker is there so a rerun can tell its own
   * output from a file someone else put at that name.
   */
  private renderSeedContext(
    context: SeedContext,
    invocation: CliInvocation,
    outcomeLines: readonly string[],
  ): string {
    return [
      `${SEED_BEGIN_PREFIX} version=${this.config.pjson.version} schema=${context.schemaVersion} -->`,
      '',
      `Generated by \`${formatInvocation(invocation, 'init')}\`; rerun it to regenerate, or remove`,
      `this file with \`${formatInvocation(invocation, 'init --clean')}\`. Edits are overwritten.`,
      '',
      formatSeedContext(context).trimEnd(),
      ...(outcomeLines.length === 0 ? [] : ['', ...outcomeLines]),
      '',
      SEED_END_MARKER,
      '',
    ].join('\n');
  }

  /**
   * The guide file: the marker, the same generated-by note the scan carries,
   * then the guide body. The guide itself is templated for this machine's
   * invocation; the wrapper here only adds what tells a rerun the file is ours.
   */
  private renderSetupGuideFile(invocation: CliInvocation, maxMonitors: number): string {
    return [
      `${SETUP_BEGIN_PREFIX} version=${this.config.pjson.version} -->`,
      '',
      `Generated by \`${formatInvocation(invocation, 'init')}\`; rerun it to regenerate, or remove`,
      `this file with \`${formatInvocation(invocation, 'init --clean')}\`. Edits are overwritten.`,
      '',
      renderSetupGuide(invocation, { maxMonitors }).trimEnd(),
      '',
      SETUP_END_MARKER,
      '',
    ].join('\n');
  }

  /**
   * Deletes the seed context, and only ever one this command wrote. A file
   * sitting at that name without our marker is somebody else's, and silently
   * deleting it would be worse than leaving it behind.
   */
  private removeSeedContext(root: string): Promise<InitCleanOutput['seedContext']> {
    return this.removeMarkedFile(
      join(root, SEED_CONTEXT_FILE_NAME),
      SEED_BEGIN_PREFIX,
      'SEED_CONTEXT_REMOVE_FAILED',
    );
  }

  /** The guide, on the same terms as the scan: removed only when it is ours. */
  private removeSetupGuide(root: string): Promise<InitCleanOutput['setupGuide']> {
    return this.removeMarkedFile(
      join(root, SETUP_GUIDE_FILE_NAME),
      SETUP_BEGIN_PREFIX,
      'SETUP_GUIDE_REMOVE_FAILED',
    );
  }

  /**
   * Removes both artifacts and says what went. Never a failure when nothing
   * was planted: cleaning up a repository that was never set up is the
   * expected case, not an error.
   */
  private async clean(root: string, machineOutput: boolean): Promise<InitCleanOutput> {
    // Target-independent, so it also cleans up after a caller who set one
    // agent up and has since switched to another.
    const report = await this.attempt(() => uninstallSkills({ cwd: root }));
    const output: InitCleanOutput = {
      repoRoot: root,
      seedContext: await this.removeSeedContext(root),
      setupGuide: await this.removeSetupGuide(root),
      skills: {
        agentsFile: report.agentsFilePath ?? null,
        outcome: report.outcome,
        removedFile: report.removedFile,
      },
    };

    if (machineOutput) this.log(JSON.stringify(output));
    else for (const line of cleanLines(output)) this.log(line);
    return output;
  }

  /**
   * Writes the seed context, refusing to clobber a file it did not write and
   * leaving an unchanged one untouched — rewriting identical bytes still moves
   * the mtime and can wake a watcher for nothing.
   */
  private async writeSeedContext(
    root: string,
    context: SeedContext,
    invocation: CliInvocation,
    outcomeLines: readonly string[],
  ): Promise<InitSeedOutput> {
    const written = await this.writeMarkedFile({
      beginPrefix: SEED_BEGIN_PREFIX,
      existsCode: 'SEED_CONTEXT_EXISTS',
      path: join(root, SEED_CONTEXT_FILE_NAME),
      rendered: this.renderSeedContext(context, invocation, outcomeLines),
      writeCode: 'SEED_CONTEXT_WRITE_FAILED',
    });
    return { ...written, schemaVersion: context.schemaVersion, summary: context.summary };
  }

  /** The guide, written on the same terms as the scan and next to it. */
  private setupGuideFile(root: string, invocation: CliInvocation, maxMonitors: number): MarkedFile {
    return {
      beginPrefix: SETUP_BEGIN_PREFIX,
      existsCode: 'SETUP_GUIDE_EXISTS',
      path: join(root, SETUP_GUIDE_FILE_NAME),
      rendered: this.renderSetupGuideFile(invocation, maxMonitors),
      writeCode: 'SETUP_GUIDE_WRITE_FAILED',
    };
  }

  /**
   * The one write both marked files share: refuse to clobber a file that is not
   * ours, skip an identical one, otherwise write. The codes differ per file so
   * a failure names which one it was.
   */
  private async writeMarkedFile(file: MarkedFile): Promise<MarkedFileOutput> {
    const original = await this.ownedMarkedFile(file);
    if (original === file.rendered) return { outcome: 'unchanged', path: file.path };

    try {
      await writeRegularFile(file.path, file.rendered, original !== undefined);
    } catch (error) {
      return this.fail(
        {
          code: file.writeCode,
          message: `Could not write ${file.path}: ${describe(error)}`,
          path: file.path,
        },
        1,
      );
    }
    return { outcome: original === undefined ? 'created' : 'updated', path: file.path };
  }

  /**
   * The checks a marked file must pass before it is written, run early enough
   * that a refusal costs nothing: a link is never followed, and a file without
   * our marker is never clobbered. Returns the current contents, if any.
   */
  private async ownedMarkedFile(file: MarkedFile): Promise<string | undefined> {
    // A repository can commit the path as a link to anywhere; following it
    // would create or overwrite a file the user never pointed at.
    if (await isSymbolicLink(file.path)) {
      return this.fail(
        {
          code: file.writeCode,
          message: `${file.path} is a symbolic link. Replace it with a regular file or remove it, then run the command again.`,
          path: file.path,
        },
        1,
      );
    }
    const original = await readMarkedFile(file.path);
    if (original !== undefined && !original.startsWith(file.beginPrefix)) {
      return this.fail(
        {
          code: file.existsCode,
          message: `${file.path} already exists and was not written by \`uptimerobot init\`. Move or delete it, then run the command again.`,
          path: file.path,
        },
        1,
      );
    }
    return original;
  }

  /**
   * The one remove both marked files share: delete only a file carrying our
   * marker, and report a foreign one as `kept` rather than touching it.
   */
  private async removeMarkedFile(
    path: string,
    beginPrefix: string,
    removeCode: string,
  ): Promise<{ outcome: MarkedFileRemoval; path: string }> {
    const original = await readMarkedFile(path);
    if (original === undefined) return { outcome: 'absent', path };
    if (!original.startsWith(beginPrefix)) return { outcome: 'kept', path };

    try {
      await rm(path, { force: true });
    } catch (error) {
      return this.fail(
        { code: removeCode, message: `Could not remove ${path}: ${describe(error)}`, path },
        1,
      );
    }
    return { outcome: 'removed', path };
  }
}

/** The sentence to hand the agent. One line, so it survives a copy-paste. */
function agentPrompt(): string {
  return `Read ${SETUP_GUIDE_FILE_NAME} and ${SEED_CONTEXT_FILE_NAME}, then set up UptimeRobot monitoring for this repository by following the setup guide.`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The human form of the same result the --json path emits: what was scanned,
 * whatever the skills setup asked for verbatim, then the handoff.
 */
function handoffLines(output: InitOutput, context: SeedContext): readonly string[] {
  return [...scanSummaryLines(output, context), ...handoffTail(output)];
}

/** The handoff after the scan summary: installer instructions, then the prompt. */
function handoffTail(output: InitOutput): readonly string[] {
  // An agent-installer report is the whole of what that path produces —
  // nothing was written, so these lines are the instructions themselves.
  const instructions = output.skills ? ['', ...output.skills.instructions] : [];
  return [...instructions, '', ...output.nextSteps];
}

/** The lines that open the handoff: what was scanned, and where each file went. */
function scanSummaryLines(output: InitOutput, context: SeedContext): readonly string[] {
  const { summary } = context;
  return [
    `Scanned ${output.repoRoot}: ${count(summary.accepted, 'candidate')}, ${summary.rejected} skipped, ${count(summary.heartbeats, 'scheduled job')}, ${count(summary.thirdPartyProviders, 'third-party provider')}.`,
    writtenLine(output.setupGuide),
    writtenLine(output.seedContext),
  ];
}

/** Whether a marked file was freshly written or already current, in one line. */
function writtenLine(file: MarkedFileOutput): string {
  return file.outcome === 'unchanged'
    ? `${file.path} is already up to date.`
    : `Wrote ${file.path}.`;
}

/** The launch as one copy-pasteable line, for the machine envelope. */
function describeLaunch(plan: LaunchPlan): string {
  return [plan.command, ...plan.args.map(quoteArgument)].join(' ');
}

/** Quotes only what a shell would need quoted, so the line stays paste-ready. */
function quoteArgument(argument: string): string {
  return /\s/.test(argument) ? `"${argument}"` : argument;
}

function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

/**
 * The handoff itself. Every command it names is templated, so a caller who
 * arrived through npx is never told to run a binary they do not have.
 */
function nextSteps(
  target: AgentTarget | undefined,
  invocation: CliInvocation,
  thirdPartyHint: boolean,
): readonly string[] {
  const opening =
    target === undefined
      ? `Agent setup was skipped. ${SETUP_GUIDE_FILE_NAME} and ${SEED_CONTEXT_FILE_NAME} are ready for whichever coding agent you use — open them in this repository and ask:`
      : `Next: open ${AGENT_TARGET_DEFINITIONS[target].label} in this repository and ask it:`;
  return [
    opening,
    '',
    `  ${agentPrompt()}`,
    '',
    `Following ${SETUP_GUIDE_FILE_NAME}, it proposes monitors and heartbeat pings, asks before creating anything, tags what it creates \`${AGENT_SETUP_TAG}\`, and writes ${RUN_REPORT_FILE_NAME}.`,
    ...(thirdPartyHint
      ? [
          `Create the third-party services the scan found with \`${formatInvocation(invocation, 'scan --apply')}\`; the agent does the same from the guide.`,
        ]
      : []),
    ...(target === undefined
      ? [`Set an agent up later with \`${formatInvocation(invocation, 'init --target <name>')}\`.`]
      : []),
    `Check afterwards with \`${verifyCommand(invocation)}\` — the report is a claim, the API is the evidence.`,
  ];
}

/**
 * The agent to set up when the caller named none, or undefined when the
 * machine has not made the choice obvious.
 *
 * Claude Code wins whenever it is present, because the whole flow is built
 * around it. Failing that, a single detected agent is unambiguous on its own.
 * Nothing detected, or several with no Claude Code among them, is a decision
 * this command has no basis to make — see {@link chooseTargetMessage}.
 */
function preferredTarget(candidates: readonly AgentTarget[]): AgentTarget | undefined {
  if (candidates.includes(DEFAULT_AGENT_TARGET)) return DEFAULT_AGENT_TARGET;
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * The selector's list: every supported agent, with the ones this machine
 * actually looks set up for called out, so a detected agent is easy to spot
 * without hiding the others.
 */
function agentChoices(candidates: readonly AgentTarget[]): readonly SelectionChoice<AgentTarget>[] {
  return AGENT_TARGETS.map((agent) => ({
    name: candidates.includes(agent) ? `${agent} (detected)` : agent,
    value: agent,
  }));
}

/**
 * What to say when there is no obvious agent. Refusing is not enough on its
 * own: the caller needs the list of things they are choosing between, spelled
 * as the flags that pick them, plus the way out if they want no agent at all.
 */
function chooseTargetMessage(
  candidates: readonly AgentTarget[],
  invocation: CliInvocation,
): string {
  const opening =
    candidates.length === 0
      ? 'No coding agent was detected.'
      : `Several coding agents were detected (${candidates.join(', ')}) and none of them is ${DEFAULT_AGENT_TARGET}.`;
  return [
    `${opening} Choose one:`,
    '',
    ...AGENT_TARGETS.map((agent) => `  ${formatInvocation(invocation, `init --target ${agent}`)}`),
    '',
    'Or skip agent setup entirely and write the files only:',
    '',
    `  ${formatInvocation(invocation, 'init --no-agent')}`,
  ].join('\n');
}

function cleanLines(output: InitCleanOutput): readonly string[] {
  const lines: string[] = [];
  if (output.skills.outcome === 'removed') {
    lines.push(
      output.skills.removedFile
        ? `Removed ${output.skills.agentsFile}, which held nothing else.`
        : `Removed the UptimeRobot section from ${output.skills.agentsFile}.`,
    );
  }
  // Guide first, then scan — the order the handoff names them, so the cleanup
  // reads back the way the setup read out.
  for (const file of [output.setupGuide, output.seedContext]) {
    if (file.outcome === 'removed') lines.push(`Removed ${file.path}.`);
    else if (file.outcome === 'kept') {
      lines.push(`Left ${file.path} in place: it was not written by \`uptimerobot init\`.`);
    }
  }
  return lines.length === 0 ? ['Nothing to remove.'] : lines;
}

/**
 * Proves what the agent actually created, rather than what it says it did.
 *
 * `verify` rather than a raw `monitors list --tags`: it already defaults to
 * this tag, pages past the list's cap of 200 monitors, and states what a
 * tag-based count cannot see — so there is nothing left for a second command
 * here to add.
 */
function verifyCommand(invocation: CliInvocation): string {
  return formatInvocation(invocation, 'verify');
}

/** Missing, unreadable and a directory all mean "there is nothing of ours". */
async function readMarkedFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Whether the seed file can be written: an existing path must be a regular
 * file with write access; a missing one needs a writable directory. A path
 * that exists as anything else (a directory, a socket, any symlink) cannot be
 * written, matching the refusal in `writeMarkedFile`.
 */
async function canWriteSeed(seedPath: string, directory: string): Promise<boolean> {
  try {
    const existing = await lstat(seedPath).catch(() => undefined);
    if (existing !== undefined && !existing.isFile()) return false;
    await access(existing === undefined ? directory : seedPath, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes without following a link, so a symlink swapped in after the check
 * above cannot redirect the write: a new file is created exclusively, an
 * existing one is opened with O_NOFOLLOW where the platform has it.
 */
async function writeRegularFile(path: string, content: string, exists: boolean): Promise<void> {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const flags = exists
    ? constants.O_WRONLY | constants.O_TRUNC | noFollow
    : constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL;
  const handle = await open(path, flags, 0o644);
  try {
    if (!(await handle.stat()).isFile()) throw new Error('not a regular file');
    await handle.writeFile(content);
  } finally {
    await handle.close();
  }
}

async function isSymbolicLink(path: string): Promise<boolean> {
  const stats = await lstat(path).catch(() => undefined);
  return stats?.isSymbolicLink() ?? false;
}
