import { lstat, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CliInvocation } from '../src/lib/agent-setup/cli-invocation.js';
import { CLI_PACKAGE_NAME, resolveCliInvocation } from '../src/lib/agent-setup/cli-invocation.js';
import type { PlantFileSystem } from '../src/lib/agent-setup/plant.js';
import {
  AGENTS_FILE_NAME,
  BLOCK_BEGIN_PREFIX,
  BLOCK_END_MARKER,
  SKILLS_INDEX_URL,
  SkillsInstallError,
  installSkills,
  plantedVersion,
  removeBlock,
  renderSkillsBlock,
  systemPlantFileSystem,
  uninstallSkills,
} from '../src/lib/agent-setup/plant.js';
import type { AgentTarget } from '../src/lib/agent-targets.js';
import { AGENT_TARGETS } from '../src/lib/agent-targets.js';
import { AGENT_TARGET_DEFINITIONS } from '../src/lib/agent-setup/registry.js';

const VERSION = '9.9.9';
/** Claude Code is the one target with a confirmed first-party installer. */
const INSTALLER_TARGET = 'claude-code';
/** OpenCode has no installer, so it exercises the AGENTS.md fallback. */
const FALLBACK_TARGET = 'opencode';

/** The invocation a machine without the binary on PATH resolves to. */
async function npxInvocation(): Promise<CliInvocation> {
  return resolveCliInvocation({
    env: { PATH: '/nowhere' },
    isExecutableFile: async () => false,
    platform: 'linux',
  });
}

/** The invocation a machine with the binary installed resolves to. */
async function pathInvocation(): Promise<CliInvocation> {
  return resolveCliInvocation({
    env: { PATH: '/usr/local/bin' },
    isExecutableFile: async () => true,
    platform: 'linux',
  });
}

/** Wraps the real filesystem, failing one operation and recording every path. */
function faultyFileSystem(failing: 'rename' | 'writeFile'): {
  fileSystem: PlantFileSystem;
  written: string[];
} {
  const written: string[] = [];
  return {
    fileSystem: {
      readFile: (path) => systemPlantFileSystem.readFile(path),
      remove: (path) => {
        written.push(path);
        return systemPlantFileSystem.remove(path);
      },
      rename: (from, to) => {
        written.push(to);
        if (failing === 'rename') return Promise.reject(new Error('disk went away'));
        return systemPlantFileSystem.rename(from, to);
      },
      writeFile: (path, content) => {
        written.push(path);
        if (failing === 'writeFile') return Promise.reject(new Error('disk went away'));
        return systemPlantFileSystem.writeFile(path, content);
      },
    },
    written,
  };
}

describe('skills install target registry', () => {
  it('forces every target to declare whether it has a first-party installer', () => {
    for (const target of AGENT_TARGETS) {
      expect(AGENT_TARGET_DEFINITIONS[target]).toHaveProperty('skillsInstaller');
    }
  });

  it('records a documentation URL and at least one step for every installer', () => {
    for (const target of AGENT_TARGETS) {
      const installer = AGENT_TARGET_DEFINITIONS[target].skillsInstaller;
      if (!installer) continue;
      expect(installer.documentationUrl, target).toMatch(/^https:\/\//);
      expect(installer.steps.length, target).toBeGreaterThan(0);
    }
  });

  it('never emits the Claude Code marketplace commands, which do not resolve yet', () => {
    const steps = AGENT_TARGET_DEFINITIONS[INSTALLER_TARGET].skillsInstaller?.steps ?? [];

    expect(steps.join('\n')).not.toContain('plugin marketplace add');
    expect(steps.join('\n')).not.toContain('claude-community');
  });
});

describe('renderSkillsBlock', () => {
  it('stamps the version into the begin marker and closes with the end marker', async () => {
    const block = renderSkillsBlock(await pathInvocation(), VERSION);

    expect(block.startsWith(`${BLOCK_BEGIN_PREFIX} version=${VERSION} -->`)).toBe(true);
    expect(block.endsWith(BLOCK_END_MARKER)).toBe(true);
    expect(plantedVersion(Buffer.from(block, 'utf8'))).toBe(VERSION);
  });

  it('templates every emitted command as npx when the binary is absent from PATH', async () => {
    const block = renderSkillsBlock(await npxInvocation(), VERSION);

    expect(block).toContain(`npx ${CLI_PACKAGE_NAME} monitors list --json`);
    // A bare `uptimerobot ...` would be unrunnable on a machine that reached
    // this CLI through npx, so no command may be left untemplated.
    expect(block).not.toMatch(/^\s*uptimerobot /m);
  });

  it('uses the bare binary name when it is on PATH', async () => {
    const block = renderSkillsBlock(await pathInvocation(), VERSION);

    expect(block).toContain('uptimerobot monitors list --json');
    expect(block).not.toContain('npx ');
  });

  it('points at the skill index that actually serves, not the 404 mirror', async () => {
    const block = renderSkillsBlock(await pathInvocation(), VERSION);

    expect(block).toContain(SKILLS_INDEX_URL);
    expect(block).not.toContain('https://uptimerobot.com/skills/');
    expect(block).not.toContain('https://uptimerobot.com/AGENTS.md');
  });
});

describe('skills install against a project directory', () => {
  let cwd: string;
  let agentsFile: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'uptimerobot-cli-test-'));
    agentsFile = join(cwd, AGENTS_FILE_NAME);
  });

  afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
  });

  async function install(invocation?: CliInvocation, target: AgentTarget = FALLBACK_TARGET) {
    return installSkills({
      cwd,
      invocation: invocation ?? (await pathInvocation()),
      target,
      version: VERSION,
    });
  }

  it('writes through a symlinked AGENTS.md and leaves the link in place', async () => {
    const claudeFile = join(cwd, 'CLAUDE.md');
    await writeFile(claudeFile, '# Project\n');
    await symlink('CLAUDE.md', agentsFile);

    await install();

    expect((await lstat(agentsFile)).isSymbolicLink()).toBe(true);
    const written = await readFile(claudeFile, 'utf8');
    expect(written).toContain('# Project');
    expect(written).toContain(BLOCK_BEGIN_PREFIX);
  });

  it('creates AGENTS.md at the project root when none exists', async () => {
    const report = await install();

    expect(report).toMatchObject({ method: 'agents-file', outcome: 'created' });
    expect(report.agentsFilePath).toBe(agentsFile);
    const content = await readFile(agentsFile, 'utf8');
    expect(content).toContain(BLOCK_BEGIN_PREFIX);
    expect(content).toContain(BLOCK_END_MARKER);
  });

  it('is idempotent: a second plant leaves the file byte-identical', async () => {
    await install();
    const first = await readFile(agentsFile);

    const report = await install();
    const second = await readFile(agentsFile);

    expect(report.outcome).toBe('unchanged');
    expect(second.equals(first)).toBe(true);
    // One block, not two: the markers, not the text, decide what is ours.
    expect(second.toString('utf8').split(BLOCK_BEGIN_PREFIX)).toHaveLength(2);
  });

  it('replaces an older block in place rather than appending a second one', async () => {
    await installSkills({
      cwd,
      invocation: await pathInvocation(),
      target: FALLBACK_TARGET,
      version: '0.0.1',
    });

    await install();

    const content = await readFile(agentsFile);
    expect(plantedVersion(content)).toBe(VERSION);
    expect(content.toString('utf8').split(BLOCK_BEGIN_PREFIX)).toHaveLength(2);
  });

  it('writes nothing at all for a target whose own installer is the supported path', async () => {
    const report = await install(await pathInvocation(), INSTALLER_TARGET);

    expect(report).toMatchObject({ method: 'agent-installer', outcome: 'guided' });
    expect(report.agentsFilePath).toBeUndefined();
    expect(await readdir(cwd)).toEqual([]);
    expect(report.instructions.join('\n')).toContain('claude --plugin-dir ./ai');
  });

  it('templates our own commands in the installer guidance while quoting theirs verbatim', async () => {
    const report = await install(await npxInvocation(), INSTALLER_TARGET);
    const printed = report.instructions.join('\n');

    expect(printed).toContain(`npx ${CLI_PACKAGE_NAME} auth whoami`);
    expect(printed).toContain('git clone https://github.com/uptimerobot/ai.git');
  });

  it('preserves foreign CRLF content byte-for-byte and matches its line endings', async () => {
    const original = Buffer.from('# Ops\r\n\r\n- Keep this exactly as it is.\r\n', 'utf8');
    await writeFile(agentsFile, original);

    await install();

    const content = await readFile(agentsFile);
    expect(content.subarray(0, original.length).equals(original)).toBe(true);
    const block = content.subarray(content.indexOf(BLOCK_BEGIN_PREFIX));
    // Every newline inside our block must be preceded by a carriage return.
    for (let index = block.indexOf(0x0a); index !== -1; index = block.indexOf(0x0a, index + 1)) {
      expect(block[index - 1], `lone LF at ${index}`).toBe(0x0d);
    }
  });

  it('leaves a file without a trailing newline still without one', async () => {
    await writeFile(agentsFile, '# Ops');

    await install();

    const content = await readFile(agentsFile, 'utf8');
    expect(content.startsWith('# Ops\n\n')).toBe(true);
    expect(content.endsWith(BLOCK_END_MARKER)).toBe(true);
  });

  it('only ever touches paths inside the project directory', async () => {
    const touched: string[] = [];
    const recording: PlantFileSystem = {
      readFile: (path) => systemPlantFileSystem.readFile(path),
      remove: (path) => {
        touched.push(path);
        return systemPlantFileSystem.remove(path);
      },
      rename: (from, to) => {
        touched.push(from, to);
        return systemPlantFileSystem.rename(from, to);
      },
      writeFile: (path, content) => {
        touched.push(path);
        return systemPlantFileSystem.writeFile(path, content);
      },
    };

    await installSkills({
      cwd,
      fileSystem: recording,
      invocation: await pathInvocation(),
      target: FALLBACK_TARGET,
      version: VERSION,
    });
    await uninstallSkills({ cwd, fileSystem: recording });

    expect(touched.length).toBeGreaterThan(0);
    for (const path of touched) {
      expect(path.startsWith(`${cwd}/`), path).toBe(true);
      expect(path.startsWith(homedir()), path).toBe(false);
    }
  });

  it('restores the original byte-identically when the rename fails', async () => {
    const original = Buffer.from('# Ops\n\n- Untouchable.\n', 'utf8');
    await writeFile(agentsFile, original);
    const { fileSystem } = faultyFileSystem('rename');

    await expect(
      installSkills({
        cwd,
        fileSystem,
        invocation: await pathInvocation(),
        target: FALLBACK_TARGET,
        version: VERSION,
      }),
    ).rejects.toThrow(SkillsInstallError);

    expect((await readFile(agentsFile)).equals(original)).toBe(true);
    // The temporary file must not survive the failure it caused.
    expect(await readdir(cwd)).toEqual([AGENTS_FILE_NAME]);
  });

  it('restores the original byte-identically when the write fails', async () => {
    const original = Buffer.from('# Ops\r\n\r\n- Untouchable.\r\n', 'utf8');
    await writeFile(agentsFile, original);
    const { fileSystem } = faultyFileSystem('writeFile');

    const failure = await installSkills({
      cwd,
      fileSystem,
      invocation: await pathInvocation(),
      target: FALLBACK_TARGET,
      version: VERSION,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SkillsInstallError);
    expect((failure as SkillsInstallError).code).toBe('AGENTS_WRITE_FAILED');
    expect((await readFile(agentsFile)).equals(original)).toBe(true);
    expect(await readdir(cwd)).toEqual([AGENTS_FILE_NAME]);
  });

  it('refuses to guess when the markers have been damaged', async () => {
    await writeFile(agentsFile, `# Ops\n\n${BLOCK_BEGIN_PREFIX} version=1.0.0 -->\ntruncated\n`);

    const failure = await install().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SkillsInstallError);
    expect((failure as SkillsInstallError).code).toBe('AGENTS_BLOCK_DAMAGED');
  });
});

describe('skills install --uninstall', () => {
  let cwd: string;
  let agentsFile: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'uptimerobot-cli-test-'));
    agentsFile = join(cwd, AGENTS_FILE_NAME);
  });

  afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
  });

  async function install() {
    return installSkills({
      cwd,
      invocation: await pathInvocation(),
      target: FALLBACK_TARGET,
      version: VERSION,
    });
  }

  it('is a no-op when no AGENTS.md exists', async () => {
    const report = await uninstallSkills({ cwd });

    expect(report).toEqual({ outcome: 'absent', removedFile: false });
    expect(await readdir(cwd)).toEqual([]);
  });

  it('is a no-op when AGENTS.md exists but holds no block of ours', async () => {
    const original = Buffer.from('# Someone else\n\nNothing to do with us.\n', 'utf8');
    await writeFile(agentsFile, original);

    const report = await uninstallSkills({ cwd });

    expect(report.outcome).toBe('absent');
    expect((await readFile(agentsFile)).equals(original)).toBe(true);
  });

  it.each([
    ['a trailing newline', '# Ops\n\n- Keep me.\n'],
    ['no trailing newline', '# Ops\n\n- Keep me.'],
    ['CRLF line endings', '# Ops\r\n\r\n- Keep me.\r\n'],
  ])('restores the file byte-identically for a file with %s', async (_label, text) => {
    const original = Buffer.from(text, 'utf8');
    await writeFile(agentsFile, original);
    await install();

    const report = await uninstallSkills({ cwd });

    expect(report).toMatchObject({ outcome: 'removed', removedFile: false });
    expect((await readFile(agentsFile)).equals(original)).toBe(true);
  });

  it('deletes the file it created rather than leaving an empty one behind', async () => {
    await install();

    const report = await uninstallSkills({ cwd });

    expect(report).toMatchObject({ outcome: 'removed', removedFile: true });
    expect(await readdir(cwd)).toEqual([]);
  });

  it('keeps content the user added below the block', async () => {
    await writeFile(agentsFile, '# Ops\n');
    await install();
    const planted = await readFile(agentsFile, 'utf8');
    await writeFile(agentsFile, `${planted}\n## Mine\n\nAdded later.\n`);

    await uninstallSkills({ cwd });

    expect(await readFile(agentsFile, 'utf8')).toBe('# Ops\n\n## Mine\n\nAdded later.\n');
  });

  it('removes a block planted by a different version of the CLI', async () => {
    await writeFile(agentsFile, '# Ops\n');
    await installSkills({
      cwd,
      invocation: await pathInvocation(),
      target: FALLBACK_TARGET,
      version: '0.0.1',
    });

    await uninstallSkills({ cwd });

    expect(await readFile(agentsFile, 'utf8')).toBe('# Ops\n');
  });
});

describe('removeBlock', () => {
  it('reports nothing to remove when no marker is present', () => {
    expect(removeBlock(Buffer.from('# Ops\n', 'utf8'))).toBeUndefined();
  });

  it('keeps content that sits above and below the block', () => {
    const content = Buffer.from(
      `# Above\n\n${BLOCK_BEGIN_PREFIX} version=1.0.0 -->\nbody\n${BLOCK_END_MARKER}\n\n# Below\n`,
      'utf8',
    );

    expect(removeBlock(content)?.toString('utf8')).toBe('# Above\n\n# Below\n');
  });
});

describe('skills topic registration', () => {
  it('declares a skills topic so the subcommand resolves under oclif', async () => {
    const manifestPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      oclif: { topics: Record<string, { description?: string }> };
    };

    expect(manifest.oclif.topics.skills?.description).toBeTruthy();
  });
});
