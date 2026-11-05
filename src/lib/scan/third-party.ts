/**
 * Walks a repository for the third-party providers its manifests and
 * configuration point at.
 *
 * The walk reads only files `matchManifest` or `matchConfig` understand,
 * judged by name before anything is opened, and never a dotenv file,
 * terraform state or variables, a key, `.npmrc`, `.pypirc` or `credentials`.
 * It skips dependency, build, fixture and dot directories (except `.github`
 * and `.circleci`, which hold CI files), any directory below the root that is
 * its own git checkout, and symlinks. The root `.git/config` is read for the
 * remote host when `.git` is a directory; a worktree's `.git` file is not
 * followed.
 *
 * Every finding names its app: the nearest directory at or above the file
 * that holds a manifest, relative to the root, or `.` for the root itself.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { type ConfigFinding, isConfigFile, matchConfig } from './config.js';
import type { ScanFinding } from './finding.js';
import { type ManifestFinding, isManifestFile, matchManifest } from './manifests.js';
import {
  DEFAULT_MAX_CANDIDATE_FILES,
  DEFAULT_MAX_FILE_BYTES,
  ENTRIES_PER_CANDIDATE,
  compareStrings,
  repoRelativePath,
} from './support.js';
import type { VendorClass } from './vendors.js';

export type ThirdPartyOutcome = ConfigFinding['outcome'] | ManifestFinding['outcome'];

/**
 * One signal from one file. `kind` is the signal kind (`npm`, `file`,
 * `registry`, ...), `value` the provider's catalog name for a `vendor` or
 * `hint` outcome and the normalized package name otherwise. `detail` carries
 * the matcher's own fields plus `app`.
 */
export interface ThirdPartyFinding extends ScanFinding {
  kind: ConfigFinding['kind'] | ManifestFinding['kind'];
  outcome: ThirdPartyOutcome;
  detail: Record<string, string> & { signal: string; class: VendorClass; app: string };
}

export interface ScanThirdPartyOptions {
  /** Bytes. Files larger than this are never read. Defaults to 512 KiB. */
  maxFileBytes?: number;
  /** Files the scan may read before the walk stops. Defaults to 20000. */
  maxFiles?: number;
  /** Called once if either budget ran out, so the caller can say the list is partial. */
  onTruncated?: () => void;
}

interface WalkBudget {
  /** Candidate files the walk may still queue. */
  files: number;
  /** Directory entries the walk may still examine. */
  entries: number;
  /** Set once a candidate or an entry was left unread. */
  truncated: boolean;
}

interface Candidate {
  absolute: string;
  path: string;
}

/** Non-dotted directories that never hold a project's own manifests or deploy config. */
const SKIPPED_DIRECTORIES = new Set([
  '__fixtures__',
  '__mocks__',
  '__pycache__',
  '__tests__',
  'build',
  'dist',
  'fixtures',
  'node_modules',
  'vendor',
]);

/** The dot-directories that hold CI configuration; every other one is skipped. */
const WALKED_DOT_DIRECTORIES = new Set(['.github', '.circleci']);

const SECRET_NAMES = new Set(['.npmrc', '.pypirc', 'credentials']);
const SECRET_SUFFIXES = ['.tfstate', '.tfvars', '.pem', '.key'];

/** Files that may hold a secret, excluded before anything can open them. */
function isSecretFile(name: string): boolean {
  if (name === '.env' || name === '.envrc' || name.startsWith('.env.') || name.endsWith('.env')) {
    return true;
  }
  if (SECRET_NAMES.has(name)) return true;
  return SECRET_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

export async function scanThirdParty(
  repoRoot: string,
  options: ScanThirdPartyOptions = {},
): Promise<readonly ThirdPartyFinding[]> {
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxFiles = Math.max(0, options.maxFiles ?? DEFAULT_MAX_CANDIDATE_FILES);
  const budget: WalkBudget = {
    files: maxFiles,
    entries: maxFiles * ENTRIES_PER_CANDIDATE,
    truncated: false,
  };

  const candidates: Candidate[] = [];
  await collectRootGitConfig(repoRoot, candidates);
  await collectFiles(repoRoot, repoRoot, budget, candidates);
  if (budget.truncated) options.onTruncated?.();

  const appDirectories = candidates
    .filter((candidate) => isManifestFile(candidate.path))
    .map((candidate) => directoryOf(candidate.path));

  const findings: ThirdPartyFinding[] = [];
  for (const candidate of candidates) {
    const contents = await readTextFile(candidate.absolute, maxFileBytes);
    if (contents === undefined) continue;
    const app = appOf(candidate.path, appDirectories);
    const matched: readonly (ConfigFinding | ManifestFinding)[] = [
      ...matchManifest({ path: candidate.path, contents }),
      ...matchConfig({ path: candidate.path, contents }),
    ];
    for (const finding of matched) {
      findings.push({ ...finding, detail: { ...finding.detail, app } });
    }
  }
  return findings;
}

async function collectRootGitConfig(repoRoot: string, candidates: Candidate[]): Promise<void> {
  const absolute = join(repoRoot, '.git', 'config');
  try {
    if ((await stat(absolute)).isFile()) candidates.push({ absolute, path: '.git/config' });
  } catch {
    // No git directory, or a worktree's .git file: no remote to read.
  }
}

/**
 * Depth-first walk in byte order, so the budget always cuts the same tail off
 * the same tree. A directory below the root holding its own `.git` is a
 * nested checkout and is skipped whole.
 */
async function collectFiles(
  repoRoot: string,
  directory: string,
  budget: WalkBudget,
  candidates: Candidate[],
): Promise<void> {
  if (budget.truncated) return;

  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  if (directory !== repoRoot && entries.some((entry) => entry.name === '.git')) return;

  entries.sort((first, second) => compareStrings(first.name, second.name));
  for (const entry of entries) {
    if (budget.truncated) return;
    if (budget.entries <= 0) {
      budget.truncated = true;
      return;
    }
    budget.entries -= 1;
    if (entry.isSymbolicLink()) continue;

    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (shouldWalk(entry.name)) await collectFiles(repoRoot, absolute, budget, candidates);
      continue;
    }
    if (!entry.isFile() || isSecretFile(entry.name)) continue;

    const path = repoRelativePath(repoRoot, absolute);
    if (!isManifestFile(path) && !isConfigFile(path)) continue;
    if (budget.files <= 0) {
      budget.truncated = true;
      return;
    }
    budget.files -= 1;
    candidates.push({ absolute, path });
  }
}

function shouldWalk(name: string): boolean {
  if (name.startsWith('.')) return WALKED_DOT_DIRECTORIES.has(name);
  return !SKIPPED_DIRECTORIES.has(name);
}

function directoryOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '.' : path.slice(0, slash);
}

/** The longest app directory that holds the file, or `.`. */
function appOf(path: string, appDirectories: readonly string[]): string {
  const directory = directoryOf(path);
  return appDirectories
    .filter((app) => app === '.' || directory === app || directory.startsWith(`${app}/`))
    .reduce((best, app) => (app.length > best.length ? app : best), '.');
}

async function readTextFile(path: string, maxFileBytes: number): Promise<string | undefined> {
  try {
    const info = await stat(path);
    if (info.size > maxFileBytes) return undefined;
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}
