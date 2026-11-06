/**
 * Reads deploy, infrastructure, CI, container and git configuration and names
 * the third-party providers they point at, with `path:line` evidence.
 *
 * A finding carries a provider name, a matched pattern or a plain word, never
 * a value from file contents: a terraform resource type but not its label or
 * bucket name, a registry pattern but not the image path, a remote's host but
 * not its URL. File paths are evidence and appear as such. Pure: takes a path
 * and the file's contents, reads nothing else, never throws on malformed or
 * hostile contents.
 *
 * Files read, and nothing else:
 * - Deploy files by basename (`vercel.json`, `fly.toml`, ...): existence alone.
 * - `serverless.yml`: `provider.name`, or the inline `provider:` value.
 * - `Procfile`: a Heroku hint, never a candidate.
 * - `*.tf`: `provider "<name>"`, `resource` and `data` types by prefix, and the
 *   region-shaped `region = "..."` line of each provider block, stamped on
 *   that provider's AWS, Google Cloud or Azure findings as a hint; line and
 *   block comments skipped, heredocs not.
 * - CI files by path: `.yml` and `.yaml` files under a CI directory pattern,
 *   or a basename pattern at the root or any depth; build-time on their own.
 * - `Dockerfile*`, `*.Dockerfile`, compose files: the registry host of each
 *   `FROM` or `image:` reference; build-time on their own. A `FROM` inside a
 *   heredoc counts; this is a known ceiling.
 * - The root `.git/config`: the host of each `url =` line; build-time.
 *
 * Lines over {@link MAX_LINE_LENGTH} are skipped, a path with a `..` segment,
 * a backslash or a control character yields nothing, and one file reports a
 * given provider, signal and service once, at its first line.
 */
import type { ScanFinding } from './finding.js';
import { hasUnsafeCharacters } from './support.js';
import { VENDORS, type VendorClass, type VendorEntry, type VendorSignal } from './vendors.js';

type ConfigSignal = Exclude<VendorSignal, { kind: 'package' | 'hostname' }>;

/**
 * `kind` is the signal kind that matched. `outcome` is `hint` for a file that
 * suggests a provider without proving it (`Procfile`), `vendor` otherwise.
 * `detail.service` and `detail.region` are empty wherever they do not apply
 * (every non-terraform finding, and a terraform file without a region line).
 */
export interface ConfigFinding extends ScanFinding {
  kind: ConfigSignal['kind'];
  outcome: 'vendor' | 'hint';
  detail: {
    /** The matched pattern in context: `provider "aws"`, `FROM ghcr.io`, `git remote: github.com`. */
    signal: string;
    class: VendorClass;
    /** The plain service word of a terraform resource type (`s3` of `aws_s3_bucket`). */
    service: string;
    /** The plain region word of the same terraform file (`eu-central-1`). */
    region: string;
  };
}

export interface ConfigInput {
  /** Repository-relative POSIX path. */
  path: string;
  contents: string;
}

/** One matched signal before it becomes a {@link ConfigFinding}. */
interface Match {
  kind: ConfigSignal['kind'];
  entry: VendorEntry;
  signal: string;
  line: number;
  service?: string;
  region?: string;
  outcome?: 'hint';
}

/** Any finding with a vendor class: a {@link ConfigFinding} or a manifest finding. */
interface ClassedFinding {
  outcome: string;
  value: string;
  detail: { class: VendorClass };
}

/**
 * A CI file, a registry host or a git remote says the provider builds or
 * hosts the code, not that the product calls it at runtime, so these kinds
 * are build-time whatever the provider's row says.
 */
const BUILD_TIME_KINDS: ReadonlySet<ConfigSignal['kind']> = new Set([
  'ci-file',
  'registry',
  'git-host',
]);

const SIGNALS: readonly { entry: VendorEntry; signal: ConfigSignal }[] = VENDORS.flatMap((entry) =>
  entry.signals
    .filter(
      (signal): signal is ConfigSignal => signal.kind !== 'package' && signal.kind !== 'hostname',
    )
    .map((signal) => ({ entry, signal })),
);

/**
 * `serverless.yml` provider names, keyed to the `terraform-provider` pattern
 * in `vendors.ts` that names the same cloud. Every value must exist there.
 */
const SERVERLESS_PROVIDERS: ReadonlyMap<string, string> = new Map([
  ['aws', 'aws'],
  ['google', 'google'],
  ['azure', 'azurerm'],
  ['cloudflare', 'cloudflare'],
]);

const HEROKU = VENDORS.find((entry) => entry.catalogName === 'Heroku');
/** The providers a terraform `region` value describes; other providers in the same file share none of it. */
const REGION_VENDORS: ReadonlySet<string> = new Set(['AWS', 'Google Cloud', 'Microsoft Azure']);

/** The only shapes that may reach the report: an AWS or Google style region and a short service word. */
/** AWS (`eu-central-1`, `us-gov-west-1`) and Google Cloud (`europe-west1`) region names; anything else is free text. */
const REGION =
  /^(?:(?:af|ap|ca|cn|eu|il|me|mx|sa|us)(?:-(?:gov|iso[a-z]?))?-[a-z]{3,12}-\d{1,2}|(?:africa|asia|australia|europe|me|northamerica|southamerica|us)-[a-z]{3,12}\d{1,2})$/;
const SERVICE_WORD = /^[a-z][a-z0-9]{0,15}$/;
/** A hostname before lowercasing: ASCII only, DNS length, so a Kelvin sign never folds to `k`. */
const HOST = /^[A-Za-z0-9.-]{1,253}$/;
/** A `..` segment anywhere in the path. */
const DOT_DOT_SEGMENT = /(?:^|\/)\.\.(?:\/|$)/;
const MAX_LINE_LENGTH = 4096;

const TF_PROVIDER = /^\s*provider\s+"([a-z0-9_-]{1,64})"/;
const TF_RESOURCE = /^\s*(?:resource|data)\s+"([a-z0-9_]{1,128})"/;
const TF_REGION = /^\s*region\s*=\s*"([^"\n]{0,64})"/;
const DOCKER_FROM = /^\s*from\s+(?:--platform=\S+\s+)?(\S+)/i;
const COMPOSE_IMAGE = /^\s*(?:-\s+)?image:\s*["']?([^\s"'#]+)/;
const GIT_URL = /^\s*url\s*=\s*(\S+)/;
const SERVERLESS_INLINE = /^provider:\s*([a-z]+)\s*(?:#.*)?$/;
const SERVERLESS_NAME = /^(\s+)name:\s*["']?([a-z]+)["']?\s*(?:#.*)?$/;
/** The authority of `scheme://[user@]host[:port]/path` and of scp-style `[user@]host:path`. */
const URL_AUTHORITY = /^[a-z+]+:\/\/([^/?#\\\s]*)(?:$|[/?#])/i;
const SCP_AUTHORITY = /^([^:/?#\\\s]*):/;

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Lines with a leading BOM dropped; an over-long line becomes empty so numbering holds. */
function lines(contents: string): string[] {
  return contents
    .replace(/^\uFEFF/, '')
    .split('\n')
    .map((line) => (line.length > MAX_LINE_LENGTH ? '' : line));
}

function entryFor(kind: ConfigSignal['kind'], pattern: string): VendorEntry | undefined {
  return SIGNALS.find((item) => item.signal.kind === kind && item.signal.pattern === pattern)
    ?.entry;
}

/** Each `*` in a pattern stands for one or more labels (`*.dkr.ecr.*.amazonaws.com`). */
function hostMatches(pattern: string, host: string): boolean {
  if (!pattern.includes('*')) return host === pattern;
  const expression = pattern.split('*').map(escapeRegExp).join('[a-z0-9.-]+');
  return new RegExp(`^${expression}$`).test(host);
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function registryFor(reference: string): { entry: VendorEntry; pattern: string } | undefined {
  const slash = reference.indexOf('/');
  if (slash === -1) return undefined;
  const raw = reference.slice(0, slash).replace(/:\d+$/, '');
  if (!HOST.test(raw)) return undefined;
  const host = raw.toLowerCase();
  const item = SIGNALS.find(
    ({ signal }) => signal.kind === 'registry' && hostMatches(signal.pattern, host),
  );
  return item === undefined ? undefined : { entry: item.entry, pattern: item.signal.pattern };
}

/**
 * The host of an `https://`, `ssh://` or scp-style (`git@host:path`) remote.
 * Userinfo is dropped up to its last `@`, so a credential holding `@` cannot
 * smuggle a host in, and a port is dropped.
 */
function remoteHost(url: string): string | undefined {
  const authority = (URL_AUTHORITY.exec(url) ?? SCP_AUTHORITY.exec(url))?.[1];
  const host = authority?.slice(authority.lastIndexOf('@') + 1).replace(/:\d*$/, '');
  return host !== undefined && HOST.test(host) ? host.toLowerCase() : undefined;
}

function deployFile(path: string): Match[] {
  const name = basename(path);
  if (name === 'Procfile') {
    return HEROKU === undefined
      ? []
      : [{ kind: 'file', entry: HEROKU, signal: name, line: 1, outcome: 'hint' }];
  }
  const entry = entryFor('file', name);
  return entry === undefined ? [] : [{ kind: 'file', entry, signal: name, line: 1 }];
}

/**
 * `provider: aws` inline, or `name:` as a direct child of `provider:` (the
 * first child's indent fixes the depth, so `environment.name` never counts).
 */
function serverless(name: string, contents: string): Match[] {
  let inProvider = false;
  let childIndent: string | undefined;
  for (const [index, line] of lines(contents).entries()) {
    if (line.trim() === '') continue;
    if (inProvider && childIndent === undefined) childIndent = /^\s*/.exec(line)?.[0];
    const inline = SERVERLESS_INLINE.exec(line);
    const nested = inProvider ? SERVERLESS_NAME.exec(line) : null;
    const providerName = inline?.[1] ?? (nested?.[1] === childIndent ? nested?.[2] : undefined);
    if (providerName !== undefined) {
      const tfName = SERVERLESS_PROVIDERS.get(providerName);
      const entry = tfName === undefined ? undefined : entryFor('terraform-provider', tfName);
      return entry === undefined
        ? []
        : [{ kind: 'file', entry, signal: `${name} provider ${providerName}`, line: index + 1 }];
    }
    if (/^provider:\s*(?:#.*)?$/.test(line)) inProvider = true;
    else if (inProvider && !/^\s/.test(line)) inProvider = false;
  }
  return [];
}

/** The line with every character inside a double-quoted string blanked, so syntax can be read outside strings only. */
function maskStrings(line: string): string {
  let masked = '';
  let inString = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index] ?? '';
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
      masked += ' ';
    } else {
      if (char === '"') inString = true;
      masked += char;
    }
  }
  return masked;
}

/** Index of the first `/*` outside a double-quoted string, or -1. */
function blockCommentStart(line: string): number {
  return maskStrings(line).indexOf('/*');
}

/** Opened minus closed braces outside strings. */
function braceDelta(line: string): number {
  const masked = maskStrings(line);
  return (masked.match(/{/g)?.length ?? 0) - (masked.match(/}/g)?.length ?? 0);
}

/**
 * A `region` line belongs to the provider block it sits in: the most recent
 * `provider` line names it. A region seen before any provider block is the
 * file's default and reaches every cloud provider of the file.
 */
/** A provider block the vendor map does not know still owns the regions inside it. */
const UNKNOWN_PROVIDER = '';

function terraform(contents: string): Match[] {
  const matches: Match[] = [];
  const regions = new Map<string, string>();
  let fileRegion = '';
  // A region counts for the provider whose block it sits in, directly: once
  // the block closes the provider is forgotten, and a region after the first
  // provider block belongs to no one. An unknown provider still owns its block.
  let currentProvider: string | undefined;
  let providerDepth = -1;
  let seenProvider = false;
  let depth = 0;
  let pendingDelta = 0;
  let inBlockComment = false;
  for (const [index, raw] of lines(contents).entries()) {
    if (inBlockComment) {
      if (raw.includes('*/')) inBlockComment = false;
      continue;
    }
    if (/^\s*(?:#|\/\/)/.test(raw)) continue;
    const opener = blockCommentStart(raw);
    const line = (opener === -1 ? raw : raw.slice(0, opener)).trimStart();
    if (opener !== -1) inBlockComment = !raw.includes('*/', opener);
    depth += pendingDelta;
    pendingDelta = braceDelta(line);
    if (providerDepth !== -1 && depth < providerDepth) {
      currentProvider = undefined;
      providerDepth = -1;
    }
    const provider = TF_PROVIDER.exec(line)?.[1];
    if (provider !== undefined) {
      const entry = entryFor('terraform-provider', provider);
      currentProvider = entry?.catalogName ?? UNKNOWN_PROVIDER;
      providerDepth = depth + 1;
      seenProvider = true;
      if (entry !== undefined) {
        matches.push({
          kind: 'terraform-provider',
          entry,
          signal: `provider "${provider}"`,
          line: index + 1,
        });
      }
      continue;
    }
    const type = TF_RESOURCE.exec(line)?.[1];
    if (type !== undefined) {
      const item = SIGNALS.find(
        ({ signal }) => signal.kind === 'terraform-resource' && type.startsWith(signal.pattern),
      );
      const word =
        item === undefined ? '' : (type.slice(item.signal.pattern.length).split('_')[0] ?? '');
      if (item !== undefined && SERVICE_WORD.test(word)) {
        matches.push({
          kind: 'terraform-resource',
          entry: item.entry,
          signal: `${item.signal.pattern}${word}`,
          line: index + 1,
          service: word,
        });
      }
      continue;
    }
    const value = TF_REGION.exec(line)?.[1];
    if (value === undefined || !REGION.test(value)) continue;
    if (currentProvider === undefined) {
      if (!seenProvider && fileRegion === '') fileRegion = value;
    } else if (depth === providerDepth && !regions.has(currentProvider)) {
      regions.set(currentProvider, value);
    }
  }
  return matches.map((match) => {
    const name = match.entry.catalogName;
    if (!REGION_VENDORS.has(name)) return match;
    return { ...match, region: regions.get(name) ?? fileRegion };
  });
}

function ciFile(path: string): Match[] {
  const item = SIGNALS.find(({ signal }) => {
    if (signal.kind !== 'ci-file') return false;
    if (signal.pattern.endsWith('/')) {
      return (
        path.startsWith(signal.pattern) && /^[^/]+\.ya?ml$/.test(path.slice(signal.pattern.length))
      );
    }
    return path === signal.pattern || path.endsWith(`/${signal.pattern}`);
  });
  return item === undefined
    ? []
    : [{ kind: 'ci-file', entry: item.entry, signal: `ci: ${item.signal.pattern}`, line: 1 }];
}

function registryLines(contents: string, pattern: RegExp, label: string): Match[] {
  return lines(contents).flatMap((line, index) => {
    const reference = pattern.exec(line)?.[1];
    const match = reference === undefined ? undefined : registryFor(reference);
    return match === undefined
      ? []
      : [
          {
            kind: 'registry' as const,
            entry: match.entry,
            signal: `${label} ${match.pattern}`,
            line: index + 1,
          },
        ];
  });
}

function gitRemotes(contents: string): Match[] {
  return lines(contents).flatMap((line, index) => {
    const url = GIT_URL.exec(line)?.[1];
    const host = url === undefined ? undefined : remoteHost(url);
    const entry = host === undefined ? undefined : entryFor('git-host', host);
    return entry === undefined
      ? []
      : [{ kind: 'git-host' as const, entry, signal: `git remote: ${host}`, line: index + 1 }];
  });
}

function isDockerfile(name: string): boolean {
  return name === 'Dockerfile' || name.startsWith('Dockerfile.') || name.endsWith('.Dockerfile');
}

function isCompose(name: string): boolean {
  return /^(docker-)?compose([.-][\w.-]*)?\.ya?ml$/.test(name);
}

/** Whether {@link matchConfig} can read anything from this path, judged from its name. */
export function isConfigFile(path: string): boolean {
  const name = basename(path);
  return (
    path === '.git/config' ||
    name.endsWith('.tf') ||
    name === 'serverless.yml' ||
    name === 'serverless.yaml' ||
    name === 'Procfile' ||
    isDockerfile(name) ||
    isCompose(name) ||
    entryFor('file', name) !== undefined ||
    ciFile(path).length > 0
  );
}

/** The content reader for a file, picked by name; first match wins, one per file. */
function contentMatches(input: ConfigInput): Match[] {
  const name = basename(input.path);
  if (input.path === '.git/config') return gitRemotes(input.contents);
  if (name.endsWith('.tf')) return terraform(input.contents);
  if (name === 'serverless.yml' || name === 'serverless.yaml') {
    return serverless(name, input.contents);
  }
  if (isDockerfile(name)) return registryLines(input.contents, DOCKER_FROM, 'FROM');
  if (isCompose(name)) return registryLines(input.contents, COMPOSE_IMAGE, 'image:');
  return deployFile(input.path);
}

/**
 * Names every provider the file points at, one finding per matched signal.
 * A file's path (a CI location) and its contents are matched independently,
 * so a compose file inside a workflow directory yields both.
 */
export function matchConfig(input: ConfigInput): ConfigFinding[] {
  if (DOT_DOT_SEGMENT.test(input.path) || hasUnsafeCharacters(input.path)) return [];
  const seen = new Set<string>();
  const matches = [...ciFile(input.path), ...contentMatches(input)].filter((match) => {
    const key = `${match.kind}\u0000${match.entry.catalogName}\u0000${match.signal}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return matches.map((match) => ({
    kind: match.kind,
    outcome: match.outcome ?? 'vendor',
    value: match.entry.catalogName,
    evidence: { file: input.path, line: match.line },
    detail: {
      signal: match.signal,
      class: BUILD_TIME_KINDS.has(match.kind) ? 'build-time' : match.entry.class,
      service: match.service ?? '',
      region: match.region ?? '',
    },
  }));
}

/**
 * One class per provider across every finding: a runtime signal wins, so a
 * registry reference plus hosting config is runtime and a registry reference
 * alone stays build-time. Hints and non-vendor outcomes do not count.
 */
export function resolveVendorClasses(
  findings: readonly ClassedFinding[],
): Map<string, VendorClass> {
  const classes = new Map<string, VendorClass>();
  for (const finding of findings) {
    if (finding.outcome !== 'vendor') continue;
    const current = classes.get(finding.value);
    if (current === 'runtime') continue;
    classes.set(finding.value, finding.detail.class);
  }
  return classes;
}
