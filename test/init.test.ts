import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from '@oclif/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from './helpers/run-cli.js';

const keyring = vi.hoisted(() => new Map<string, string>());

vi.mock('@napi-rs/keyring', () => ({
  AsyncEntry: class {
    readonly key: string;

    constructor(service: string, account: string) {
      this.key = `${service}:${account}`;
    }

    async deleteCredential(): Promise<boolean> {
      return keyring.delete(this.key);
    }

    async getPassword(): Promise<string | undefined> {
      return keyring.get(this.key);
    }

    async setPassword(password: string): Promise<void> {
      keyring.set(this.key, password);
    }
  },
}));

vi.mock('../src/lib/agent-targets.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/agent-targets.js')>();
  return { ...original, detectAgentTargets: vi.fn(original.detectAgentTargets) };
});

/**
 * The selector is spied on rather than replaced: the real implementation
 * returns undefined off a terminal, so every non-interactive test behaves
 * exactly as it did before this seam existed.
 */
vi.mock('../src/lib/invocation.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/invocation.js')>();
  return {
    ...original,
    promptSelection: vi.fn(original.promptSelection),
    requestConfirmation: vi.fn(original.requestConfirmation),
  };
});

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const STORED_CREDENTIAL = 'com.uptimerobot.cli:default:api-key';
const SIGNUP_URL = 'https://uptimerobot.com/signUp';
const SEED_CONTEXT_FILE = 'uptimerobot-scan.md';
const SETUP_GUIDE_FILE = 'uptimerobot-setup.md';
/** Both artifacts init writes, sorted so readdir comparisons are order-stable. */
const BOTH_FILES = [SEED_CONTEXT_FILE, SETUP_GUIDE_FILE].sort();
const AGENT_PROMPT = `Read ${SETUP_GUIDE_FILE} and ${SEED_CONTEXT_FILE}, then set up UptimeRobot monitoring for this repository by following the setup guide.`;
const SEED_BEGIN_PREFIX = '<!-- uptimerobot:scan:begin';
const SEED_END_MARKER = '<!-- uptimerobot:scan:end -->';
const SETUP_BEGIN_PREFIX = '<!-- uptimerobot:setup:begin';
const SETUP_END_MARKER = '<!-- uptimerobot:setup:end -->';
const SKILLS_BEGIN_PREFIX = '<!-- uptimerobot:skills:begin';

/** Presents stdin and stdout as a terminal so the interactive path is reachable. */
function stubTerminal(): () => void {
  const streams = [process.stdin, process.stdout];
  const descriptors = streams.map((stream) => Object.getOwnPropertyDescriptor(stream, 'isTTY'));
  for (const stream of streams) {
    Object.defineProperty(stream, 'isTTY', { configurable: true, value: true });
  }
  return () => {
    streams.forEach((stream, index) => {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(stream, 'isTTY', descriptor);
      else Reflect.deleteProperty(stream, 'isTTY');
    });
  };
}

describe('init', () => {
  let configDirectory: string;
  let repository: string;
  let logged: string[];
  let detectAgentTargets: typeof import('../src/lib/agent-targets.js').detectAgentTargets;
  let strayFetch: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(async () => {
    configDirectory = await mkdtemp(join(tmpdir(), 'uptimerobot-cli-test-'));
    // Everything init writes lands in the working directory, so the suite has
    // to run against a throwaway one rather than this repository.
    repository = await mkdtemp(join(tmpdir(), 'uptimerobot-cli-repo-'));
    vi.stubEnv('UPTIMEROBOT_CONFIG_DIR', configDirectory);
    vi.stubEnv('UPTIMEROBOT_API_KEY', undefined);
    vi.stubEnv('UPTIMEROBOT_DEV_API_URL', undefined);
    vi.stubEnv('UPTIMEROBOT_AGENT', '0');
    vi.stubEnv('UPTIMEROBOT_OUTPUT', undefined);
    // Pins the emitted commands, which otherwise depend on whether the machine
    // running the tests happens to have the CLI on PATH.
    vi.stubEnv('UPTIMEROBOT_CLI_COMMAND', 'uptimerobot');
    // Pins the launch command: a stray UPTIMEROBOT_SKILLS_DIR in the dev shell
    // would otherwise splice a --plugin-dir argument into it.
    vi.stubEnv('UPTIMEROBOT_SKILLS_DIR', undefined);
    vi.spyOn(process, 'cwd').mockReturnValue(repository);
    vi.spyOn(Command.prototype, 'logToStderr').mockImplementation(() => {});
    logged = [];
    vi.spyOn(Command.prototype, 'log').mockImplementation((message?: string) => {
      logged.push(message ?? '');
    });
    ({ detectAgentTargets } = await import('../src/lib/agent-targets.js'));
    vi.mocked(detectAgentTargets).mockReset();
    vi.mocked(detectAgentTargets).mockResolvedValue([]);
    // Module-level vi.fn mocks keep their calls across tests, so this one is
    // cleared too — otherwise `mock.calls[0]` is whatever an earlier test did.
    const { promptSelection, requestConfirmation } = await import('../src/lib/invocation.js');
    vi.mocked(promptSelection).mockReset();
    vi.mocked(promptSelection).mockResolvedValue(undefined);
    vi.mocked(requestConfirmation).mockReset();
    vi.mocked(requestConfirmation).mockResolvedValue(false);
    // No test here may reach a real API; a stray call fails the test in afterEach.
    strayFetch = vi.fn<typeof fetch>(async () => new Response('{}', { status: 599 }));
    vi.stubGlobal('fetch', strayFetch);
  });

  afterEach(async () => {
    keyring.clear();
    try {
      expect(strayFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      await rm(configDirectory, { force: true, recursive: true });
      await rm(repository, { force: true, recursive: true });
    }
  });

  it('routes a caller without a credential from any source to signup', async () => {
    const { default: Init } = await import('../src/commands/init.js');

    await expect(Init.run(['--json'], { root: projectRoot })).rejects.toMatchObject({
      cliError: {
        code: 'AUTH_REQUIRED',
        details: { signupUrl: SIGNUP_URL },
        message: expect.stringContaining(SIGNUP_URL),
        suggestions: ['uptimerobot auth login'],
      },
      oclif: { exit: 2 },
    });
    expect(keyring.size).toBe(0);
    expect(vi.mocked(detectAgentTargets)).not.toHaveBeenCalled();
  });

  it('accepts UPTIMEROBOT_API_KEY instead of a stored credential', async () => {
    vi.stubEnv('UPTIMEROBOT_API_KEY', 'u123-from-environment');
    vi.mocked(detectAgentTargets).mockResolvedValue(['codex']);
    const { default: Init } = await import('../src/commands/init.js');

    await expect(Init.run(['--json'], { root: projectRoot })).resolves.toMatchObject({
      target: 'codex',
    });
    expect(keyring.size).toBe(0);
  });

  it('accepts --api-key instead of a stored credential', async () => {
    vi.mocked(detectAgentTargets).mockResolvedValue(['codex']);
    const { default: Init } = await import('../src/commands/init.js');

    await expect(
      Init.run(['--api-key', 'u123-explicit', '--json'], { root: projectRoot }),
    ).resolves.toMatchObject({ target: 'codex' });
    expect(keyring.size).toBe(0);
  });

  it('uninstalls without any credential because it only removes local files', async () => {
    const { default: Init } = await import('../src/commands/init.js');

    await expect(Init.run(['--clean', '--json'], { root: projectRoot })).resolves.toMatchObject({
      seedContext: { outcome: 'absent' },
      skills: { agentsFile: null, outcome: 'absent' },
    });
    expect(keyring.size).toBe(0);
  });

  it('stops after --clean instead of continuing into setup', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { default: Init } = await import('../src/commands/init.js');

    await expect(Init.run(['--clean', '--json'], { root: projectRoot })).resolves.toMatchObject({
      repoRoot: repository,
    });
    expect(vi.mocked(detectAgentTargets)).not.toHaveBeenCalled();
    expect(await readdir(repository)).toEqual([]);
  });

  it.each([
    {
      args: ['--clean', '--target', 'cursor'],
      reason: '--target=cursor cannot also be provided when using --clean',
    },
    {
      args: ['--clean', '--no-agent'],
      reason: '--no-agent=true cannot also be provided when using --clean',
    },
    {
      args: ['--target', 'cursor', '--no-agent'],
      reason: '--target=cursor cannot also be provided when using --no-agent',
    },
  ])('rejects $args as mutually exclusive', async ({ args, reason }) => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { default: Init } = await import('../src/commands/init.js');

    await expect(Init.run([...args, '--json'], { root: projectRoot })).rejects.toMatchObject({
      message: expect.stringContaining(reason),
      oclif: { exit: 2 },
    });
    expect(vi.mocked(detectAgentTargets)).not.toHaveBeenCalled();
  });

  it('rejects a target that is not a supported coding agent', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { default: Init } = await import('../src/commands/init.js');

    await expect(
      Init.run(['--target', 'windsurf', '--json'], { root: projectRoot }),
    ).rejects.toMatchObject({
      message: expect.stringContaining(
        'Expected --target=windsurf to be one of: claude-code, codex, cursor, opencode, gemini',
      ),
      oclif: { exit: 2 },
    });
  });

  // Ambiguity used to be a hard stop. Claude Code is the default the flow is
  // written around, so when it is one of the detected agents it wins rather
  // than making the caller arbitrate.
  it('prefers Claude Code when several agents are detected', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    vi.mocked(detectAgentTargets).mockResolvedValue(['claude-code', 'cursor']);
    const { default: Init } = await import('../src/commands/init.js');

    await expect(Init.run(['--json'], { root: projectRoot })).resolves.toMatchObject({
      target: 'claude-code',
    });
  });

  // At a terminal, several agents is a real question — Claude Code is only the
  // pre-selected answer, not one made silently on the user's behalf.
  it('asks rather than assuming when several agents are detected at a terminal', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    vi.mocked(detectAgentTargets).mockResolvedValue(['claude-code', 'cursor']);
    const { promptSelection } = await import('../src/lib/invocation.js');
    vi.mocked(promptSelection).mockResolvedValue('cursor');
    const restoreTerminal = stubTerminal();
    try {
      const { default: Init } = await import('../src/commands/init.js');

      await expect(Init.run(['--no-launch'], { root: projectRoot })).resolves.toMatchObject({
        target: 'cursor',
      });
      expect(vi.mocked(promptSelection).mock.calls[0]?.[2]?.default).toBe('claude-code');
    } finally {
      restoreTerminal();
    }
  });

  it('never asks when the machine has exactly one agent', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    vi.mocked(detectAgentTargets).mockResolvedValue(['cursor']);
    const { promptSelection } = await import('../src/lib/invocation.js');
    const restoreTerminal = stubTerminal();
    try {
      const { default: Init } = await import('../src/commands/init.js');

      await expect(Init.run(['--no-launch'], { root: projectRoot })).resolves.toMatchObject({
        target: 'cursor',
      });
      expect(vi.mocked(promptSelection)).not.toHaveBeenCalled();
    } finally {
      restoreTerminal();
    }
  });

  // Restored guard: a machine-readable or unattended run must never block on a
  // prompt, even when stdout happens to be a terminal.
  it.each(['--yes', '--json'])('never prompts under %s, even on a terminal', async (flag) => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { promptSelection } = await import('../src/lib/invocation.js');
    const restoreTerminal = stubTerminal();
    try {
      const { default: Init } = await import('../src/commands/init.js');

      await expect(Init.run([flag], { root: projectRoot })).rejects.toMatchObject({
        cliError: { code: 'TARGET_REQUIRED', details: { candidates: [] } },
        oclif: { exit: 2 },
      });
      expect(vi.mocked(promptSelection)).not.toHaveBeenCalled();
    } finally {
      restoreTerminal();
    }
  });

  it('still prefers Claude Code without a terminal to ask at', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    vi.mocked(detectAgentTargets).mockResolvedValue(['claude-code', 'codex', 'gemini']);
    const { default: Init } = await import('../src/commands/init.js');

    await expect(Init.run(['--json'], { root: projectRoot })).resolves.toMatchObject({
      target: 'claude-code',
    });
  });

  it('still takes a single detected agent that is not Claude Code', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    vi.mocked(detectAgentTargets).mockResolvedValue(['cursor']);
    const { default: Init } = await import('../src/commands/init.js');

    await expect(Init.run(['--json'], { root: projectRoot })).resolves.toMatchObject({
      target: 'cursor',
    });
  });

  // Nothing detected, or several without Claude Code among them: there is no
  // safe guess left, so say what the choices are instead of just refusing.
  it.each([
    ['nothing is detected', [] as const],
    ['several are detected without Claude Code', ['codex', 'cursor'] as const],
  ])('lists every option when %s', async (_label, candidates) => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    vi.mocked(detectAgentTargets).mockResolvedValue([...candidates]);
    const { default: Init } = await import('../src/commands/init.js');

    await expect(Init.run(['--json'], { root: projectRoot })).rejects.toMatchObject({
      cliError: {
        code: 'TARGET_REQUIRED',
        details: { candidates: [...candidates] },
        expected: 'one of: claude-code, codex, cursor, opencode, gemini',
        message: expect.stringContaining('--target claude-code'),
      },
      oclif: { exit: 2 },
    });
  });

  it('asks at a terminal instead of failing, and uses what was picked', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { promptSelection } = await import('../src/lib/invocation.js');
    vi.mocked(promptSelection).mockResolvedValue('codex');
    const restoreTerminal = stubTerminal();
    try {
      const { default: Init } = await import('../src/commands/init.js');

      await expect(Init.run(['--no-launch'], { root: projectRoot })).resolves.toMatchObject({
        target: 'codex',
      });

      // Every agent is offered, with the detected ones marked and Claude Code
      // pre-selected.
      const [, choices, options] = vi.mocked(promptSelection).mock.calls[0] ?? [];
      expect(choices?.map((choice) => choice.value)).toEqual([
        'claude-code',
        'codex',
        'cursor',
        'opencode',
        'gemini',
      ]);
      expect(options?.default).toBe('claude-code');
    } finally {
      restoreTerminal();
    }
  });

  it('marks the agents it detected in the list it offers', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    vi.mocked(detectAgentTargets).mockResolvedValue(['codex', 'cursor']);
    const { promptSelection } = await import('../src/lib/invocation.js');
    vi.mocked(promptSelection).mockResolvedValue('cursor');
    const restoreTerminal = stubTerminal();
    try {
      const { default: Init } = await import('../src/commands/init.js');
      await Init.run(['--no-launch'], { root: projectRoot });

      const names = vi.mocked(promptSelection).mock.calls[0]?.[1].map((choice) => choice.name);
      expect(names).toContain('codex (detected)');
      expect(names).toContain('cursor (detected)');
      expect(names).toContain('gemini');
    } finally {
      restoreTerminal();
    }
  });

  it('falls back to the printed list when the user backs out of the prompt', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { promptSelection } = await import('../src/lib/invocation.js');
    vi.mocked(promptSelection).mockResolvedValue(undefined);
    const restoreTerminal = stubTerminal();
    try {
      const { default: Init } = await import('../src/commands/init.js');

      await expect(Init.run([], { root: projectRoot })).rejects.toMatchObject({
        cliError: { code: 'TARGET_REQUIRED' },
        oclif: { exit: 2 },
      });
    } finally {
      restoreTerminal();
    }
  });

  it('names every supported agent and the opt-out in that message', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { default: Init } = await import('../src/commands/init.js');

    const failure = await Init.run(['--json'], { root: projectRoot }).catch(
      (error: { cliError: { message: string } }) => error.cliError.message,
    );

    for (const target of ['claude-code', 'codex', 'cursor', 'opencode', 'gemini']) {
      expect(failure).toContain(`--target ${target}`);
    }
    expect(failure).toContain('--no-agent');
  });

  it('accepts a single detected agent without prompting', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    vi.mocked(detectAgentTargets).mockResolvedValue(['codex']);
    const { default: Init } = await import('../src/commands/init.js');

    await expect(Init.run(['--json'], { root: projectRoot })).resolves.toMatchObject({
      target: 'codex',
    });
  });

  it('takes an explicit --target without detecting one', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { default: Init } = await import('../src/commands/init.js');

    await expect(
      Init.run(['--target', 'cursor', '--json'], { root: projectRoot }),
    ).resolves.toMatchObject({ target: 'cursor' });
    expect(vi.mocked(detectAgentTargets)).not.toHaveBeenCalled();
  });

  it('skips agent selection entirely for --no-agent', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { default: Init } = await import('../src/commands/init.js');

    await expect(Init.run(['--no-agent', '--json'], { root: projectRoot })).resolves.toMatchObject({
      skills: null,
      target: null,
    });
    expect(vi.mocked(detectAgentTargets)).not.toHaveBeenCalled();
  });

  it('keeps --agent describing the caller while --target describes the installation', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { default: Init } = await import('../src/commands/init.js');

    await expect(
      Init.run(['--agent', '--target', 'cursor'], { root: projectRoot }),
    ).resolves.toMatchObject({ target: 'cursor' });
  });

  it('writes a marked seed context at the project root', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { default: Init } = await import('../src/commands/init.js');

    const output = await Init.run(['--target', 'codex', '--json'], { root: projectRoot });

    expect(output).toMatchObject({
      repoRoot: repository,
      seedContext: {
        outcome: 'created',
        path: join(repository, SEED_CONTEXT_FILE),
        schemaVersion: 2,
        summary: { accepted: 0, heartbeats: 0, rejected: 0, thirdPartyProviders: 0 },
      },
    });
    const content = await readFile(join(repository, SEED_CONTEXT_FILE), 'utf8');
    expect(content.startsWith(SEED_BEGIN_PREFIX)).toBe(true);
    expect(content).toContain('# Scan seed context (schema 2)');
    expect(content).toContain('## Third-party providers (candidates for third-party services)');
    expect(content).toContain('need no base URL');
    expect(content.trimEnd().endsWith(SEED_END_MARKER)).toBe(true);
  });

  it('leaves an unchanged seed context untouched on a rerun', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { default: Init } = await import('../src/commands/init.js');
    await Init.run(['--target', 'codex', '--json'], { root: projectRoot });
    const first = await readFile(join(repository, SEED_CONTEXT_FILE), 'utf8');

    await expect(
      Init.run(['--target', 'codex', '--json'], { root: projectRoot }),
    ).resolves.toMatchObject({ seedContext: { outcome: 'unchanged' } });
    expect(await readFile(join(repository, SEED_CONTEXT_FILE), 'utf8')).toBe(first);
  });

  it('refuses to overwrite a seed context it did not write', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    await writeFile(join(repository, SEED_CONTEXT_FILE), '# my own notes\n');
    const { default: Init } = await import('../src/commands/init.js');

    await expect(
      Init.run(['--target', 'codex', '--json'], { root: projectRoot }),
    ).rejects.toMatchObject({
      cliError: {
        code: 'SEED_CONTEXT_EXISTS',
        message: expect.stringContaining('was not written by'),
        path: join(repository, SEED_CONTEXT_FILE),
      },
      oclif: { exit: 1 },
    });
    expect(await readFile(join(repository, SEED_CONTEXT_FILE), 'utf8')).toBe('# my own notes\n');
  });

  it('writes a marked setup guide alongside the scan', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { default: Init } = await import('../src/commands/init.js');

    // --no-agent plants no AGENTS.md, so the two written files are the only ones.
    const output = await Init.run(['--no-agent', '--json'], { root: projectRoot });

    expect(output).toMatchObject({
      setupGuide: { outcome: 'created', path: join(repository, SETUP_GUIDE_FILE) },
    });
    const content = await readFile(join(repository, SETUP_GUIDE_FILE), 'utf8');
    expect(content.startsWith(SETUP_BEGIN_PREFIX)).toBe(true);
    expect(content).toContain('# UptimeRobot setup guide');
    // The guide is the whole contract; spot-check that its load-bearing rules
    // survived into the file init actually wrote.
    expect(content).toContain('--tag-names agent-setup');
    expect(content).toContain('Cap at 50 monitors per run');
    expect(content).toContain('|| true');
    expect(content.trimEnd().endsWith(SETUP_END_MARKER)).toBe(true);
    expect((await readdir(repository)).sort()).toEqual(BOTH_FILES);
  });

  it('threads --max-monitors into the setup guide cap', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { default: Init } = await import('../src/commands/init.js');

    await Init.run(['--no-agent', '--max-monitors', '3', '--json'], { root: projectRoot });

    const content = await readFile(join(repository, SETUP_GUIDE_FILE), 'utf8');
    expect(content).toContain('Cap at 3 monitors per run');
    expect(content).not.toContain('Cap at 50 monitors per run');
  });

  it('leaves an unchanged setup guide untouched on a rerun', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { default: Init } = await import('../src/commands/init.js');
    await Init.run(['--target', 'codex', '--json'], { root: projectRoot });
    const first = await readFile(join(repository, SETUP_GUIDE_FILE), 'utf8');

    await expect(
      Init.run(['--target', 'codex', '--json'], { root: projectRoot }),
    ).resolves.toMatchObject({ setupGuide: { outcome: 'unchanged' } });
    expect(await readFile(join(repository, SETUP_GUIDE_FILE), 'utf8')).toBe(first);
  });

  it('refuses to overwrite a setup guide it did not write', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    await writeFile(join(repository, SETUP_GUIDE_FILE), '# my own guide\n');
    const { default: Init } = await import('../src/commands/init.js');

    await expect(
      Init.run(['--target', 'codex', '--json'], { root: projectRoot }),
    ).rejects.toMatchObject({
      cliError: {
        code: 'SETUP_GUIDE_EXISTS',
        message: expect.stringContaining('was not written by'),
        path: join(repository, SETUP_GUIDE_FILE),
      },
      oclif: { exit: 1 },
    });
    expect(await readFile(join(repository, SETUP_GUIDE_FILE), 'utf8')).toBe('# my own guide\n');
  });

  it('keeps a setup guide it did not write when uninstalling', async () => {
    await writeFile(join(repository, SETUP_GUIDE_FILE), '# my own guide\n');
    const restoreTerminal = stubTerminal();
    try {
      const { default: Init } = await import('../src/commands/init.js');

      await expect(Init.run(['--clean'], { root: projectRoot })).resolves.toMatchObject({
        setupGuide: { outcome: 'kept' },
      });
      expect(logged.join('\n')).toContain('it was not written by `uptimerobot init`');
      expect(await readFile(join(repository, SETUP_GUIDE_FILE), 'utf8')).toBe('# my own guide\n');
    } finally {
      restoreTerminal();
    }
  });

  it('scans and writes the seed context but sets no agent up for --no-agent', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { default: Init } = await import('../src/commands/init.js');

    const output = await Init.run(['--no-agent', '--json'], { root: projectRoot });

    expect(output).toMatchObject({ seedContext: { outcome: 'created' }, skills: null });
    expect((await readdir(repository)).sort()).toEqual(BOTH_FILES);
  });

  it('plants the AGENTS.md section for an agent that ships no installer', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { default: Init } = await import('../src/commands/init.js');

    await expect(
      Init.run(['--target', 'codex', '--json'], { root: projectRoot }),
    ).resolves.toMatchObject({
      skills: {
        agentsFile: join(repository, 'AGENTS.md'),
        method: 'agents-file',
        outcome: 'created',
      },
    });
    expect(await readFile(join(repository, 'AGENTS.md'), 'utf8')).toContain(SKILLS_BEGIN_PREFIX);
  });

  it('prints the agent installer verbatim and writes no AGENTS.md for claude-code', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const restoreTerminal = stubTerminal();
    try {
      const { default: Init } = await import('../src/commands/init.js');

      // --no-launch keeps this on the printed-installer path even on a terminal,
      // so the assertion is about what init prints, not what it would open.
      await expect(
        Init.run(['--target', 'claude-code', '--no-launch'], { root: projectRoot }),
      ).resolves.toMatchObject({
        launched: false,
        skills: { agentsFile: null, method: 'agent-installer', outcome: 'guided' },
      });
      expect(logged).toContain('  claude --plugin-dir ./ai');
      expect((await readdir(repository)).sort()).toEqual(BOTH_FILES);
    } finally {
      restoreTerminal();
    }
  });

  it('hands off with the prompt to give the agent and the tag to verify against', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const restoreTerminal = stubTerminal();
    try {
      const { default: Init } = await import('../src/commands/init.js');

      const output = await Init.run(['--target', 'claude-code', '--no-launch'], {
        root: projectRoot,
      });
      const printed = logged.join('\n');

      expect(output).toMatchObject({
        invocation: 'uptimerobot',
        prompt: AGENT_PROMPT,
        verifyCommand: 'uptimerobot verify',
      });
      expect(printed).toContain('Next: open Claude Code in this repository and ask it:');
      expect(printed).toContain(`  ${AGENT_PROMPT}`);
      expect(printed).toContain(`Read ${SETUP_GUIDE_FILE} and ${SEED_CONTEXT_FILE}`);
      expect(printed).toContain('tags what it creates `agent-setup`');
      expect(printed).toContain(
        'Check afterwards with `uptimerobot verify` — the report is a claim, the API is the evidence.',
      );
      expect(printed).toContain('uptimerobot-report.md');
    } finally {
      restoreTerminal();
    }
  });

  it('templates every emitted command through the resolved invocation', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    vi.stubEnv('UPTIMEROBOT_CLI_COMMAND', undefined);
    vi.stubEnv('PATH', '');
    vi.stubEnv('Path', '');
    const { default: Init } = await import('../src/commands/init.js');

    const output = await Init.run(['--no-agent', '--json'], { root: projectRoot });

    expect(output).toMatchObject({
      invocation: 'npx @uptimerobot/cli',
      verifyCommand: 'npx @uptimerobot/cli verify',
    });
    expect(await readFile(join(repository, SEED_CONTEXT_FILE), 'utf8')).toContain(
      'npx @uptimerobot/cli init',
    );
    // The guide's commands are templated through the same invocation, so the npx
    // caller is never handed a bare `uptimerobot` their shell cannot run.
    const guide = await readFile(join(repository, SETUP_GUIDE_FILE), 'utf8');
    expect(guide).toContain('npx @uptimerobot/cli monitors create http');
    expect(guide).toContain('npx @uptimerobot/cli verify');
  });

  it('emits one JSON document and no prose under --json', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { default: Init } = await import('../src/commands/init.js');

    await Init.run(['--target', 'codex', '--json'], { root: projectRoot });

    expect(logged).toHaveLength(1);
    expect(JSON.parse(logged[0] ?? '')).toMatchObject({
      nextSteps: expect.any(Array),
      seedContext: { schemaVersion: 2 },
      skills: { instructions: expect.any(Array) },
      target: 'codex',
    });
  });

  it('removes both artifacts and leaves the repository as it found it', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { default: Init } = await import('../src/commands/init.js');
    await Init.run(['--target', 'codex', '--json'], { root: projectRoot });

    await expect(Init.run(['--clean', '--json'], { root: projectRoot })).resolves.toMatchObject({
      seedContext: { outcome: 'removed' },
      setupGuide: { outcome: 'removed' },
      skills: {
        agentsFile: join(repository, 'AGENTS.md'),
        outcome: 'removed',
        removedFile: true,
      },
    });
    expect(await readdir(repository)).toEqual([]);
  });

  it('keeps a seed context it did not write when uninstalling', async () => {
    await writeFile(join(repository, SEED_CONTEXT_FILE), '# my own notes\n');
    const restoreTerminal = stubTerminal();
    try {
      const { default: Init } = await import('../src/commands/init.js');

      await expect(Init.run(['--clean'], { root: projectRoot })).resolves.toMatchObject({
        seedContext: { outcome: 'kept' },
      });
      expect(logged.join('\n')).toContain('it was not written by `uptimerobot init`');
      expect(await readFile(join(repository, SEED_CONTEXT_FILE), 'utf8')).toBe('# my own notes\n');
    } finally {
      restoreTerminal();
    }
  });

  it('routes a precedence failure through the machine error envelope', async () => {
    const result = await runCli(['init', '--clean', '--target', 'cursor', '--json']);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {
        code: 'INVALID_INPUT',
        message: expect.stringContaining(
          '--target=cursor cannot also be provided when using --clean',
        ),
      },
    });
  });

  it('states the precedence rules in help', async () => {
    const result = await runCli(['init', '--help']);
    const help = result.stdout.replace(/\s+/g, ' ');

    expect(result.exitCode).toBe(0);
    expect(help).toContain('--clean is terminal');
    expect(help).toContain('--target and --no-agent are mutually exclusive');
    expect(help).toContain('--json implies non-interactive, exactly like --yes');
    expect(help).toContain('lists the detected candidates instead of prompting or guessing');
    expect(help).toContain('claude-code|codex|cursor|opencode|gemini');
  });

  it('keeps to the hint without opening the agent under --no-launch', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const restoreTerminal = stubTerminal();
    try {
      const { default: Init } = await import('../src/commands/init.js');

      const output = await Init.run(['--target', 'claude-code', '--no-launch'], {
        root: projectRoot,
      });
      const printed = logged.join('\n');

      // Opting out drops the plan entirely, so nothing is probed or spawned and
      // the machine envelope reports no launch command.
      expect(output).toMatchObject({ launchCommand: null, launched: false });
      expect(printed).toContain('Next: open Claude Code in this repository and ask it:');
      expect(printed).not.toContain('Opening Claude Code');
    } finally {
      restoreTerminal();
    }
  });

  it('never spawns under --json but still reports the launch command for claude-code', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    const { default: Init } = await import('../src/commands/init.js');

    const output = await Init.run(['--target', 'claude-code', '--json'], { root: projectRoot });

    expect(output).toMatchObject({
      launchCommand: `claude "${AGENT_PROMPT}"`,
      launched: false,
    });
    // One JSON document, no prose and no launch notice.
    expect(logged).toHaveLength(1);
    expect(JSON.parse(logged[0] ?? '')).toMatchObject({
      launchCommand: `claude "${AGENT_PROMPT}"`,
      launched: false,
    });
  });

  it('threads UPTIMEROBOT_SKILLS_DIR into the reported launch command', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    vi.stubEnv('UPTIMEROBOT_SKILLS_DIR', '/opt/ai');
    const { default: Init } = await import('../src/commands/init.js');

    await expect(
      Init.run(['--target', 'claude-code', '--json'], { root: projectRoot }),
    ).resolves.toMatchObject({
      launchCommand: `claude --plugin-dir /opt/ai "${AGENT_PROMPT}"`,
      launched: false,
    });
  });

  it('does not open the agent on a non-interactive (piped) run, as runCli executes', async () => {
    keyring.set(STORED_CREDENTIAL, 'u123-stored');
    // No stubbed terminal: stdout is not a TTY, so the run is non-interactive
    // and machine-formatted, exactly the shape a piped `runCli` invocation has.
    const { default: Init } = await import('../src/commands/init.js');

    const output = await Init.run(['--target', 'claude-code'], { root: projectRoot });

    expect(output).toMatchObject({ launched: false });
    expect(logged).toHaveLength(1);
    expect(logged.join('\n')).not.toContain('Opening Claude Code');
  });

  describe('offers the third-party services', () => {
    const ROW = {
      id: 801,
      name: 'Stripe',
      logoUrl: null,
      statusPageUrl: 'https://status.stripe.example/',
      state: 'operational',
      matchedComponent: null,
      isTracked: false,
    };

    /** A fake API routed by path; created monitors land in its list. */
    function stubApi(
      options: {
        monitorsStatus?: number;
        tracked?: number[];
        createStatus?: number;
        loop?: boolean;
      } = {},
    ): {
      paths: string[];
      posts: unknown[];
    } {
      const paths: string[] = [];
      const posts: unknown[] = [];
      const monitors: unknown[] = (options.tracked ?? []).map((providerId, index) => ({
        id: 100 + index,
        type: 'THIRD_PARTY_SERVICE',
        config: { thirdPartyService: { providerId } },
      }));
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async (input, init) => {
          const request = input instanceof Request ? input : new Request(input, init);
          const url = new URL(request.url);
          paths.push(`${request.method} ${url.pathname}${url.search}`);
          const json = (status: number, body: unknown): Response =>
            new Response(JSON.stringify(body), {
              headers: { 'content-type': 'application/json' },
              status,
            });
          if (url.pathname.endsWith('/user/me')) {
            return json(200, { data: { dependencyMonitorsCount: 1, dependencyMonitorLimit: 10 } });
          }
          if (url.pathname.endsWith('/monitors') && request.method === 'GET') {
            return json(options.monitorsStatus ?? 200, {
              data: monitors,
              ...(options.loop === true ? { nextCursor: 'again' } : {}),
            });
          }
          if (url.pathname.endsWith('/third-party-providers')) {
            const term = url.searchParams.get('search');
            const rows =
              term === 'stripe'
                ? [ROW]
                : term === 'resend'
                  ? [{ ...ROW, id: 77, name: 'Resend' }]
                  : [];
            return json(200, { data: rows });
          }
          if (url.pathname.endsWith('/monitors') && request.method === 'POST') {
            posts.push(await request.json());
            if (options.createStatus !== undefined) {
              return json(options.createStatus, { message: 'create refused' });
            }
            const monitor = {
              id: 5000 + posts.length,
              type: 'THIRD_PARTY_SERVICE',
              config: { thirdPartyService: { providerId: 801 } },
            };
            monitors.push(monitor);
            return json(201, { data: monitor });
          }
          return json(404, {});
        }),
      );
      return { paths, posts };
    }

    async function writeManifest(): Promise<void> {
      await writeFile(
        join(repository, 'package.json'),
        '{ "dependencies": { "stripe": "17.4.0", "next": "15.1.0" } }',
      );
    }

    const catalogCalls = (paths: readonly string[]): string[] =>
      paths.filter((path) => path.includes('third-party-providers'));

    it('asks once at a terminal, creates on yes, and records the outcome in the seed file', async () => {
      keyring.set(STORED_CREDENTIAL, 'u123-stored');
      await writeManifest();
      const api = stubApi();
      const { requestConfirmation } = await import('../src/lib/invocation.js');
      vi.mocked(requestConfirmation).mockResolvedValue(true);
      const restoreTerminal = stubTerminal();
      try {
        const { default: Init } = await import('../src/commands/init.js');

        const output = await Init.run(['--no-launch', '--no-agent'], { root: projectRoot });

        expect(output).toMatchObject({
          thirdParty: {
            kind: 'completed',
            confirmation: 'confirmed',
            proposal: [{ provider: 'Stripe', status: 'create' }],
            results: [{ provider: 'Stripe', status: 'created', monitorId: 5001 }],
          },
        });
        expect(logged.filter((line) => line.startsWith('| Provider |'))).toHaveLength(1);
        expect(vi.mocked(requestConfirmation)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(requestConfirmation).mock.calls[0]?.[0]).toBe(
          'Create 1 third-party service now',
        );
        expect(api.posts).toHaveLength(1);
        const content = await readFile(join(repository, SEED_CONTEXT_FILE), 'utf8');
        expect(content).toContain('### Outcome of `uptimerobot init`');
        expect(content).toContain('<!-- uptimerobot:scan:third-party-outcome:begin -->');
        expect(content).toContain('<!-- uptimerobot:scan:third-party-outcome:end -->');
        expect(content).toContain('Created: Stripe (monitor 5001).');
        expect(logged.join('\n')).toContain('| Stripe | stripe@17.4.0 | runtime |');
      } finally {
        restoreTerminal();
      }
    });

    it('creates nothing on no and says so in the seed file', async () => {
      keyring.set(STORED_CREDENTIAL, 'u123-stored');
      await writeManifest();
      const api = stubApi();
      const { requestConfirmation } = await import('../src/lib/invocation.js');
      vi.mocked(requestConfirmation).mockResolvedValue(false);
      const restoreTerminal = stubTerminal();
      try {
        const { default: Init } = await import('../src/commands/init.js');

        const output = await Init.run(['--no-launch', '--no-agent'], { root: projectRoot });

        expect(output).toMatchObject({
          thirdParty: { kind: 'completed', confirmation: 'declined' },
        });
        expect(api.posts).toEqual([]);
        const content = await readFile(join(repository, SEED_CONTEXT_FILE), 'utf8');
        expect(content).toContain('Nothing was created.');
        expect(content).toContain('Not created: Stripe (declined at the prompt).');
      } finally {
        restoreTerminal();
      }
    });

    it('makes no catalog call under --no-third-party, --json, or --yes, and points at scan --apply', async () => {
      keyring.set(STORED_CREDENTIAL, 'u123-stored');
      await writeManifest();
      const api = stubApi();
      const restoreTerminal = stubTerminal();
      try {
        const { default: Init } = await import('../src/commands/init.js');

        const skipped = await Init.run(['--no-launch', '--no-agent', '--no-third-party'], {
          root: projectRoot,
        });
        expect(skipped).toMatchObject({ thirdParty: null });
        const machine = await Init.run(['--no-launch', '--no-agent', '--json'], {
          root: projectRoot,
        });
        expect(machine).toMatchObject({ thirdParty: null });
        const yes = await Init.run(['--no-launch', '--no-agent', '--yes'], { root: projectRoot });
        expect(yes).toMatchObject({ thirdParty: null });
        if (!('nextSteps' in yes)) throw new Error('expected the setup output');
        expect(yes.nextSteps.join('\n')).toContain('uptimerobot scan --apply');
        expect(catalogCalls(api.paths)).toEqual([]);
        expect(api.posts).toEqual([]);
      } finally {
        restoreTerminal();
      }
    });

    it('keeps going to the agent setup when the account cannot be read', async () => {
      keyring.set(STORED_CREDENTIAL, 'u123-stored');
      await writeManifest();
      const api = stubApi({ monitorsStatus: 500 });
      const { requestConfirmation } = await import('../src/lib/invocation.js');
      vi.mocked(requestConfirmation).mockResolvedValue(true);
      const restoreTerminal = stubTerminal();
      try {
        const { default: Init } = await import('../src/commands/init.js');

        const output = await Init.run(['--no-launch', '--no-agent'], { root: projectRoot });

        expect(output).toMatchObject({
          thirdParty: { kind: 'failed', error: { code: 'HTTP_500' } },
          seedContext: { outcome: 'created' },
        });
        expect(api.posts).toEqual([]);
        expect(vi.mocked(requestConfirmation)).not.toHaveBeenCalled();
        expect(logged.join('\n')).toContain('Third-party services were not resolved');
      } finally {
        restoreTerminal();
      }
    });

    it('keeps what an earlier run created when a later offer cannot resolve', async () => {
      keyring.set(STORED_CREDENTIAL, 'u123-stored');
      await writeManifest();
      stubApi();
      const { requestConfirmation } = await import('../src/lib/invocation.js');
      vi.mocked(requestConfirmation).mockResolvedValue(true);
      const restoreTerminal = stubTerminal();
      try {
        const { default: Init } = await import('../src/commands/init.js');
        await Init.run(['--no-launch', '--no-agent'], { root: projectRoot });
        expect(await readFile(join(repository, SEED_CONTEXT_FILE), 'utf8')).toContain(
          'Created: Stripe (monitor 5001).',
        );

        const api = stubApi({ monitorsStatus: 500 });
        const rerun = await Init.run(['--no-launch', '--no-agent'], { root: projectRoot });

        expect(rerun).toMatchObject({ thirdParty: { kind: 'failed', error: { code: 'HTTP_500' } } });
        expect(api.posts).toEqual([]);
        const seed = await readFile(join(repository, SEED_CONTEXT_FILE), 'utf8');
        expect(seed).toContain('Not resolved (HTTP_500)');
        expect(seed).toContain('Created: Stripe (monitor 5001).');
      } finally {
        restoreTerminal();
      }
    });

    it('asks nothing when every candidate is already tracked, and records that', async () => {
      keyring.set(STORED_CREDENTIAL, 'u123-stored');
      await writeManifest();
      const api = stubApi({ tracked: [801] });
      const { requestConfirmation } = await import('../src/lib/invocation.js');
      const restoreTerminal = stubTerminal();
      try {
        const { default: Init } = await import('../src/commands/init.js');

        const output = await Init.run(['--no-launch', '--no-agent'], { root: projectRoot });

        expect(output).toMatchObject({
          thirdParty: {
            confirmation: 'not-needed',
            proposal: [{ provider: 'Stripe', status: 'already-tracked' }],
          },
        });
        expect(vi.mocked(requestConfirmation)).not.toHaveBeenCalled();
        expect(api.posts).toEqual([]);
        const content = await readFile(join(repository, SEED_CONTEXT_FILE), 'utf8');
        expect(content).toContain('Already tracked: Stripe.');
      } finally {
        restoreTerminal();
      }
    });

    it('records a failed create and the rows it never reached', async () => {
      keyring.set(STORED_CREDENTIAL, 'u123-stored');
      await writeFile(
        join(repository, 'package.json'),
        '{ "dependencies": { "stripe": "17.4.0", "resend": "4.0.1" } }',
      );
      stubApi({ createStatus: 422 });
      const { requestConfirmation } = await import('../src/lib/invocation.js');
      vi.mocked(requestConfirmation).mockResolvedValue(true);
      const restoreTerminal = stubTerminal();
      try {
        const { default: Init } = await import('../src/commands/init.js');

        const output = await Init.run(['--no-launch', '--no-agent'], { root: projectRoot });

        expect(output).toMatchObject({ seedContext: { outcome: 'created' } });
        const content = await readFile(join(repository, SEED_CONTEXT_FILE), 'utf8');
        expect(content).toContain('Not created: Resend (create refused).');
        expect(content).toContain('Not created: Stripe (not attempted after the failure above).');
      } finally {
        restoreTerminal();
      }
    });

    it('creates with a partial tracked set, since a repeat create is answered with the existing monitor', async () => {
      keyring.set(STORED_CREDENTIAL, 'u123-stored');
      await writeManifest();
      const api = stubApi({ loop: true });
      const { requestConfirmation } = await import('../src/lib/invocation.js');
      vi.mocked(requestConfirmation).mockResolvedValue(true);
      const restoreTerminal = stubTerminal();
      try {
        const { default: Init } = await import('../src/commands/init.js');

        const output = await Init.run(['--no-launch', '--no-agent'], { root: projectRoot });

        expect(output).toMatchObject({
          thirdParty: {
            blocked: null,
            results: [{ provider: 'Stripe', status: 'created', monitorId: 5001 }],
          },
        });
        expect(api.posts).toHaveLength(1);
        const content = await readFile(join(repository, SEED_CONTEXT_FILE), 'utf8');
        expect(content).toContain('Created: Stripe (monitor 5001).');
        expect(content).not.toContain('TRACKED_SET_PARTIAL');
      } finally {
        restoreTerminal();
      }
    });

    it('offers nothing and hints nothing when the scan found no runtime provider', async () => {
      keyring.set(STORED_CREDENTIAL, 'u123-stored');
      const restoreTerminal = stubTerminal();
      try {
        const { default: Init } = await import('../src/commands/init.js');

        const output = await Init.run(['--no-launch', '--no-agent'], { root: projectRoot });

        expect(output).toMatchObject({ thirdParty: null });
        if (!('nextSteps' in output)) throw new Error('expected the setup output');
        expect(output.nextSteps.join('\n')).not.toContain('scan --apply');
      } finally {
        restoreTerminal();
      }
    });

    it('skips the offer in agent mode and keeps an earlier outcome on a later rerun', async () => {
      keyring.set(STORED_CREDENTIAL, 'u123-stored');
      await writeManifest();
      const api = stubApi();
      const { requestConfirmation } = await import('../src/lib/invocation.js');
      vi.mocked(requestConfirmation).mockResolvedValue(true);
      const restoreTerminal = stubTerminal();
      try {
        const { default: Init } = await import('../src/commands/init.js');
        await Init.run(['--no-launch', '--no-agent'], { root: projectRoot });
        const first = await readFile(join(repository, SEED_CONTEXT_FILE), 'utf8');
        expect(first).toContain('Created: Stripe (monitor 5001).');

        vi.stubEnv('UPTIMEROBOT_AGENT', '1');
        const rerun = await Init.run(['--no-launch', '--no-agent', '--json'], {
          root: projectRoot,
        });

        expect(rerun).toMatchObject({ thirdParty: null, seedContext: { outcome: 'unchanged' } });
        expect(await readFile(join(repository, SEED_CONTEXT_FILE), 'utf8')).toBe(first);

        vi.stubEnv('UPTIMEROBOT_OUTPUT', 'table');
        const tableRerun = await Init.run(['--no-launch', '--no-agent'], { root: projectRoot });

        expect(tableRerun).toMatchObject({
          thirdParty: null,
          seedContext: { outcome: 'unchanged' },
        });
        expect(api.posts).toHaveLength(1);
      } finally {
        restoreTerminal();
      }
    });

    it('does not offer when the seed file cannot be written', async () => {
      keyring.set(STORED_CREDENTIAL, 'u123-stored');
      await writeManifest();
      await mkdir(join(repository, SEED_CONTEXT_FILE));
      const api = stubApi();
      const restoreTerminal = stubTerminal();
      try {
        const { default: Init } = await import('../src/commands/init.js');

        await expect(
          Init.run(['--no-launch', '--no-agent'], { root: projectRoot }),
        ).rejects.toMatchObject({ cliError: { code: 'SEED_CONTEXT_WRITE_FAILED' } });
        expect(catalogCalls(api.paths)).toEqual([]);
        expect(api.posts).toEqual([]);
      } finally {
        restoreTerminal();
      }
    });

    it('does not offer when the seed file belongs to someone else', async () => {
      keyring.set(STORED_CREDENTIAL, 'u123-stored');
      await writeManifest();
      await writeFile(join(repository, SEED_CONTEXT_FILE), '# someone else wrote this\n');
      const api = stubApi();
      const restoreTerminal = stubTerminal();
      try {
        const { default: Init } = await import('../src/commands/init.js');

        await expect(
          Init.run(['--no-launch', '--no-agent'], { root: projectRoot }),
        ).rejects.toMatchObject({ cliError: { code: 'SEED_CONTEXT_EXISTS' } });
        expect(catalogCalls(api.paths)).toEqual([]);
        expect(api.posts).toEqual([]);
      } finally {
        restoreTerminal();
      }
    });
  });
});
