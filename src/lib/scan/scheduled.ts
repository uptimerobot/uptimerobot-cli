import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { LineCounter, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { ScanFinding } from './finding.js';
import { redactClipped } from './redact.js';
import {
  DEFAULT_MAX_CANDIDATE_FILES,
  DEFAULT_MAX_FILE_BYTES,
  ENTRIES_PER_CANDIDATE,
  compareStrings as compare,
  repoRelativePath,
} from './support.js';

/**
 * Finds the scheduled and recurring work committed into a repository, so
 * `uptimerobot init` can propose a heartbeat monitor per job and wire a ping
 * into the job itself.
 *
 * Pure and offline: the scan reads files, matches patterns, and never resolves
 * imports, spawns a process, or evaluates user code. Nothing here throws for a
 * repository's own sake — an unreadable file, a malformed cron expression, or
 * broken YAML is skipped so a scan of a hostile repository still completes.
 *
 * Two rules shape what is reported:
 * - A crontab line must parse as a real schedule before it becomes a finding,
 *   because in a crontab file the schedule is the only thing separating a job
 *   from arbitrary text.
 * - A declaration site that names its schedule (a library call, a workflow's
 *   `cron:` key) is reported as written even when the expression is nonsense.
 *   The job exists either way, and the expression is the author's to fix.
 *
 * Secrets never leave this module. Dotenv files are not read at all, and every
 * command captured from a cron line, a CI workflow, or an npm script is passed
 * through {@link redactSecrets} before it reaches a finding.
 */

export type { ScanEvidence } from './finding.js';

/**
 * One scheduled or recurring job. `kind` is 'crontab' | 'npm-script' |
 * 'node-cron' | 'agenda' | 'node-schedule' | 'bullmq' | 'nestjs-schedule' |
 * 'celery-beat' | 'github-actions', `value` is the schedule expression as
 * written — '0 3 * * *', '@daily', a `CronExpression.MEMBER` kept verbatim, an
 * interval/timeout in milliseconds, or '' when the source names none — and
 * `detail` carries the command, script, or job name, e.g. { command: 'node
 * scripts/digest.js', name: 'daily-digest' }.
 */
export type ScheduledFinding = ScanFinding;

export interface ScanScheduledOptions {
  /** Directory levels below the repository root that the walk descends. Default 16. */
  maxDepth?: number;
  /** Bytes a single file may hold before the scan declines to read it. Default 524288 (512 KiB). */
  maxFileBytes?: number;
  /** Files the walk can classify as job-bearing before it stops. Default 20000. */
  maxFiles?: number;
  /** Called once if either budget ran out, so the caller can say the list is partial. */
  onTruncated?: () => void;
}

interface ScanLimits {
  maxDepth: number;
  maxFileBytes: number;
  maxFiles: number;
}

const DEFAULT_LIMITS: ScanLimits = {
  maxDepth: 16,
  maxFileBytes: DEFAULT_MAX_FILE_BYTES,
  // Sized so a large monorepo is covered end to end rather than truncated
  // silently; see the same constant in ./routes.ts.
  maxFiles: DEFAULT_MAX_CANDIDATE_FILES,
};

/**
 * Directories that never hold a user's jobs. The walk also skips every
 * dot-directory (VCS, tooling, build caches, agent worktrees) — except
 * `.github`, whose `workflows/` carries scheduled-workflow crons. Listed here
 * are only the non-dotted exceptions.
 */
const SKIPPED_DIRECTORIES = new Set(['__pycache__', 'build', 'dist', 'node_modules', 'vendor']);

const SOURCE_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);

/** How much of a captured command survives into a finding. */
const MAX_DETAIL_LENGTH = 200;
/** How much of a captured command is examined for credentials before it is cut. */
const MAX_REDACTION_LENGTH = 2000;
/** Lines of a Celery beat dictionary the scan will follow before giving up. */
const MAX_PYTHON_BLOCK_LINES = 500;
/** Characters a call-argument scan may consume before it declares the call unparseable. */
const MAX_CALL_LENGTH = 2000;

type FileKind = 'crontab' | 'package-json' | 'python' | 'source' | 'workflow';

/** Reports every scheduled or recurring job declared in the repository. */
export async function scanScheduled(
  repoRoot: string,
  options: ScanScheduledOptions = {},
): Promise<readonly ScheduledFinding[]> {
  const limits: ScanLimits = {
    maxDepth: options.maxDepth ?? DEFAULT_LIMITS.maxDepth,
    maxFileBytes: options.maxFileBytes ?? DEFAULT_LIMITS.maxFileBytes,
    maxFiles: options.maxFiles ?? DEFAULT_LIMITS.maxFiles,
  };
  const findings: ScheduledFinding[] = [];

  const walked = await collectFiles(repoRoot, limits);
  if (walked.truncated) options.onTruncated?.();

  for (const absolute of walked.files) {
    const path = repoRelativePath(repoRoot, absolute);
    const kind = classifyFile(path);
    if (kind === undefined) continue;
    const text = await readTextFile(absolute, limits.maxFileBytes);
    if (text === undefined) continue;
    findings.push(...scanFile(kind, path, text));
  }

  return findings.sort(
    (left, right) =>
      compare(left.evidence.file, right.evidence.file) ||
      left.evidence.line - right.evidence.line ||
      compare(left.value, right.value) ||
      compare(left.kind, right.kind),
  );
}

function scanFile(kind: FileKind, path: string, text: string): readonly ScheduledFinding[] {
  switch (kind) {
    case 'crontab':
      return scanCrontab(path, text);
    case 'package-json':
      return scanPackageScripts(path, text);
    case 'python':
      return scanCeleryBeat(path, text);
    case 'source':
      return [...scanSourcePatterns(path, text), ...scanNestSchedule(path, text)];
    case 'workflow':
      return scanWorkflow(path, text);
  }
}

// ---------------------------------------------------------------------------
// Walking
// ---------------------------------------------------------------------------

/**
 * Lists the files under `repoRoot` depth-first in alphabetical order, so the
 * point at which `maxFiles` truncates a large repository is reproducible.
 * Symbolic links are never followed: a link is the only cheap way for a
 * repository to point the scan outside itself or into a cycle.
 */
async function collectFiles(
  repoRoot: string,
  limits: ScanLimits,
): Promise<{ files: readonly string[]; truncated: boolean }> {
  const files: string[] = [];
  let entryBudget = limits.maxFiles * ENTRIES_PER_CANDIDATE;
  let cut = false;

  const walk = async (directory: string, depth: number): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of [...entries].sort((left, right) => compare(left.name, right.name))) {
      if (files.length >= limits.maxFiles || entryBudget <= 0) {
        cut = true;
        return;
      }
      entryBudget -= 1;
      if (entry.isSymbolicLink()) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        // Dot-directories never hold jobs, except `.github` (workflow crons).
        const skipped =
          (entry.name.startsWith('.') && entry.name !== '.github') ||
          SKIPPED_DIRECTORIES.has(entry.name);
        if (skipped || depth + 1 > limits.maxDepth) continue;
        await walk(absolute, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      // Only a file something can classify is worth the budget. Charging every
      // file let a tree of assets exhaust it before the walk reached a crontab.
      if (classifyFile(repoRelativePath(repoRoot, absolute)) === undefined) continue;
      files.push(absolute);
    }
  };

  await walk(repoRoot, 0);
  return { files, truncated: cut };
}

/**
 * Decides what a file can contribute, or nothing at all. Dotenv files are
 * rejected first and unconditionally — cron lines and CI steps routinely pull
 * credentials from them, and the scan has no business opening one.
 */
function classifyFile(path: string): FileKind | undefined {
  const name = path.split('/').at(-1) ?? path;
  if (isDotenvName(name)) return undefined;

  const lowercased = name.toLowerCase();
  const extension = lowercased.includes('.') ? `.${lowercased.split('.').at(-1)}` : '';

  if (name === 'package.json') return 'package-json';
  if (isCrontabPath(path, lowercased, extension)) return 'crontab';
  if (path.startsWith('.github/workflows/') && (extension === '.yml' || extension === '.yaml')) {
    return 'workflow';
  }
  if (extension === '.py') return 'python';
  if (SOURCE_EXTENSIONS.has(extension)) return 'source';
  return undefined;
}

/** `.env`, `.env.production`, `production.env`, and direnv's `.envrc`. */
function isDotenvName(name: string): boolean {
  const lowercased = name.toLowerCase();
  return (
    lowercased === '.env' ||
    lowercased === '.envrc' ||
    lowercased.startsWith('.env.') ||
    lowercased.endsWith('.env')
  );
}

function isCrontabPath(path: string, lowercased: string, extension: string): boolean {
  return (
    lowercased === 'crontab' ||
    lowercased.startsWith('crontab.') ||
    extension === '.cron' ||
    extension === '.crontab' ||
    isCronDPath(path)
  );
}

/** True for a file dropped into an `/etc/cron.d`-style directory. */
function isCronDPath(path: string): boolean {
  const segments = path.split('/');
  return segments.slice(0, -1).some((segment) => segment.toLowerCase() === 'cron.d');
}

/** Reads a file, or reports nothing when it is oversized, unreadable, or binary. */
async function readTextFile(absolute: string, maxFileBytes: number): Promise<string | undefined> {
  try {
    if ((await stat(absolute)).size > maxFileBytes) return undefined;
    const text = await readFile(absolute, 'utf8');
    return text.includes('\u0000') ? undefined : text;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// crontab files
// ---------------------------------------------------------------------------

const CRON_MACROS = new Set([
  '@annually',
  '@daily',
  '@hourly',
  '@midnight',
  '@monthly',
  '@reboot',
  '@weekly',
  '@yearly',
]);
/** `NAME=value` lines set the environment for the jobs below them; they are not jobs. */
const CRON_ENVIRONMENT_LINE = /^[A-Za-z_][A-Za-z0-9_]*\s*=/;
const CRON_USER_FIELD = /^[a-z_][a-z0-9_-]*$/i;
const CRON_FIELD_RANGES: readonly (readonly [number, number])[] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];
const CRON_FIELD_NAMES: readonly (readonly string[])[] = [
  [],
  [],
  [],
  ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
  ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
];

interface CronLine {
  command: string;
  user?: string;
  value: string;
}

function scanCrontab(path: string, text: string): readonly ScheduledFinding[] {
  const cronDStyle = isCronDPath(path);
  const findings: ScheduledFinding[] = [];

  text.split('\n').forEach((line, index) => {
    const parsed = parseCronLine(line, cronDStyle);
    if (parsed === undefined || parsed.command === '') return;
    findings.push({
      detail: buildDetail({ command: parsed.command, user: parsed.user }),
      evidence: { file: path, line: index + 1 },
      kind: 'crontab',
      value: parsed.value,
    });
  });

  return findings;
}

function parseCronLine(line: string, cronDStyle: boolean): CronLine | undefined {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('#')) return undefined;
  if (CRON_ENVIRONMENT_LINE.test(trimmed)) return undefined;

  const fields = trimmed.split(/\s+/);
  if (trimmed.startsWith('@')) {
    const macro = (fields[0] ?? '').toLowerCase();
    // `@every 5m` is the interval form used by Go cron and several container images.
    if (macro === '@every') {
      const duration = fields[1];
      if (duration === undefined) return undefined;
      return withCronUser(`@every ${duration}`, fields.slice(2), cronDStyle);
    }
    if (!CRON_MACROS.has(macro)) return undefined;
    return withCronUser(macro, fields.slice(1), cronDStyle);
  }

  const schedule = fields.slice(0, 5);
  if (schedule.length < 5) return undefined;
  if (!schedule.every((field, index) => isCronField(field, index))) return undefined;
  return withCronUser(schedule.join(' '), fields.slice(5), cronDStyle);
}

/** In an `/etc/cron.d`-style file a username sits between the schedule and the command. */
function withCronUser(
  value: string,
  rest: readonly string[],
  cronDStyle: boolean,
): CronLine | undefined {
  const first = rest[0];
  if (cronDStyle && rest.length > 1 && first !== undefined && CRON_USER_FIELD.test(first)) {
    return { command: rest.slice(1).join(' '), user: first, value };
  }
  return { command: rest.join(' '), value };
}

function isCronField(field: string, index: number): boolean {
  if (field === '*' || field === '?') return true;
  const items = field.split(',');
  return items.length > 0 && items.every((item) => isCronItem(item, index));
}

function isCronItem(item: string, index: number): boolean {
  const [range = '', step, ...extraSteps] = item.split('/');
  if (extraSteps.length > 0) return false;
  if (step !== undefined && !/^\d+$/.test(step)) return false;
  if (range === '*') return true;
  const [start = '', end, ...extraBounds] = range.split('-');
  if (extraBounds.length > 0) return false;
  return isCronValue(start, index) && (end === undefined || isCronValue(end, index));
}

function isCronValue(value: string, index: number): boolean {
  if (/^\d+$/.test(value)) {
    const [minimum, maximum] = CRON_FIELD_RANGES[index] ?? [0, 0];
    const parsed = Number(value);
    return parsed >= minimum && parsed <= maximum;
  }
  return (CRON_FIELD_NAMES[index] ?? []).includes(value.toLowerCase());
}

// ---------------------------------------------------------------------------
// package.json scripts
// ---------------------------------------------------------------------------

/** Name tokens that read as recurring work on their own. */
const RECURRING_SCRIPT_TOKENS = new Set([
  'backup',
  'cleanup',
  'cron',
  'crontab',
  'daily',
  'digest',
  'heartbeat',
  'hourly',
  'job',
  'monthly',
  'nightly',
  'periodic',
  'prune',
  'reconcile',
  'recurring',
  'reindex',
  'rollup',
  'schedule',
  'sweep',
  'weekly',
  'worker',
]);
/** Tokens that only read as recurring work when the name also names a period. */
const AMBIGUOUS_SCRIPT_TOKENS = new Set(['batch', 'sync', 'task']);
const PERIOD_SCRIPT_TOKENS = new Set([
  'daily',
  'hourly',
  'minutely',
  'monthly',
  'nightly',
  'periodic',
  'recurring',
  'weekly',
  'yearly',
]);
/** Tokens that mark a script as development tooling, whatever else the name says. */
const TOOLING_SCRIPT_TOKENS = new Set([
  'build',
  'bundle',
  'ci',
  'compile',
  'dev',
  'doc',
  'e2e',
  'fmt',
  'format',
  'install',
  'lint',
  'pack',
  'postinstall',
  'preinstall',
  'prepack',
  'prepare',
  'prepublish',
  'preview',
  'publish',
  'release',
  'serve',
  'start',
  'storybook',
  'test',
  'typecheck',
  'watch',
]);

function scanPackageScripts(path: string, text: string): readonly ScheduledFinding[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const scripts =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>).scripts
      : undefined;
  if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts)) return [];

  const lines = text.split('\n');
  const scriptsLine = lines.findIndex((line) => /^\s*"scripts"\s*:/.test(line));
  const findings: ScheduledFinding[] = [];

  for (const [name, command] of Object.entries(scripts as Record<string, unknown>)) {
    if (typeof command !== 'string' || !isRecurringScriptName(name)) continue;
    findings.push({
      detail: buildDetail({ command, name }),
      evidence: { file: path, line: lineOfScriptKey(lines, name, scriptsLine) },
      kind: 'npm-script',
      value: '',
    });
  }

  return findings;
}

/**
 * Conservative by design: a false positive here costs the user a monitor
 * proposal for a script that never runs on a schedule. Tooling names lose
 * outright, unambiguous names win, and the genuinely ambiguous ones
 * (`sync`, `task`, `batch`) only count when the name also names a period.
 */
function isRecurringScriptName(name: string): boolean {
  const tokens = scriptNameTokens(name);
  if (tokens.some((token) => TOOLING_SCRIPT_TOKENS.has(token))) return false;
  if (tokens.some(isRecurringToken)) return true;
  return (
    tokens.some((token) => AMBIGUOUS_SCRIPT_TOKENS.has(token)) &&
    tokens.some((token) => PERIOD_SCRIPT_TOKENS.has(token))
  );
}

/** Splits `db:cleanupOldJobs` into `db`, `cleanup`, `old`, `jobs`. */
function scriptNameTokens(name: string): readonly string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .flatMap((part) => (part === '' ? [] : [part.toLowerCase()]));
}

function isRecurringToken(token: string): boolean {
  const singular = token.endsWith('s') ? token.slice(0, -1) : token;
  return (
    token.includes('cron') ||
    token.startsWith('schedul') ||
    RECURRING_SCRIPT_TOKENS.has(token) ||
    RECURRING_SCRIPT_TOKENS.has(singular)
  );
}

function lineOfScriptKey(lines: readonly string[], name: string, scriptsLine: number): number {
  const key = new RegExp(`^\\s*"${escapeRegExp(name)}"\\s*:`);
  const offset = lines.slice(Math.max(scriptsLine, 0)).findIndex((line) => key.test(line));
  if (offset === -1) return Math.max(scriptsLine, 0) + 1;
  return Math.max(scriptsLine, 0) + offset + 1;
}

// ---------------------------------------------------------------------------
// node-cron, Agenda, node-schedule, BullMQ
// ---------------------------------------------------------------------------

interface SourcePattern {
  kind: string;
  pattern: RegExp;
  /** Turns the captured literals into a schedule and, when the API carries one, a job name. */
  read: (match: RegExpExecArray) => { name?: string; value: string } | undefined;
}

/**
 * Each pattern captures its string literals as `quote, text` pairs, so the
 * group numbering below is fixed: the first literal is groups 1 and 2, the
 * optional second literal is groups 3 and 4.
 */
const SOURCE_PATTERNS: readonly SourcePattern[] = [
  {
    // cron.schedule('*/5 * * * *', handler)
    kind: 'node-cron',
    pattern:
      /\b(?:cron|nodeCron|node_cron|cronScheduler)\s*\.\s*schedule\s*\(\s*(['"`])([^'"`\n]*)\1/g,
    read: (match) => (match[2] === undefined ? undefined : { value: match[2] }),
  },
  {
    // agenda.every('5 minutes', 'delete old users')
    kind: 'agenda',
    pattern:
      /\b(?:agenda|Agenda)[\w$]*\s*\.\s*every\s*\(\s*(['"`])([^'"`\n]*)\1(?:\s*,\s*(['"`])([^'"`\n]*)\3)?/g,
    read: (match) =>
      match[2] === undefined ? undefined : { name: emptyToUndefined(match[4]), value: match[2] },
  },
  {
    // scheduleJob('0 3 * * *', handler) and scheduleJob('nightly', '0 3 * * *', handler)
    kind: 'node-schedule',
    pattern: /\bscheduleJob\s*\(\s*(['"`])([^'"`\n]*)\1(?:\s*,\s*(['"`])([^'"`\n]*)\3)?/g,
    read: (match) => {
      const first = match[2];
      if (first === undefined) return undefined;
      const second = match[4];
      return second === undefined ? { value: first } : { name: first, value: second };
    },
  },
  {
    // repeat: { cron: '0 * * * *' } and repeat: { pattern: '0 * * * *' }
    // The span is bounded so a pathological file cannot make the lazy
    // quantifier walk the whole rest of the source.
    kind: 'bullmq',
    pattern: /\brepeat\s*:\s*\{[^{}]{0,400}?\b(?:cron|pattern)\s*:\s*(['"`])([^'"`\n]*)\1/g,
    read: (match) => (match[2] === undefined ? undefined : { value: match[2] }),
  },
];

/** How far back a BullMQ repeat option looks for the `queue.add('name', …)` that owns it. */
const BULLMQ_NAME_LOOKBACK = 400;
const BULLMQ_JOB_NAME = /\badd\s*\(\s*(['"`])([^'"`\n]*)\1/g;

function scanSourcePatterns(path: string, text: string): readonly ScheduledFinding[] {
  const findings: ScheduledFinding[] = [];

  for (const { kind, pattern, read } of SOURCE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const parsed = read(match);
      if (parsed === undefined || isCommentedOut(text, match.index)) continue;
      findings.push({
        detail: buildDetail({
          name: parsed.name ?? (kind === 'bullmq' ? bullmqJobName(text, match.index) : undefined),
        }),
        evidence: { file: path, line: lineAt(text, match.index) },
        kind,
        value: parsed.value,
      });
    }
  }

  return findings;
}

function bullmqJobName(text: string, index: number): string | undefined {
  const window = text.slice(Math.max(index - BULLMQ_NAME_LOOKBACK, 0), index);
  // The nearest name behind the schedule wins, so the last match in the window.
  return emptyToUndefined([...window.matchAll(BULLMQ_JOB_NAME)].at(-1)?.[2]);
}

/**
 * Rejects matches on a line that opens as a comment. A commented-out
 * `cron.schedule(…)` is the most common way this scan would invent a job that
 * does not run.
 */
function isCommentedOut(text: string, index: number): boolean {
  const start = text.lastIndexOf('\n', index) + 1;
  const prefix = text.slice(start, index).trimStart();
  return prefix.startsWith('//') || prefix.startsWith('#') || prefix.startsWith('*');
}

// ---------------------------------------------------------------------------
// NestJS @nestjs/schedule
// ---------------------------------------------------------------------------

/**
 * `@Cron`, `@Interval`, and `@Timeout` from `@nestjs/schedule`. The decorated
 * method is the job, so its name is the finding's name; the schedule is the
 * value, captured as written — a cron string, a `CronExpression.MEMBER` kept
 * verbatim (never resolved to an expression), or the millisecond count of an
 * interval or timeout. The argument capture stops at the first `)`, so a `)`
 * inside the arguments only ends the capture early rather than throwing.
 */
const NEST_SCHEDULE_DECORATOR = /@(Cron|Interval|Timeout)\s*\(([^)]*)\)/g;
/**
 * The method a decorator sits above: skipping any further stacked decorators
 * and access/async modifiers, the next `name(` after the decorator. Anchored to
 * the slice start so a distant call is never mistaken for the method.
 */
const NEST_METHOD_NAME =
  /^\s*(?:@[A-Za-z_$][\w$]*\s*(?:\([^)]*\))?\s*)*(?:(?:public|private|protected|static|readonly|abstract|async|override)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/;

function scanNestSchedule(path: string, text: string): readonly ScheduledFinding[] {
  // A precision gate mirroring the routes scanner's `@Controller(` check: the
  // three decorators only belong to us when the file pulls them from the package.
  if (!text.includes('@nestjs/schedule')) return [];

  const findings: ScheduledFinding[] = [];
  for (const match of text.matchAll(NEST_SCHEDULE_DECORATOR)) {
    const value = nestScheduleValue(match[1] ?? '', match[2] ?? '');
    if (value === undefined || isCommentedOut(text, match.index)) continue;
    const rest = text.slice(match.index + match[0].length);
    findings.push({
      detail: buildDetail({ name: NEST_METHOD_NAME.exec(rest)?.[1] }),
      evidence: { file: path, line: lineAt(text, match.index) },
      kind: 'nestjs-schedule',
      value,
    });
  }

  return findings;
}

/**
 * The schedule a decorator declares. `@Cron`'s first argument is the schedule (a
 * quoted cron string, respecting the commas inside a cron list, or a bare
 * `CronExpression.MEMBER`); `@Interval` and `@Timeout` carry the millisecond
 * count as their final argument, after an optional leading name.
 */
function nestScheduleValue(decorator: string, args: string): string | undefined {
  if (decorator === 'Cron') return emptyToUndefined(collapseWhitespace(firstCallArgument(args)));
  const comma = args.lastIndexOf(',');
  return emptyToUndefined(collapseWhitespace(comma === -1 ? args : args.slice(comma + 1)));
}

/** The first argument of an argument list: a quoted literal's body, or the run up to the first comma. */
function firstCallArgument(args: string): string {
  const trimmed = args.trim();
  const quote = trimmed[0];
  if (quote === "'" || quote === '"' || quote === '`') {
    const end = trimmed.indexOf(quote, 1);
    return end === -1 ? trimmed.slice(1) : trimmed.slice(1, end);
  }
  const comma = trimmed.indexOf(',');
  return comma === -1 ? trimmed : trimmed.slice(0, comma);
}

// ---------------------------------------------------------------------------
// Celery beat
// ---------------------------------------------------------------------------

const CELERY_SCHEDULE_ASSIGNMENT = /\b(?:beat_schedule|CELERYBEAT_SCHEDULE)\b\s*=/;
const CELERY_ENTRY_KEY = /^\s*(['"])(.+?)\1\s*:\s*\{/;
const CELERY_ENTRY_SCHEDULE = /^\s*(['"])schedule\1\s*:\s*(.+?),?\s*$/;
const CELERY_ENTRY_TASK = /^\s*(['"])task\1\s*:\s*(['"])(.*?)\2/;
const CELERY_PERIODIC_CALL = /\badd_periodic_task\s*\(/g;

function scanCeleryBeat(path: string, text: string): readonly ScheduledFinding[] {
  return [...scanCeleryBeatSchedule(path, text), ...scanCeleryPeriodicTasks(path, text)];
}

/**
 * Walks a `beat_schedule` / `CELERYBEAT_SCHEDULE` dictionary by brace depth.
 * Python is not parsed — the scan only needs each entry's key, its `schedule`
 * expression as written, and the dotted task path that locates the job.
 */
function scanCeleryBeatSchedule(path: string, text: string): readonly ScheduledFinding[] {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => CELERY_SCHEDULE_ASSIGNMENT.test(line));
  if (start === -1) return [];

  const findings: ScheduledFinding[] = [];
  let depth = 0;
  let entry: { line: number; name: string; schedule?: string; task?: string } | undefined;

  for (let index = start; index < lines.length && index - start < MAX_PYTHON_BLOCK_LINES; index++) {
    const line = lines[index] ?? '';
    const opened = countCharacter(line, '{');
    const closed = countCharacter(line, '}');

    if (depth === 1 && entry === undefined) {
      const key = CELERY_ENTRY_KEY.exec(line);
      if (key?.[2] !== undefined) entry = { line: index + 1, name: key[2] };
    } else if (entry !== undefined) {
      const schedule = CELERY_ENTRY_SCHEDULE.exec(line);
      if (schedule?.[2] !== undefined) {
        entry.schedule = completeExpression(lines, index, schedule[2]);
      }
      const task = CELERY_ENTRY_TASK.exec(line);
      if (task?.[3] !== undefined) entry.task = task[3];
    }

    depth += opened - closed;

    if (entry !== undefined && depth <= 1 && closed > 0) {
      if (entry.schedule !== undefined) {
        findings.push({
          detail: buildDetail({ name: entry.name, task: entry.task }),
          evidence: { file: path, line: entry.line },
          kind: 'celery-beat',
          value: entry.schedule,
        });
      }
      entry = undefined;
    }
    if (depth <= 0 && index > start) break;
  }

  return findings;
}

/** `app.add_periodic_task(crontab(hour=7), send_report.s(), name='weekly report')`. */
function scanCeleryPeriodicTasks(path: string, text: string): readonly ScheduledFinding[] {
  const findings: ScheduledFinding[] = [];
  for (const match of text.matchAll(CELERY_PERIODIC_CALL)) {
    const open = match.index + match[0].length - 1;
    const args = readCallArguments(text, open) ?? [];
    const schedule = args[0];
    if (schedule === undefined || schedule === '' || isCommentedOut(text, match.index)) continue;
    findings.push({
      detail: buildDetail({
        name: keywordArgument(args, 'name'),
        task: args[1],
      }),
      evidence: { file: path, line: lineAt(text, match.index) },
      kind: 'celery-beat',
      value: schedule,
    });
  }

  return findings;
}

/** Joins the following lines onto an expression whose parentheses are still open. */
function completeExpression(lines: readonly string[], index: number, expression: string): string {
  let result = expression;
  for (let cursor = index + 1; cursor < lines.length && !isBalanced(result); cursor++) {
    if (cursor - index > 10) break;
    result = `${result} ${(lines[cursor] ?? '').trim()}`;
  }
  return collapseWhitespace(result.replace(/,\s*$/, ''));
}

function isBalanced(expression: string): boolean {
  return countCharacter(expression, '(') === countCharacter(expression, ')');
}

function keywordArgument(args: readonly string[] | undefined, name: string): string | undefined {
  const prefix = `${name}=`;
  const found = args?.find((argument) => argument.startsWith(prefix));
  return found === undefined ? undefined : unquote(found.slice(prefix.length));
}

// ---------------------------------------------------------------------------
// GitHub Actions
// ---------------------------------------------------------------------------

/**
 * Reads `on.schedule[].cron` with exact line numbers. YAML 1.2 keeps `on` a
 * string while YAML 1.1 folds it to `true`, so both keys are tried. A document
 * the parser cannot make sense of is skipped rather than guessed at.
 */
function scanWorkflow(path: string, text: string): readonly ScheduledFinding[] {
  const lineCounter = new LineCounter();
  let schedule: unknown;
  let workflow: unknown;
  try {
    const root = parseDocument(text, { lineCounter }).contents;
    if (!isMap(root)) return [];
    const triggers = root.items.find(
      (pair) => isScalar(pair.key) && (pair.key.value === 'on' || pair.key.value === true),
    )?.value;
    schedule = isMap(triggers) ? triggers.get('schedule', true) : undefined;
    workflow = root.get('name');
  } catch {
    return [];
  }
  if (!isSeq(schedule)) return [];

  const name = typeof workflow === 'string' ? workflow : path.split('/').at(-1);
  const findings: ScheduledFinding[] = [];

  for (const item of schedule.items) {
    if (!isMap(item)) continue;
    const cron = item.get('cron', true);
    if (!isScalar(cron) || typeof cron.value !== 'string') continue;
    const offset = cron.range?.[0];
    findings.push({
      detail: buildDetail({ workflow: name }),
      evidence: {
        file: path,
        line: offset === undefined ? 1 : lineCounter.linePos(offset).line,
      },
      kind: 'github-actions',
      value: truncate(collapseWhitespace(cron.value)),
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Redacts, collapses, and truncates every value, dropping the ones left empty.
 * The redaction window is clipped first: several of the patterns backtrack
 * quadratically, and a repository is free to commit a single 50 KiB cron line.
 * Clipping well beyond {@link MAX_DETAIL_LENGTH} keeps a credential that
 * straddles the visible boundary in scope for redaction.
 */
function buildDetail(
  parts: Readonly<Record<string, string | undefined>>,
): Record<string, string> | undefined {
  const detail: Record<string, string> = {};
  for (const [key, value] of Object.entries(parts)) {
    if (value === undefined) continue;
    const cleaned = truncate(redactClipped(collapseWhitespace(value), MAX_REDACTION_LENGTH));
    if (cleaned !== '') detail[key] = cleaned;
  }
  return Object.keys(detail).length === 0 ? undefined : detail;
}

/**
 * Splits the arguments of a call whose opening parenthesis sits at `open`,
 * tracking nesting and quotes so `crontab(hour=7, minute=30)` stays one
 * argument. Returns nothing when the call never closes within the cap.
 */
function readCallArguments(text: string, open: number): readonly string[] | undefined {
  const args: string[] = [];
  let depth = 0;
  let start = open + 1;
  let quote = '';

  for (let index = open; index < text.length && index - open <= MAX_CALL_LENGTH; index++) {
    const character = text[index];
    if (character === undefined) break;
    if (quote !== '') {
      if (character === '\\') index++;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
    } else if (character === '(' || character === '[' || character === '{') {
      depth++;
    } else if (character === ')' || character === ']' || character === '}') {
      depth--;
      if (depth === 0) {
        args.push(text.slice(start, index));
        const trimmed = args.map(collapseWhitespace);
        return trimmed.length === 1 && trimmed[0] === '' ? [] : trimmed;
      }
    } else if (character === ',' && depth === 1) {
      args.push(text.slice(start, index));
      start = index + 1;
    }
  }
  return undefined;
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index && cursor < text.length; cursor++) {
    if (text[cursor] === '\n') line++;
  }
  return line;
}

function countCharacter(value: string, character: string): number {
  let count = 0;
  for (const current of value) if (current === character) count++;
  return count;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string): string {
  return value.length > MAX_DETAIL_LENGTH ? `${value.slice(0, MAX_DETAIL_LENGTH)}…` : value;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  return (quote === "'" || quote === '"') && trimmed.endsWith(quote) && trimmed.length > 1
    ? trimmed.slice(1, -1)
    : trimmed;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Drops explicit `undefined` values so they do not overwrite a default. */
