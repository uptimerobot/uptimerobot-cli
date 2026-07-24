import { randomBytes } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import type { AgentTarget } from '../agent-targets.js';
import type { CliInvocation } from './cli-invocation.js';
import { formatInvocation } from './cli-invocation.js';
import { AGENT_TARGET_DEFINITIONS } from './registry.js';

/**
 * Making the UptimeRobot skills reachable by whichever coding agent a project
 * uses.
 *
 * Distribution already exists: the skills live in github.com/uptimerobot/ai,
 * which ships plugin manifests for Claude Code, Cursor and Codex, and an
 * Agent Skills index is served from uptimerobot.com. So the job here is to
 * point at the agent's own installer wherever one has been confirmed, and only
 * where none has been to plant a small AGENTS.md section that names the index.
 *
 * Everything this module writes lands under the project root it was handed.
 * Nothing touches the home directory or any global agent configuration — that
 * is the agent installer's business, not ours.
 */

/** The only file this module ever writes, always at the project root. */
export const AGENTS_FILE_NAME = 'AGENTS.md';

/**
 * The live first-party skill index, in the Agent Skills `index.json` format.
 *
 * uptimerobot.com/skills/<name>/SKILL.md and uptimerobot.com/AGENTS.md both
 * return 404 today, so neither is emitted: an agent that follows a dead link
 * reports our setup as broken. Entries in this index resolve to raw skill
 * files in the source repository, which do serve.
 */
export const SKILLS_INDEX_URL = 'https://uptimerobot.com/.well-known/agent-skills/index.json';

/** Where the skills, the plugin manifests and their install docs live. */
export const SKILLS_REPOSITORY_URL = 'https://github.com/uptimerobot/ai';

const MARKER_NAMESPACE = 'uptimerobot:skills';

/**
 * The begin marker carries the version, so the stamp costs no extra line and
 * cannot drift away from the block it describes. Removal matches on the prefix
 * alone, which is why a block planted by an older release is still recognised.
 */
export const BLOCK_BEGIN_PREFIX = `<!-- ${MARKER_NAMESPACE}:begin`;
export const BLOCK_END_MARKER = `<!-- ${MARKER_NAMESPACE}:end -->`;

const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;

/** Where the setup wrote, or refused to write, plus a code the CLI can map. */
export class SkillsInstallError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, message: string, path: string) {
    super(message);
    this.code = code;
    this.name = 'SkillsInstallError';
    this.path = path;
  }
}

/**
 * Every filesystem operation setup performs, as one injectable object, so the
 * failure paths can be exercised without a filesystem that fails on demand.
 */
export interface PlantFileSystem {
  /** Rejects when the path does not exist; callers treat that as "no file". */
  readFile(path: string): Promise<Buffer>;
  /** Deletes a file, succeeding when it is already gone. */
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  writeFile(path: string, content: Buffer): Promise<void>;
}

/** Whether the agent installed the skills itself or we planted a file. */
export type SkillsInstallMethod = 'agent-installer' | 'agents-file';

/** `guided` means nothing was written: the agent's own installer does it. */
export type SkillsInstallOutcome = 'created' | 'guided' | 'unchanged' | 'updated';

export interface SkillsInstallRequest {
  /** The project root. Nothing outside it is read or written. */
  cwd: string;
  fileSystem?: PlantFileSystem;
  /** Resolved once by the caller so every emitted command agrees. */
  invocation: CliInvocation;
  target: AgentTarget;
  /** Stamped into the planted block; normally the CLI's own version. */
  version: string;
}

export interface SkillsInstallReport {
  /** Set only when a file was actually written. */
  agentsFilePath?: string;
  /** Ready-to-print lines, in order. */
  instructions: readonly string[];
  method: SkillsInstallMethod;
  outcome: SkillsInstallOutcome;
  target: AgentTarget;
}

export interface SkillsUninstallRequest {
  cwd: string;
  fileSystem?: PlantFileSystem;
}

export interface SkillsUninstallReport {
  /** Set only when a file was changed or deleted. */
  agentsFilePath?: string;
  /** `absent` covers both "no file" and "file without our block". */
  outcome: 'absent' | 'removed';
  /** True when removing the block emptied the file and it was deleted. */
  removedFile: boolean;
}

export const systemPlantFileSystem: PlantFileSystem = {
  readFile: (path) => readFile(path),
  remove: (path) => rm(path, { force: true }),
  rename: (from, to) => rename(from, to),
  writeFile: (path, content) => writeFile(path, content),
};

/**
 * Points the caller at the agent's own installer when one has been confirmed,
 * and otherwise plants the AGENTS.md section.
 *
 * The two paths are deliberately exclusive. Writing our own file for an agent
 * that ships a plugin would leave the user maintaining two descriptions of the
 * same thing, and the plugin is the one that actually carries the skills.
 */
export async function installSkills(request: SkillsInstallRequest): Promise<SkillsInstallReport> {
  const { cwd, fileSystem = systemPlantFileSystem, invocation, target, version } = request;
  const installer = AGENT_TARGET_DEFINITIONS[target].skillsInstaller;
  if (installer) {
    return {
      instructions: installerInstructions(target, invocation),
      method: 'agent-installer',
      outcome: 'guided',
      target,
    };
  }

  const root = resolve(cwd);
  const path = projectFilePath(root, AGENTS_FILE_NAME);
  const original = await readOptional(path, fileSystem);
  const next = applyBlock(original ?? Buffer.alloc(0), renderSkillsBlock(invocation, version));
  // A re-plant that produces the same bytes must not touch the file at all:
  // rewriting identical content still moves its mtime and can wake watchers.
  if (original?.equals(next)) {
    return {
      agentsFilePath: path,
      instructions: agentsFileInstructions(path, invocation),
      method: 'agents-file',
      outcome: 'unchanged',
      target,
    };
  }

  await writeAtomically(root, path, next, original, fileSystem);
  return {
    agentsFilePath: path,
    instructions: agentsFileInstructions(path, invocation),
    method: 'agents-file',
    outcome: original === undefined ? 'created' : 'updated',
    target,
  };
}

/**
 * Removes our block and nothing else. Target-independent on purpose: a caller
 * who installed for one agent and uninstalls after switching to another still
 * gets their file cleaned up.
 *
 * Never an error. "Nothing planted" is the expected state on most repositories
 * and reporting it as a failure would make cleanup scripts unusable.
 */
export async function uninstallSkills(
  request: SkillsUninstallRequest,
): Promise<SkillsUninstallReport> {
  const { cwd, fileSystem = systemPlantFileSystem } = request;
  const root = resolve(cwd);
  const path = projectFilePath(root, AGENTS_FILE_NAME);
  const original = await readOptional(path, fileSystem);
  if (original === undefined) return { outcome: 'absent', removedFile: false };

  const next = removeBlock(original);
  if (next === undefined) return { outcome: 'absent', removedFile: false };

  // A file that held nothing but our block is litter once the block is gone,
  // and deleting it makes install followed by uninstall a true round trip on a
  // repository that had no AGENTS.md to begin with.
  if (next.length === 0) {
    try {
      await fileSystem.remove(path);
    } catch (error) {
      throw new SkillsInstallError(
        'AGENTS_WRITE_FAILED',
        `Could not remove ${path}: ${describe(error)}`,
        path,
      );
    }
    return { agentsFilePath: path, outcome: 'removed', removedFile: true };
  }

  await writeAtomically(root, path, next, original, fileSystem);
  return { agentsFilePath: path, outcome: 'removed', removedFile: false };
}

/**
 * The managed block, rendered with line feeds. Splicing converts them to
 * whatever the destination file already uses.
 *
 * Deliberately short. The skills themselves carry the detail; duplicating it
 * here would create a second copy to keep in sync, in a file we only partly
 * own.
 */
export function renderSkillsBlock(invocation: CliInvocation, version: string): string {
  return [
    `${BLOCK_BEGIN_PREFIX} version=${version} -->`,
    '',
    '## UptimeRobot',
    '',
    'Uptime monitoring for this project runs on UptimeRobot. Use the UptimeRobot CLI rather',
    'than calling the REST API directly: it handles authentication, pagination and output',
    'formatting, and every command accepts `--json`.',
    '',
    '```sh',
    formatInvocation(invocation, '--help'),
    formatInvocation(invocation, 'auth login'),
    formatInvocation(invocation, 'monitors list --json'),
    formatInvocation(invocation, 'monitors create http --help'),
    formatInvocation(invocation, 'incidents list --json'),
    '```',
    '',
    'Task guides are published as Agent Skills. Fetch the index, pick the entry whose',
    "`description` matches the task, then fetch that entry's `url`:",
    '',
    `- Index: ${SKILLS_INDEX_URL}`,
    `- Source: ${SKILLS_REPOSITORY_URL}`,
    '',
    `Managed by \`${formatInvocation(invocation, 'skills install')}\`. Edits inside this block are`,
    `overwritten; remove it with \`${formatInvocation(invocation, 'skills install --uninstall')}\`.`,
    '',
    BLOCK_END_MARKER,
  ].join('\n');
}

/**
 * Splices a rendered block into a file's bytes.
 *
 * Buffers rather than strings throughout, so foreign content survives exactly
 * as it was stored — a byte-oriented splice cannot normalise an encoding, a
 * byte-order mark or a line ending it never decoded.
 */
export function applyBlock(original: Buffer, block: string): Buffer {
  const lineEnding = dominantLineEnding(original);
  const rendered = Buffer.from(block.replaceAll('\n', lineEnding), 'utf8');
  const located = locateBlock(original);
  if (located) {
    return Buffer.concat([
      original.subarray(0, located.begin),
      rendered,
      original.subarray(located.end),
    ]);
  }
  if (original.length === 0) return Buffer.concat([rendered, Buffer.from(lineEnding)]);

  // Padding only, never trimming: the existing bytes are carried over
  // untouched and the block is separated from them by one blank line. A file
  // that ended without a newline keeps ending without one.
  const separator = lineEnding.repeat(2 - trailingLineEndings(original, lineEnding));
  const suffix = endsWithLineEnding(original) ? lineEnding : '';
  return Buffer.concat([
    original,
    Buffer.from(separator, 'utf8'),
    rendered,
    Buffer.from(suffix, 'utf8'),
  ]);
}

/**
 * Removes the block and the blank line that separated it, returning undefined
 * when nothing was planted.
 *
 * The seam is repaired rather than reconstructed: the line endings around the
 * block belong to us, so they are collapsed back to the single newline a file
 * would have had before the block was added. Content is never touched, which
 * is what makes a plant followed by an uninstall byte-identical for a file
 * that ended with zero or one newline.
 */
export function removeBlock(original: Buffer): Buffer | undefined {
  const located = locateBlock(original);
  if (!located) return undefined;

  const lineEnding = dominantLineEnding(original);
  const before = trimTrailingLineEndings(original.subarray(0, located.begin));
  const after = trimLeadingLineEndings(original.subarray(located.end));

  if (after.length === 0) {
    if (before.length === 0) return Buffer.alloc(0);
    // The block sat at the end of the file, so the only thing left to decide
    // is the trailing newline — which the plant preserved from the original.
    return endsWithLineEnding(original)
      ? Buffer.concat([before, Buffer.from(lineEnding, 'utf8')])
      : before;
  }
  if (before.length === 0) return after;
  return Buffer.concat([before, Buffer.from(lineEnding.repeat(2), 'utf8'), after]);
}

/** The version recorded in a planted block, when one is present. */
export function plantedVersion(content: Buffer): string | undefined {
  const located = locateBlock(content);
  if (!located) return undefined;
  const beginLine = content.subarray(located.begin, located.end).toString('utf8').split('\n', 1)[0];
  return /\bversion=(\S+?)\s*-->/.exec(beginLine ?? '')?.[1];
}

/**
 * What to print when the agent installs the skills itself.
 *
 * The third-party steps are reproduced verbatim from the target definition;
 * only our own commands are templated, so a caller who reached the CLI through
 * npx is not told to run a binary they do not have.
 */
function installerInstructions(target: AgentTarget, invocation: CliInvocation): readonly string[] {
  const definition = AGENT_TARGET_DEFINITIONS[target];
  const installer = definition.skillsInstaller;
  if (!installer) return [];
  return [
    `${definition.label} installs the UptimeRobot skills itself. Run:`,
    '',
    ...installer.steps.map((step) => `  ${step}`),
    '',
    ...(installer.followUp ? [installer.followUp, ''] : []),
    `Docs: ${installer.documentationUrl}`,
    `Check the CLI is reachable with \`${formatInvocation(invocation, 'auth whoami')}\`.`,
  ];
}

function agentsFileInstructions(path: string, invocation: CliInvocation): readonly string[] {
  return [
    `Added an UptimeRobot section to ${path}.`,
    `Skill index: ${SKILLS_INDEX_URL}`,
    `Check the CLI is reachable with \`${formatInvocation(invocation, 'auth whoami')}\`.`,
  ];
}

interface BlockLocation {
  /** Byte offset of the begin marker. */
  begin: number;
  /** Byte offset just past the end marker. */
  end: number;
}

/**
 * Finds the managed block, refusing to guess when the file looks damaged.
 *
 * A begin marker with no end, or a second begin marker after the first block,
 * means someone edited or duplicated the markers. Appending in either case
 * would silently produce two blocks, and splicing could swallow whatever sits
 * between them, so both stop the command instead.
 */
function locateBlock(content: Buffer): BlockLocation | undefined {
  const begin = content.indexOf(BLOCK_BEGIN_PREFIX);
  if (begin === -1) return undefined;

  const endMarker = content.indexOf(BLOCK_END_MARKER, begin);
  if (endMarker === -1) {
    throw new SkillsInstallError(
      'AGENTS_BLOCK_DAMAGED',
      `${AGENTS_FILE_NAME} contains \`${BLOCK_BEGIN_PREFIX} ... -->\` with no matching \`${BLOCK_END_MARKER}\`. Restore or delete the markers by hand, then run the command again.`,
      AGENTS_FILE_NAME,
    );
  }

  const end = endMarker + Buffer.byteLength(BLOCK_END_MARKER);
  if (content.indexOf(BLOCK_BEGIN_PREFIX, end) !== -1) {
    throw new SkillsInstallError(
      'AGENTS_BLOCK_DAMAGED',
      `${AGENTS_FILE_NAME} contains more than one UptimeRobot block. Delete the extra one by hand, then run the command again.`,
      AGENTS_FILE_NAME,
    );
  }
  return { begin, end };
}

/**
 * Writes through a sibling temporary file and one rename, so the destination
 * is never open for writing and a failure cannot leave it half-written.
 *
 * The original bytes are held in memory for the whole operation and put back
 * if anything goes wrong, which covers the case a rename can still fail on.
 */
async function writeAtomically(
  root: string,
  path: string,
  next: Buffer,
  original: Buffer | undefined,
  fileSystem: PlantFileSystem,
): Promise<void> {
  const temporary = projectFilePath(
    root,
    `${AGENTS_FILE_NAME}.uptimerobot-${randomBytes(6).toString('hex')}.tmp`,
  );
  try {
    await fileSystem.writeFile(temporary, next);
    await fileSystem.rename(temporary, path);
  } catch (error) {
    const restored = await restore(path, original, fileSystem);
    // Best effort: a leftover temporary file is untidy, not dangerous, and
    // must not replace the real reason the write failed.
    await fileSystem.remove(temporary).catch(() => undefined);
    throw new SkillsInstallError(
      'AGENTS_WRITE_FAILED',
      restored
        ? `Could not write ${path}: ${describe(error)}. The file was left unchanged.`
        : `Could not write ${path}: ${describe(error)}. Restoring the original also failed; check the file before rerunning.`,
      path,
    );
  }
}

/**
 * Puts the file back exactly as it was found, reporting whether it managed to.
 *
 * The current bytes are compared first, so the common case — the temporary
 * file failed and the destination was never touched — costs no write and
 * succeeds even when the filesystem is what failed in the first place.
 */
async function restore(
  path: string,
  original: Buffer | undefined,
  fileSystem: PlantFileSystem,
): Promise<boolean> {
  const current = await readOptional(path, fileSystem).catch(() => undefined);
  if (original === undefined) {
    if (current === undefined) return true;
    return fileSystem
      .remove(path)
      .then(() => true)
      .catch(() => false);
  }
  if (current?.equals(original)) return true;
  return fileSystem
    .writeFile(path, original)
    .then(() => true)
    .catch(() => false);
}

async function readOptional(
  path: string,
  fileSystem: PlantFileSystem,
): Promise<Buffer | undefined> {
  try {
    return await fileSystem.readFile(path);
  } catch {
    // Missing, unreadable and a directory all mean "there is nothing to keep".
    return undefined;
  }
}

/**
 * Resolves a name against the project root and refuses anything that escapes
 * it. Setup only ever writes files the user can see in their repository, and
 * that rule is enforced here rather than assumed at each call site.
 */
function projectFilePath(root: string, name: string): string {
  const path = resolve(root, name);
  const inside = relative(root, path);
  if (inside !== name || path !== join(root, name)) {
    throw new SkillsInstallError(
      'PROJECT_PATH_ESCAPE',
      `Refusing to write outside the project directory ${root}.`,
      path,
    );
  }
  return path;
}

/**
 * The line ending the file mostly uses. A handful of stray CRLFs in an
 * otherwise LF file must not flip the whole block, so the split has to be
 * decisive rather than merely present.
 */
function dominantLineEnding(content: Buffer): string {
  let carriageReturns = 0;
  let lineFeeds = 0;
  for (
    let index = content.indexOf(LINE_FEED);
    index !== -1;
    index = content.indexOf(LINE_FEED, index + 1)
  ) {
    lineFeeds += 1;
    if (index > 0 && content[index - 1] === CARRIAGE_RETURN) carriageReturns += 1;
  }
  return carriageReturns > 0 && carriageReturns * 2 >= lineFeeds ? '\r\n' : '\n';
}

/** How many line endings the file ends with, counted no further than two. */
function trailingLineEndings(content: Buffer, lineEnding: string): number {
  const unit = Buffer.from(lineEnding, 'utf8');
  let count = 0;
  let end = content.length;
  while (count < 2 && end >= unit.length && content.subarray(end - unit.length, end).equals(unit)) {
    count += 1;
    end -= unit.length;
  }
  return count;
}

function endsWithLineEnding(content: Buffer): boolean {
  return content.length > 0 && content[content.length - 1] === LINE_FEED;
}

/** Trims only CR and LF: trailing spaces on a content line are the user's. */
function trimTrailingLineEndings(content: Buffer): Buffer {
  let end = content.length;
  while (end > 0 && isLineEndingByte(content[end - 1])) end -= 1;
  return content.subarray(0, end);
}

function trimLeadingLineEndings(content: Buffer): Buffer {
  let start = 0;
  while (start < content.length && isLineEndingByte(content[start])) start += 1;
  return content.subarray(start);
}

function isLineEndingByte(byte: number | undefined): boolean {
  return byte === LINE_FEED || byte === CARRIAGE_RETURN;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
