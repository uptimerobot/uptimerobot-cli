/**
 * Offline detection of container and deployment configuration, used to seed an
 * agent's monitor discovery with the endpoints a repository already describes.
 *
 * The module is deliberately inert: it walks the repository, reads four kinds
 * of configuration file (Dockerfile, Compose, `vercel.json`, `netlify.toml`)
 * and pattern-matches their contents. It never opens a dotenv file, never
 * resolves `${VAR}` interpolation, never reaches the network, and never runs
 * user code. YAML aliases are left unresolved because the scanners walk the
 * parsed nodes instead of materializing the document, so an alias bomb costs
 * nothing.
 *
 * Nothing here throws for bad input. A malformed, hostile, or unreadable file
 * is skipped and the scan continues; the caller gets whatever was legible.
 */

import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { LineCounter, isMap, isNode, isScalar, isSeq, parseDocument } from 'yaml';
import type { ScanFinding } from './finding.js';
import { redactSecrets } from './redact.js';
import { DEFAULT_MAX_FILE_BYTES, compareStrings as compareText } from './support.js';

export type { ScanEvidence } from './finding.js';

/**
 * One container or deployment declaration. `kind` is 'docker-expose' |
 * 'docker-healthcheck' | 'compose-port' | 'compose-expose' |
 * 'compose-healthcheck' | 'vercel-rewrite' | 'vercel-redirect' |
 * 'vercel-route' | 'vercel-cron' | 'netlify-redirect' | 'netlify-functions',
 * `value` is the port, path, or URL as written, and `detail` holds extras such
 * as { service: 'api', protocol: 'tcp' }.
 */
export type ContainerFinding = ScanFinding;

export interface ContainerScanLimits {
  /** Directory levels below the repository root that are traversed. */
  maxDepth: number;
  /** Directory entries the walk may visit before it stops. */
  maxEntries: number;
  /** Bytes a candidate file may hold before it is skipped unread. */
  maxFileBytes: number;
  /** Matching files the walk may collect before it stops. */
  maxFiles: number;
}

/**
 * Sized for a large monorepo without letting a pathological tree stall `init`.
 * Callers override any subset through the second `scanContainers` argument.
 */
export const DEFAULT_CONTAINER_SCAN_LIMITS: ContainerScanLimits = {
  maxDepth: 8,
  maxEntries: 5_000,
  maxFileBytes: DEFAULT_MAX_FILE_BYTES,
  maxFiles: 200,
};

/**
 * Directories that never hold first-party deployment configuration. The walk
 * also skips every dot-directory (VCS, tooling, build caches, agent worktrees);
 * listed here are only the non-dotted exceptions.
 */
const SKIPPED_DIRECTORIES = new Set(['__pycache__', 'build', 'dist', 'node_modules', 'vendor']);

/** Longest raw command echoed back through `detail`. */
const MAX_DETAIL_TEXT = 200;
/** Longest text handed to redaction; well past the visible clip so a straddling credential is still caught. */
const MAX_REDACTION_TEXT = 2000;

const DOTENV_PATTERN = /^\.env(\..*)?$|\.env$/i;
const COMPOSE_PATTERN = /^(docker-)?compose(\..+)?\.ya?ml$/i;
const DOCKERFILE_PATTERN = /^dockerfile(\..+)?$|\.dockerfile$/i;

/** A probed address, stopping at whatever ends an argument in a shell command. */
const SCHEME_URL_PATTERN = /https?:\/\/[^\s"'`,;|&<>()[\]{}\\]+/i;
const HOST_PORT_PATTERN = /[a-z0-9][a-z0-9.-]*:\d{2,5}(?:\/[^\s"'`,;|&<>()[\]{}\\]*)?/i;

const VARIABLE_PATTERN = /^\$\{?([A-Za-z_][A-Za-z0-9_]*)/;

type SourceKind = 'compose' | 'dockerfile' | 'netlify' | 'vercel';

interface SourceFile {
  absolute: string;
  kind: SourceKind;
  /** Repo-relative POSIX path. */
  relative: string;
}

/**
 * Reports every container or deployment endpoint the repository describes,
 * ordered by file, then line, then value, so repeated scans agree.
 */
export interface ScanContainersOptions extends Partial<ContainerScanLimits> {
  /** Called once when a limit stopped the walk before the tree was covered. */
  onTruncated?: () => void;
}

export async function scanContainers(
  repoRoot: string,
  options: ScanContainersOptions = {},
): Promise<readonly ContainerFinding[]> {
  const { onTruncated, ...limits } = options;
  const resolvedLimits = { ...DEFAULT_CONTAINER_SCAN_LIMITS, ...limits };
  const findings: ContainerFinding[] = [];

  for (const source of await collectSources(repoRoot, resolvedLimits, onTruncated)) {
    const text = await readCapped(source.absolute, resolvedLimits.maxFileBytes);
    if (text === undefined) continue;
    findings.push(...scanSource(source, text));
  }

  return findings.sort(compareFindings);
}

function scanSource(source: SourceFile, text: string): readonly ContainerFinding[] {
  switch (source.kind) {
    case 'compose': {
      return scanCompose(source.relative, text);
    }
    case 'dockerfile': {
      return scanDockerfile(source.relative, text);
    }
    case 'netlify': {
      return scanNetlify(source.relative, text);
    }
    case 'vercel': {
      return scanVercel(source.relative, text);
    }
  }
}

// --- Repository walk -------------------------------------------------------

/**
 * Breadth-first walk that only ever collects the four file shapes this module
 * understands, so a dotenv file is never even a candidate. Entries are visited
 * in name order, which keeps the caps deterministic rather than filesystem
 * dependent.
 */
async function collectSources(
  repoRoot: string,
  limits: ContainerScanLimits,
  onTruncated?: () => void,
): Promise<readonly SourceFile[]> {
  const root = await realpath(repoRoot).catch(() => resolve(repoRoot));
  const sources: SourceFile[] = [];
  const queue: { depth: number; path: string }[] = [{ depth: 0, path: root }];
  let visited = 0;

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    const entries = await readdir(current.path, { withFileTypes: true }).catch(() => undefined);
    if (entries === undefined) continue;

    for (const entry of entries.sort((left, right) => compareText(left.name, right.name))) {
      if (visited >= limits.maxEntries || sources.length >= limits.maxFiles) {
        onTruncated?.();
        return sources;
      }
      visited += 1;

      const absolute = join(current.path, entry.name);
      if (entry.isDirectory()) {
        // Dot-directories are tooling, VCS, build caches and agent worktrees,
        // never deployment config; the named set covers the non-dotted ones.
        const skipped = entry.name.startsWith('.') || SKIPPED_DIRECTORIES.has(entry.name);
        if (!skipped && current.depth < limits.maxDepth) {
          queue.push({ depth: current.depth + 1, path: absolute });
        }
        continue;
      }
      // Symlinked directories are never traversed: they invite cycles, and a
      // link may point outside the repository the caller consented to scan.
      if (entry.isSymbolicLink() && !(await isContainedFile(root, absolute))) continue;
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;

      const kind = classify(entry.name);
      if (kind === undefined) continue;
      sources.push({ absolute, kind, relative: toPosixRelative(root, absolute) });
    }
  }

  return sources;
}

function classify(name: string): SourceKind | undefined {
  // Belt and braces: the patterns below cannot match a dotenv file, and this
  // guard keeps it that way if someone widens them later.
  if (DOTENV_PATTERN.test(name)) return undefined;
  if (COMPOSE_PATTERN.test(name)) return 'compose';
  if (DOCKERFILE_PATTERN.test(name)) return 'dockerfile';
  if (name.toLowerCase() === 'vercel.json') return 'vercel';
  if (name.toLowerCase() === 'netlify.toml') return 'netlify';
  return undefined;
}

async function isContainedFile(root: string, absolute: string): Promise<boolean> {
  const target = await realpath(absolute).catch(() => undefined);
  if (target === undefined || !(target === root || target.startsWith(root + sep))) return false;
  const stats = await stat(target).catch(() => undefined);
  return stats?.isFile() ?? false;
}

async function readCapped(absolute: string, maxFileBytes: number): Promise<string | undefined> {
  const stats = await stat(absolute).catch(() => undefined);
  if (stats === undefined || !stats.isFile() || stats.size > maxFileBytes) return undefined;
  return readFile(absolute, 'utf8').catch(() => undefined);
}

function toPosixRelative(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join('/');
}

// --- Dockerfile ------------------------------------------------------------

/**
 * Scans `EXPOSE` and `HEALTHCHECK`. Backslash continuations are joined so a
 * wrapped healthcheck still yields one finding, reported at the line the
 * instruction starts on.
 */
function scanDockerfile(file: string, text: string): readonly ContainerFinding[] {
  const findings: ContainerFinding[] = [];

  for (const { line, text: instruction } of logicalLines(text)) {
    const exposed = /^\s*EXPOSE\s+(.+)$/i.exec(instruction);
    if (exposed) {
      for (const token of exposed[1]!.trim().split(/\s+/)) {
        const { port, protocol } = splitProtocol(token);
        if (port.length === 0) continue;
        findings.push({
          detail: detailOf({ protocol: protocol ?? 'tcp', variable: variableName(port) }),
          evidence: { file, line },
          kind: 'docker-expose',
          value: port,
        });
      }
      continue;
    }

    const healthcheck = /^\s*HEALTHCHECK\s+(.+)$/i.exec(instruction);
    if (healthcheck) {
      const finding = healthcheckFinding('docker-healthcheck', file, line, healthcheck[1]!, {});
      if (finding) findings.push(finding);
    }
  }

  return findings;
}

/** Yields comment-free instructions with their starting 1-indexed line. */
function* logicalLines(text: string): Generator<{ line: number; text: string }> {
  const lines = text.split(/\r?\n/);
  let buffer = '';
  let start = 0;

  for (const [index, raw] of lines.entries()) {
    if (buffer.length === 0 && /^\s*(#|$)/.test(raw)) continue;
    if (buffer.length === 0) start = index + 1;
    const continued = /\\\s*$/.test(raw);
    buffer += continued ? `${raw.replace(/\\\s*$/, '')} ` : raw;
    if (continued) continue;
    yield { line: start, text: buffer };
    buffer = '';
  }

  if (buffer.length > 0) yield { line: start, text: buffer };
}

// --- Compose ---------------------------------------------------------------

/**
 * Scans each service's `ports`, `expose`, and `healthcheck`. `env_file` and
 * `environment` are ignored outright; a `${VAR}` inside a port mapping is
 * reported by name only and never resolved.
 */
function scanCompose(file: string, text: string): readonly ContainerFinding[] {
  const parsed = parseStructured(text);
  if (parsed === undefined) return [];

  const { lineCounter, root } = parsed;
  const services = mapValue(root, 'services');
  if (!isMap(services)) return [];

  const findings: ContainerFinding[] = [];
  for (const pair of services.items) {
    const service = scalarText(pair.key);
    if (service === undefined || !isMap(pair.value)) continue;

    for (const item of seqItems(mapValue(pair.value, 'ports'))) {
      const line = nodeLine(item, lineCounter);
      const finding = isMap(item)
        ? longFormPort(file, line, item, service)
        : shortFormPort(file, line, scalarText(item), service);
      if (finding) findings.push(finding);
    }

    for (const item of seqItems(mapValue(pair.value, 'expose'))) {
      const written = scalarText(item);
      if (written === undefined) continue;
      const { port, protocol } = splitProtocol(written.trim());
      if (port.length === 0) continue;
      findings.push({
        detail: detailOf({ protocol: protocol ?? 'tcp', service, variable: variableName(port) }),
        evidence: { file, line: nodeLine(item, lineCounter) },
        kind: 'compose-expose',
        value: port,
      });
    }

    const healthcheck = mapValue(pair.value, 'healthcheck');
    const test = mapValue(healthcheck, 'test');
    if (test !== undefined) {
      const line = pairLine(healthcheck, 'test', lineCounter) ?? nodeLine(test, lineCounter);
      const finding = healthcheckFinding(
        'compose-healthcheck',
        file,
        line,
        composeTestCommand(test),
        { service },
      );
      if (finding) findings.push(finding);
    }
  }

  return findings;
}

/** `"127.0.0.1:8080:80/tcp"`, `"8080:80"`, or a bare container port. */
function shortFormPort(
  file: string,
  line: number,
  written: string | undefined,
  service: string,
): ContainerFinding | undefined {
  if (written === undefined) return undefined;
  const parts = splitPortSpec(written.trim());
  if (parts.length === 0 || parts.length > 3) return undefined;

  const target = splitProtocol(parts.at(-1)!);
  const published = parts.length >= 2 ? parts.at(-2) : undefined;
  const hostIp = parts.length === 3 ? parts[0] : undefined;
  const value = published ?? target.port;
  if (value.length === 0) return undefined;

  return {
    detail: detailOf({
      hostIp: hostIp?.replace(/^\[|\]$/g, ''),
      protocol: target.protocol ?? 'tcp',
      published,
      raw: written.trim(),
      service,
      target: target.port,
      variable: variableName(value),
    }),
    evidence: { file, line },
    kind: 'compose-port',
    value,
  };
}

/** The `{ target, published, protocol, host_ip, mode }` mapping form. */
function longFormPort(
  file: string,
  line: number,
  item: unknown,
  service: string,
): ContainerFinding | undefined {
  const target = scalarText(mapValue(item, 'target'));
  const published = scalarText(mapValue(item, 'published'));
  const value = published ?? target;
  if (value === undefined || value.length === 0) return undefined;

  return {
    detail: detailOf({
      hostIp: scalarText(mapValue(item, 'host_ip')),
      mode: scalarText(mapValue(item, 'mode')),
      protocol: scalarText(mapValue(item, 'protocol')) ?? 'tcp',
      published,
      service,
      target,
      variable: variableName(value),
    }),
    evidence: { file, line },
    kind: 'compose-port',
    value,
  };
}

/** Flattens both `test` spellings: an exec array or a shell string. */
function composeTestCommand(test: unknown): string {
  if (isSeq(test)) {
    return test.items
      .map((item) => scalarText(item))
      .filter((part): part is string => part !== undefined)
      .filter((part) => part !== 'CMD' && part !== 'CMD-SHELL' && part !== 'NONE')
      .join(' ');
  }
  return scalarText(test) ?? '';
}

// --- Vercel ----------------------------------------------------------------

/**
 * Scans `rewrites`, `redirects`, `routes`, and `crons`. A cron's `schedule` is
 * copied through verbatim; interpreting schedules belongs to another module.
 */
function scanVercel(file: string, text: string): readonly ContainerFinding[] {
  const parsed = parseStructured(text);
  if (parsed === undefined) return [];

  const { lineCounter, root } = parsed;
  const findings: ContainerFinding[] = [];

  const sections = [
    { detail: ['destination'], key: 'rewrites', kind: 'vercel-rewrite', path: 'source' },
    {
      detail: ['destination', 'permanent', 'statusCode'],
      key: 'redirects',
      kind: 'vercel-redirect',
      path: 'source',
    },
    { detail: ['dest', 'status'], key: 'routes', kind: 'vercel-route', path: 'src' },
    { detail: ['schedule'], key: 'crons', kind: 'vercel-cron', path: 'path' },
  ] as const;

  for (const section of sections) {
    for (const entry of seqItems(mapValue(root, section.key))) {
      const value = scalarText(mapValue(entry, section.path));
      if (value === undefined || value.length === 0) continue;

      const detail: Record<string, string | undefined> = {};
      for (const name of section.detail) detail[name] = scalarText(mapValue(entry, name));

      findings.push({
        detail: detailOf(detail),
        evidence: {
          file,
          line: pairLine(entry, section.path, lineCounter) ?? nodeLine(entry, lineCounter),
        },
        kind: section.kind,
        value,
      });
    }
  }

  return findings;
}

// --- Netlify ---------------------------------------------------------------

/**
 * A narrow TOML reader: enough for `[[redirects]]` blocks and the two places a
 * functions directory is declared. Anything else in the file is ignored, and
 * an unparseable line simply ends the current block.
 */
function scanNetlify(file: string, text: string): readonly ContainerFinding[] {
  const findings: ContainerFinding[] = [];
  let table = '';
  let redirect: { from?: string; line: number; status?: string; to?: string } | undefined;

  const flush = () => {
    if (redirect?.from) {
      findings.push({
        detail: detailOf({ status: redirect.status, to: redirect.to }),
        evidence: { file, line: redirect.line },
        kind: 'netlify-redirect',
        value: redirect.from,
      });
    }
    redirect = undefined;
  };

  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    const header = /^\[\[?\s*([^[\]]+?)\s*\]\]?/.exec(line);
    if (header) {
      flush();
      table = header[1]!.toLowerCase();
      continue;
    }

    const assignment = /^([A-Za-z0-9_."'-]+)\s*=\s*(.+)$/.exec(line);
    if (!assignment) continue;
    const key = assignment[1]!.replaceAll(/["']/g, '').toLowerCase();
    const value = tomlScalar(assignment[2]!);
    if (value === undefined) continue;

    if (/(^|\.)redirects$/.test(table)) {
      redirect ??= { line: index + 1 };
      if (key === 'from') redirect = { ...redirect, from: value, line: index + 1 };
      if (key === 'to') redirect.to = value;
      if (key === 'status') redirect.status = value;
      continue;
    }

    const setting =
      table === 'functions' && key === 'directory'
        ? 'functions.directory'
        : table === 'build' && key === 'functions'
          ? 'build.functions'
          : undefined;
    if (setting) {
      findings.push({
        detail: { setting },
        evidence: { file, line: index + 1 },
        kind: 'netlify-functions',
        value,
      });
    }
  }

  flush();
  return findings;
}

/** Reads a basic, literal, or bare TOML value; multi-line strings are skipped. */
function tomlScalar(raw: string): string | undefined {
  if (raw.startsWith('"""') || raw.startsWith("'''")) return undefined;
  if (raw.startsWith('"')) {
    const match = /^"((?:[^"\\]|\\.)*)"/.exec(raw);
    if (match === null) return undefined;
    return match[1]!.replaceAll(/\\(.)/g, (_full, char: string) => (char === 'n' ? '\n' : char));
  }
  if (raw.startsWith("'")) return /^'([^']*)'/.exec(raw)?.[1];
  const bare = raw.split('#')[0]!.trim();
  return bare.length > 0 ? bare : undefined;
}

// --- Shared extraction -----------------------------------------------------

/**
 * Turns a health probe command into a finding, keeping only the probes an
 * uptime monitor could reproduce. `pg_isready` and `nc -z` style checks carry
 * no address to hit, so they are dropped rather than handed on as noise.
 */
function healthcheckFinding(
  kind: string,
  file: string,
  line: number,
  command: string,
  extra: Readonly<Record<string, string | undefined>>,
): ContainerFinding | undefined {
  const probe = probeUrl(command);
  if (probe === undefined) return undefined;
  // The probe and the command are copied into a file at the repository root,
  // so a credential in either would be the scan's own leak. Both are clipped
  // before redaction: the URL pattern backtracks on a long path, and nothing
  // past the clip is ever shown.
  const flat = command.replaceAll(/\s+/g, ' ').trim().slice(0, MAX_REDACTION_TEXT);
  return {
    detail: detailOf({ ...extra, command: truncate(redactSecrets(flat), MAX_DETAIL_TEXT) }),
    evidence: { file, line },
    kind,
    value: redactSecrets(probe.slice(0, MAX_REDACTION_TEXT)),
  };
}

/** The address a `curl`/`wget` style health probe hits, if it names one. */
function probeUrl(command: string): string | undefined {
  const url = SCHEME_URL_PATTERN.exec(command)?.[0] ?? HOST_PORT_PATTERN.exec(command)?.[0];
  return url?.replace(/[.]+$/, '');
}

/** Splits a trailing `/tcp`, `/udp`, or `/sctp` from a port specification. */
function splitProtocol(part: string): { port: string; protocol?: string } {
  const match = /^(.*?)\/([A-Za-z]+)$/.exec(part);
  return match ? { port: match[1]!, protocol: match[2]!.toLowerCase() } : { port: part };
}

/**
 * Splits a port mapping on `:` while leaving `${VAR:-default}` and bracketed
 * IPv6 hosts intact, so `"${PORT:-8080}:3000"` stays two parts.
 */
function splitPortSpec(spec: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (let index = 0; index < spec.length; index += 1) {
    const char = spec[index]!;
    if (char === '$' && spec[index + 1] === '{') {
      depth += 1;
      current += '${';
      index += 1;
    } else if ((char === '}' || char === ']') && depth > 0) {
      depth -= 1;
      current += char;
    } else if (char === '[') {
      depth += 1;
      current += char;
    } else if (char === ':' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  parts.push(current);
  return parts;
}

/** The name behind a `${VAR}` or `$VAR` reference. The value is never read. */
function variableName(text: string): string | undefined {
  return VARIABLE_PATTERN.exec(text)?.[1];
}

// --- Structured parsing ----------------------------------------------------

/**
 * Parses YAML, or JSON as the YAML superset it is, keeping the node ranges the
 * line counter needs. A document with any parse error is rejected whole rather
 * than harvested half-built.
 */
function parseStructured(text: string): { lineCounter: LineCounter; root: unknown } | undefined {
  const lineCounter = new LineCounter();
  try {
    const document = parseDocument(text, { lineCounter });
    if (document.errors.length > 0) return undefined;
    return { lineCounter, root: document.contents };
  } catch {
    return undefined;
  }
}

function mapValue(node: unknown, key: string): unknown {
  return isMap(node) ? node.get(key, true) : undefined;
}

function seqItems(node: unknown): readonly unknown[] {
  return isSeq(node) ? node.items : [];
}

function scalarText(node: unknown): string | undefined {
  if (!isScalar(node)) return undefined;
  const { value } = node;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function nodeLine(node: unknown, lineCounter: LineCounter): number {
  const start = isNode(node) ? node.range?.[0] : undefined;
  return start === undefined ? 1 : lineCounter.linePos(start).line;
}

function pairLine(node: unknown, key: string, lineCounter: LineCounter): number | undefined {
  if (!isMap(node)) return undefined;
  for (const pair of node.items) {
    if (scalarText(pair.key) === key) return nodeLine(pair.key, lineCounter);
  }
  return undefined;
}

// --- Shaping ---------------------------------------------------------------

function detailOf(
  entries: Readonly<Record<string, string | undefined>>,
): Record<string, string> | undefined {
  const detail: Record<string, string> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value.length > 0) detail[key] = value;
  }
  return Object.keys(detail).length > 0 ? detail : undefined;
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function compareFindings(left: ContainerFinding, right: ContainerFinding): number {
  return (
    compareText(left.evidence.file, right.evidence.file) ||
    left.evidence.line - right.evidence.line ||
    compareText(left.value, right.value) ||
    compareText(left.kind, right.kind)
  );
}
