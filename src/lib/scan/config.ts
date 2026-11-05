/**
 * Reads deploy, infrastructure, CI, container and git configuration and names
 * the third-party providers they point at, with `path:line` evidence.
 *
 * Every finding carries a pattern, a provider name or a plain word, never a
 * value copied from the repository: a terraform resource type but not its
 * label or bucket name, a registry pattern but not the image path, a remote's
 * host but not its URL. Pure: takes a path and the file's contents, reads
 * nothing else, never throws for a file's own sake.
 *
 * Files read, and nothing else:
 * - Deploy files by basename (`vercel.json`, `fly.toml`, ...): existence alone.
 * - `serverless.yml`: `provider.name`, or the inline `provider:` value.
 * - `Procfile`: a Heroku hint, never a candidate.
 * - `*.tf`: `provider "<name>"`, `resource` and `data` types by prefix, and the
 *   first plain-word `region = "..."` line, stamped on every finding of the
 *   file as a hint (a multi-provider file shares it); block comments skipped,
 *   and every pattern is anchored to the line start so a line comment never
 *   matches.
 * - CI files by path; build-time on their own.
 * - `Dockerfile*`, `*.Dockerfile`, compose files: the registry host of each
 *   `FROM` or `image:` reference; build-time on their own.
 * - The root `.git/config`: the host of each `url =` line; build-time.
 */
import type { ScanFinding } from './finding.js';
import { VENDORS, type VendorClass, type VendorEntry, type VendorSignal } from './vendors.js';

type ConfigSignal = Exclude<VendorSignal, { kind: 'package' | 'hostname' }>;

/**
 * `kind` is the signal kind that matched. `outcome` is `hint` for a file that
 * suggests a provider without proving it (`Procfile`), `vendor` otherwise.
 */
export interface ConfigFinding extends ScanFinding {
  kind: ConfigSignal['kind'];
  outcome: 'vendor' | 'hint';
  detail: {
    /** The matched pattern in context: `provider "aws"`, `FROM ghcr.io`, `git remote: github.com`. */
    signal: string;
    class: VendorClass;
    /** The plain service word of a terraform resource type (`s3` of `aws_s3_bucket`), else empty. */
    service: string;
    /** A plain region word from the same terraform file (`eu-central-1`), else empty. */
    region: string;
  };
}

export interface ConfigInput {
  /** Repository-relative POSIX path. */
  path: string;
  contents: string;
}

interface Match {
  kind: ConfigSignal['kind'];
  entry: VendorEntry;
  signal: string;
  line: number;
  service?: string;
  outcome?: 'hint';
}

interface ClassedFinding {
  outcome: string;
  value: string;
  detail: { class: VendorClass };
}

/** Signals that make a provider build-time on their own, whatever its row says. */
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

/** The `serverless.yml` provider names and the terraform provider they mean. */
const SERVERLESS_PROVIDERS: Readonly<Record<string, string>> = {
  aws: 'aws',
  google: 'google',
  azure: 'azurerm',
  cloudflare: 'cloudflare',
};

const HEROKU = VENDORS.find((entry) => entry.catalogName === 'Heroku');

/** The only shape a region may have before it reaches the report. */
const PLAIN_WORD = /^[a-z0-9-]{2,32}$/;

const TF_PROVIDER = /^\s*provider\s+"([a-z0-9_-]{1,64})"/;
const TF_RESOURCE = /^\s*(?:resource|data)\s+"([a-z0-9_]{1,128})"/;
const TF_REGION = /^\s*region\s*=\s*"([^"\n]{0,64})"/;
const DOCKER_FROM = /^\s*from\s+(?:--platform=\S+\s+)?(\S+)/i;
const COMPOSE_IMAGE = /^\s*-?\s*image:\s*["']?([^\s"'#]+)/;
const GIT_URL = /^\s*url\s*=\s*(\S+)/;
const SERVERLESS_INLINE = /^provider:\s*([a-z]+)\s*(?:#.*)?$/;
const SERVERLESS_NAME = /^(\s+)name:\s*["']?([a-z]+)["']?\s*(?:#.*)?$/;

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function lines(contents: string): string[] {
  return contents.split('\n');
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
  const host = reference.slice(0, slash).toLowerCase().replace(/:\d+$/, '');
  const item = SIGNALS.find(
    ({ signal }) => signal.kind === 'registry' && hostMatches(signal.pattern, host),
  );
  return item === undefined ? undefined : { entry: item.entry, pattern: item.signal.pattern };
}

/** The host of an https, ssh or scp-style remote; userinfo up to its last `@` dropped. */
function remoteHost(url: string): string {
  const scheme = url.indexOf('://');
  const rest = scheme === -1 ? url : url.slice(scheme + 3);
  const authority = rest.slice(0, firstIndexOf(rest, scheme === -1 ? ':/' : '/'));
  return authority
    .slice(authority.lastIndexOf('@') + 1)
    .replace(/:\d*$/, '')
    .toLowerCase();
}

function firstIndexOf(text: string, characters: string): number {
  const positions = [...characters].map((c) => text.indexOf(c)).filter((i) => i !== -1);
  return positions.length === 0 ? text.length : Math.min(...positions);
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
      const tfName = SERVERLESS_PROVIDERS[providerName];
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

function terraform(contents: string): { matches: Match[]; region: string } {
  const matches: Match[] = [];
  let region = '';
  let inBlockComment = false;
  for (const [index, raw] of lines(contents).entries()) {
    if (inBlockComment) {
      if (raw.includes('*/')) inBlockComment = false;
      continue;
    }
    const line = raw.trimStart();
    if (line.startsWith('/*')) {
      inBlockComment = !line.includes('*/');
      continue;
    }
    const provider = TF_PROVIDER.exec(line)?.[1];
    if (provider !== undefined) {
      const entry = entryFor('terraform-provider', provider);
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
      if (item !== undefined) {
        const service = type.slice(item.signal.pattern.length).split('_')[0] ?? '';
        matches.push({
          kind: 'terraform-resource',
          entry: item.entry,
          signal: type,
          line: index + 1,
          service,
        });
      }
      continue;
    }
    const value = TF_REGION.exec(line)?.[1];
    if (region === '' && value !== undefined && PLAIN_WORD.test(value)) region = value;
  }
  return { matches, region };
}

function ciFile(path: string): Match[] {
  const item = SIGNALS.find(({ signal }) => {
    if (signal.kind !== 'ci-file') return false;
    if (signal.pattern.endsWith('/')) {
      return path.startsWith(signal.pattern) && /\.ya?ml$/.test(path);
    }
    return path === signal.pattern || path.endsWith(`/${signal.pattern}`);
  });
  return item === undefined ? [] : [{ kind: 'ci-file', entry: item.entry, signal: path, line: 1 }];
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

function collect(input: ConfigInput): { matches: Match[]; region: string } {
  const name = basename(input.path);
  if (input.path === '.git/config') return { matches: gitRemotes(input.contents), region: '' };
  if (name.endsWith('.tf')) return terraform(input.contents);
  if (name === 'serverless.yml' || name === 'serverless.yaml') {
    return { matches: serverless(name, input.contents), region: '' };
  }
  if (isDockerfile(name)) {
    return { matches: registryLines(input.contents, DOCKER_FROM, 'FROM'), region: '' };
  }
  if (isCompose(name)) {
    return { matches: registryLines(input.contents, COMPOSE_IMAGE, 'image:'), region: '' };
  }
  return { matches: [...ciFile(input.path), ...deployFile(input.path)], region: '' };
}

/** Names every provider the file points at, one finding per matched signal. */
export function matchConfig(input: ConfigInput): ConfigFinding[] {
  const { matches, region } = collect(input);
  return matches.map((match) => ({
    kind: match.kind,
    outcome: match.outcome ?? 'vendor',
    value: match.entry.catalogName,
    evidence: { file: input.path, line: match.line },
    detail: {
      signal: match.signal,
      class: BUILD_TIME_KINDS.has(match.kind) ? 'build-time' : match.entry.class,
      service: match.service ?? '',
      region,
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
