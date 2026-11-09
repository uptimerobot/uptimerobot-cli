import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentProbe } from '../src/lib/agent-setup/registry.js';
import { AGENT_TARGET_DEFINITIONS, systemProbe } from '../src/lib/agent-setup/registry.js';
import {
  AGENT_TARGETS,
  detectAgentTargetDetails,
  detectAgentTargets,
} from '../src/lib/agent-targets.js';

const targets = [...AGENT_TARGETS];
const posixOnly = process.platform === 'win32' ? it.skip : it;
/** chmod cannot deny root anything, so the permission test is meaningless there. */
const unprivileged = process.getuid?.() === 0 ? it.skip : posixOnly;

describe('agent detection', () => {
  let root: string;
  let binDirectory: string;
  let homeDirectory: string;
  let projectDirectory: string;

  /**
   * A probe over a temporary tree: real filesystem behaviour, but a PATH and
   * a home directory that hold nothing except what a test puts there.
   */
  function probe(overrides: Partial<AgentProbe> = {}): AgentProbe {
    return systemProbe({ env: { PATH: binDirectory }, homeDirectory, ...overrides });
  }

  async function createExecutable(directory: string, name: string): Promise<string> {
    const path = join(directory, name);
    await writeFile(path, '#!/bin/sh\nexit 0\n');
    await chmod(path, 0o755);
    return path;
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'uptimerobot-cli-test-'));
    binDirectory = join(root, 'bin');
    homeDirectory = join(root, 'home');
    projectDirectory = join(root, 'project');
    await Promise.all(
      [binDirectory, homeDirectory, projectDirectory].map((directory) => mkdir(directory)),
    );
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it('registers exactly one definition for every declared target', () => {
    expect(Object.keys(AGENT_TARGET_DEFINITIONS).sort()).toEqual(targets.toSorted());
    for (const target of targets) {
      const definition = AGENT_TARGET_DEFINITIONS[target];
      expect(definition.id, target).toBe(target);
      expect(definition.binaries.length, target).toBeGreaterThan(0);
      expect(definition.label.length, target).toBeGreaterThan(0);
    }
  });

  it('detects nothing on a clean PATH with no agent configuration', async () => {
    await expect(detectAgentTargets(projectDirectory, probe())).resolves.toEqual([]);
    await expect(detectAgentTargets(projectDirectory, probe({ env: {} }))).resolves.toEqual([]);
  });

  it('stays callable with no arguments', async () => {
    await expect(detectAgentTargets()).resolves.toBeInstanceOf(Array);
  });

  it.each(targets)('detects %s from an executable on PATH alone', async (target) => {
    await createExecutable(binDirectory, AGENT_TARGET_DEFINITIONS[target].binaries[0]!);

    await expect(detectAgentTargets(projectDirectory, probe())).resolves.toEqual([target]);
  });

  it.each(targets)('detects %s from a per-user configuration path alone', async (target) => {
    const context = { cwd: projectDirectory, probe: probe() };
    await mkdir(AGENT_TARGET_DEFINITIONS[target].userConfigPaths(context)[0]!, { recursive: true });

    await expect(detectAgentTargets(context.cwd, context.probe)).resolves.toEqual([target]);
  });

  it.each(targets)('detects %s from a per-project configuration path alone', async (target) => {
    const context = { cwd: projectDirectory, probe: probe() };
    await mkdir(AGENT_TARGET_DEFINITIONS[target].projectConfigPaths(context)[0]!, {
      recursive: true,
    });

    await expect(detectAgentTargets(context.cwd, context.probe)).resolves.toEqual([target]);
  });

  it('reports an agent once when the executable and the configuration both exist', async () => {
    await createExecutable(binDirectory, 'claude');
    await mkdir(join(homeDirectory, '.claude'));
    await mkdir(join(projectDirectory, '.claude'));

    await expect(detectAgentTargets(projectDirectory, probe())).resolves.toEqual(['claude-code']);
  });

  it('orders detections by declaration order rather than discovery order', async () => {
    await mkdir(join(projectDirectory, '.gemini'));
    await createExecutable(binDirectory, 'opencode');
    await mkdir(join(homeDirectory, '.cursor'));
    await createExecutable(binDirectory, 'claude');

    await expect(detectAgentTargets(projectDirectory, probe())).resolves.toEqual([
      'claude-code',
      'cursor',
      'opencode',
      'gemini',
    ]);
  });

  it('keeps the signal that identified each agent', async () => {
    const binaryPath = await createExecutable(binDirectory, 'codex');
    await mkdir(join(projectDirectory, '.gemini'));

    await expect(detectAgentTargetDetails(projectDirectory, probe())).resolves.toEqual([
      { binaryPath, target: 'codex' },
      { configPath: join(projectDirectory, '.gemini'), target: 'gemini' },
    ]);
  });

  it('resolves project signals against the given directory, not process.cwd()', async () => {
    await mkdir(join(projectDirectory, '.cursor'));
    const elsewhere = join(root, 'elsewhere');
    await mkdir(elsewhere);

    await expect(detectAgentTargets(elsewhere, probe())).resolves.toEqual([]);
    await expect(detectAgentTargets(projectDirectory, probe())).resolves.toEqual(['cursor']);
  });

  it.each([
    { agent: 'claude-code', path: '.claude', variable: 'CLAUDE_CONFIG_DIR' },
    { agent: 'codex', path: '.codex', variable: 'CODEX_HOME' },
  ] as const)(
    'follows $variable away from the home directory',
    async ({ agent, path, variable }) => {
      const relocated = join(root, 'relocated');
      await mkdir(join(homeDirectory, path));
      const env = { PATH: binDirectory, [variable]: relocated };

      await expect(detectAgentTargets(projectDirectory, probe({ env }))).resolves.toEqual([]);
      await mkdir(relocated);
      await expect(detectAgentTargets(projectDirectory, probe({ env }))).resolves.toEqual([agent]);
    },
  );

  it('follows XDG_CONFIG_HOME for opencode', async () => {
    const configHome = join(root, 'xdg');
    await mkdir(join(configHome, 'opencode'), { recursive: true });
    await mkdir(join(homeDirectory, '.config', 'opencode'), { recursive: true });

    const env = { PATH: binDirectory, XDG_CONFIG_HOME: configHome };
    await expect(detectAgentTargets(projectDirectory, probe({ env }))).resolves.toEqual([
      'opencode',
    ]);
    // Without the override the plain ~/.config location is still honoured.
    await expect(detectAgentTargets(projectDirectory, probe())).resolves.toEqual(['opencode']);
  });

  it('ignores a PATH entry that is a directory named like the executable', async () => {
    await mkdir(join(binDirectory, 'claude'));

    await expect(detectAgentTargets(projectDirectory, probe())).resolves.toEqual([]);
  });

  posixOnly('ignores a PATH entry that is not executable', async () => {
    await writeFile(join(binDirectory, 'codex'), '');
    await chmod(join(binDirectory, 'codex'), 0o644);

    await expect(detectAgentTargets(projectDirectory, probe())).resolves.toEqual([]);
  });

  posixOnly('treats a broken symlink as not detected instead of throwing', async () => {
    const missing = join(root, 'missing');
    await symlink(missing, join(binDirectory, 'claude'));
    await symlink(missing, join(homeDirectory, '.codex'));
    await symlink(missing, join(projectDirectory, '.cursor'));

    await expect(detectAgentTargets(projectDirectory, probe())).resolves.toEqual([]);
  });

  unprivileged('treats an unreadable directory as not detected instead of throwing', async () => {
    const restricted = join(root, 'restricted');
    await mkdir(join(restricted, 'bin'), { recursive: true });
    await createExecutable(join(restricted, 'bin'), 'claude');
    await mkdir(join(restricted, '.gemini'), { recursive: true });
    await chmod(restricted, 0o000);

    try {
      const blocked = probe({
        env: { PATH: join(restricted, 'bin') },
        homeDirectory: restricted,
      });
      await expect(detectAgentTargets(join(restricted, 'project'), blocked)).resolves.toEqual([]);
    } finally {
      await chmod(restricted, 0o755);
    }
  });

  it('reports nothing when the probe itself fails', async () => {
    const failing = probe({
      exists: () => Promise.reject(new Error('EACCES')),
      isExecutable: () => Promise.reject(new Error('EACCES')),
    });

    await expect(detectAgentTargets(projectDirectory, failing)).resolves.toEqual([]);
  });

  it('resolves a Windows executable through PATHEXT', async () => {
    // Spelled as PATHEXT lists it: the suite runs on case-sensitive file
    // systems too, where `gemini.cmd` would not be the `gemini.CMD` looked up.
    await createExecutable(binDirectory, 'gemini.CMD');
    const windows = probe({
      env: { PATH: binDirectory, PATHEXT: '.COM;.EXE;.CMD' },
      platform: 'win32',
    });

    await expect(detectAgentTargets(projectDirectory, windows)).resolves.toEqual(['gemini']);
  });
});
