/**
 * Aggregates the three repository scanners into one seed-context document: the
 * hand-off between `uptimerobot init` and the agent that proposes monitors.
 *
 * Two jobs live here that no single scanner can do.
 *
 * The first is deciding what may be proposed. A monitor is fetched from the
 * public internet, so a loopback, private, link-local, carrier-NAT, unique-local
 * or wildcard address, and a name under a private suffix, can never be one.
 * That test cannot be run uniformly over every finding, because the scanners
 * report structurally different things: a route is a host-less path, a Compose
 * port carries its bind address in `detail.hostIp`, a healthcheck carries a
 * whole URL, and a cron expression is not a network target at all. So the rules
 * dispatch on what a finding is — see {@link judge} — rather than running one
 * pattern over every `value`.
 *
 * The second is keeping rejections visible. Every candidate the rules turn down
 * stays in the document with a reason and its evidence, because an agent told
 * "this URL was found and rejected because it is loopback" will not go and
 * rediscover the same URL in the same file and propose it anyway.
 *
 * This module is a pure library: it never prints, never raises a CliFailure,
 * and never reaches the network. Dotenv files are not read — the scanners
 * exclude them before opening anything, and aggregation only ever consumes
 * findings, never the filesystem.
 */

import { isIP, isIPv6 } from 'node:net';
import { type ContainerScanLimits, scanContainers } from './containers.js';
import type { ScanEvidence, ScanFinding } from './finding.js';
import { type ScanRoutesOptions, isHealthPath, scanRoutes } from './routes.js';
import { type ScanScheduledOptions, scanScheduled } from './scheduled.js';

export { DEFAULT_CONTAINER_SCAN_LIMITS, scanContainers } from './containers.js';
export type { ContainerFinding, ContainerScanLimits } from './containers.js';
export type { ScanEvidence, ScanFinding } from './finding.js';
export { scanRoutes } from './routes.js';
export type { RouteFinding, ScanRoutesOptions } from './routes.js';
export { scanScheduled } from './scheduled.js';
export type { ScanScheduledOptions, ScheduledFinding } from './scheduled.js';

/** Bumped whenever a consumer would have to change to read the document. */
export const SEED_CONTEXT_SCHEMA_VERSION = 1;

/** How a candidate has to be used before it can become a monitor. */
export type CandidateTarget =
  /** A host-less path; it needs a base URL the user confirms. */
  | 'path'
  /** A published TCP port; it needs a host the user confirms. */
  | 'port'
  /** A whole URL, ready to check once the user confirms it is public. */
  | 'url';

/** Which scanner produced a candidate. */
export type ScanSource = 'containers' | 'routes' | 'scheduled';

/** Why a candidate must not be proposed as a monitor. */
export type RejectionReason =
  /** Bound inside the container network, never published to a host. */
  | 'container-internal'
  /** Holds a placeholder segment, so no single URL answers it. */
  | 'dynamic-path'
  /** Namespaced as internal, so the edge does not expose it. */
  | 'internal-path'
  /** 169.254.0.0/16 or fe80::/10. */
  | 'link-local'
  /** localhost, *.localhost, 127.0.0.0/8, or ::1. */
  | 'loopback'
  /** Not an address at all, e.g. a functions source directory. */
  | 'not-an-endpoint'
  /** 10.0.0.0/8, 172.16.0.0/12, or 192.168.0.0/16. */
  | 'private-network'
  /** Under .local, .internal, .lan, or .home.arpa. */
  | 'private-tld'
  /** A middleware mount prefix rather than an endpoint. */
  | 'route-prefix'
  /** Driven by a scheduled job, so it belongs with the heartbeats. */
  | 'scheduled-endpoint'
  /** 100.64.0.0/10, carrier-grade NAT. */
  | 'shared-address-space'
  /** A single-label name that only its own network resolves. */
  | 'unqualified-host'
  /** The value is an unresolved ${VAR}; the scan never reads .env. */
  | 'unresolved-variable'
  /** fc00::/7. */
  | 'unique-local'
  /** 0.0.0.0/8 or ::, which name no reachable interface. */
  | 'unspecified-address';

export interface ScanCandidate {
  target: CandidateTarget;
  /** The path, port, or URL to use, exactly as the repository writes it. */
  value: string;
  /** The finding kind it came from, e.g. 'next-app' or 'compose-port'. */
  kind: string;
  source: ScanSource;
  /** Open this file at this line to check the claim. */
  evidence: ScanEvidence;
  /** Further places the same value was found, when there is more than one. */
  alsoAt?: readonly ScanEvidence[];
  /** Extras carried through from the finding, e.g. { method: 'GET' }. */
  detail?: Record<string, string>;
  /**
   * Set when this is a health probe: a route whose path reads as one, or a
   * container healthcheck, which the image declares outright. Absent otherwise,
   * so it never widens a candidate that is not one. See
   * {@link isHealthCandidate}.
   */
  health?: boolean;
}

export interface RejectedCandidate extends ScanCandidate {
  reason: RejectionReason;
  /** The exact text that failed the check: a host, an address, or the value. */
  matched: string;
  /** One sentence, ready to paste into a report. */
  message: string;
}

export interface HeartbeatCandidate {
  /** The schedule as written, e.g. '0 3 * * *', '@daily', or '' when none is named. */
  schedule: string;
  /** The finding kind, e.g. 'crontab', 'github-actions', or 'vercel-cron'. */
  kind: string;
  source: ScanSource;
  /** The job's own name, when the source gives one. */
  name?: string;
  /** Open this file at this line to check the claim. */
  evidence: ScanEvidence;
  /** Extras that locate the job's script, e.g. { command, name, task, workflow, user, path }. */
  detail?: Record<string, string>;
}

export interface SeedContextSummary {
  /** Findings considered, i.e. accepted + rejected + heartbeats before de-duplication. */
  findings: number;
  accepted: number;
  rejected: number;
  heartbeats: number;
  /** Count per reason, e.g. { loopback: 3 }. Reasons that did not fire are absent. */
  rejectedByReason: Record<string, number>;
}

/**
 * What `uptimerobot init` hands an agent. Read `accepted` for what may be
 * proposed, `heartbeats` for the jobs that want a ping, and `rejected` for what
 * was deliberately left out and why — an item in `rejected` must never be
 * proposed, however it is rediscovered.
 *
 * `accepted` is ordered so its `target` groups are contiguous: urls, then
 * paths, then ports.
 */
export interface SeedContext {
  schemaVersion: number;
  /** The root that was scanned, as the caller wrote it. */
  repoRoot: string;
  summary: SeedContextSummary;
  accepted: readonly ScanCandidate[];
  rejected: readonly RejectedCandidate[];
  heartbeats: readonly HeartbeatCandidate[];
}

/** The raw output of the three scanners, before any rule is applied. */
export interface ScanFindings {
  containers: readonly ScanFinding[];
  routes: readonly ScanFinding[];
  scheduled: readonly ScanFinding[];
}

export interface ScanRepositoryOptions {
  containers?: Partial<ContainerScanLimits>;
  routes?: ScanRoutesOptions;
  scheduled?: ScanScheduledOptions;
}

/**
 * Runs all three scanners over `repoRoot` and returns the seed context. None of
 * them throws for a repository's own sake, so neither does this.
 */
export async function scanRepository(
  repoRoot: string,
  options: ScanRepositoryOptions = {},
): Promise<SeedContext> {
  const [containers, routes, scheduled] = await Promise.all([
    scanContainers(repoRoot, options.containers ?? {}),
    scanRoutes(repoRoot, options.routes ?? {}),
    scanScheduled(repoRoot, options.scheduled ?? {}),
  ]);
  return buildSeedContext(repoRoot, { containers, routes, scheduled });
}

/**
 * The pure half of {@link scanRepository}: applies the rules to findings that
 * are already in hand. Exposed so callers and tests can exercise the rules
 * without a repository on disk.
 */
export function buildSeedContext(repoRoot: string, findings: ScanFindings): SeedContext {
  const accepted: ScanCandidate[] = [];
  const rejected: RejectedCandidate[] = [];
  const heartbeats: HeartbeatCandidate[] = [];

  for (const finding of findings.scheduled) {
    heartbeats.push(scheduledHeartbeat(finding));
  }

  // A path a cron declares is driven on a schedule, so it is a heartbeat rather
  // than a public endpoint. Collected first because a route finding elsewhere in
  // the repository can name the very same path.
  const cronPaths = new Map<string, ScanEvidence>();
  for (const finding of findings.containers) {
    if (finding.kind !== 'vercel-cron') continue;
    cronPaths.set(finding.value, finding.evidence);
    heartbeats.push(cronHeartbeat(finding));
  }

  const sources = [
    { items: findings.containers, source: 'containers' as const },
    { items: findings.routes, source: 'routes' as const },
  ];
  for (const { items, source } of sources) {
    for (const finding of items) {
      if (finding.kind === 'vercel-cron') continue;
      const verdict = judge(finding, source, cronPaths);
      const candidate: ScanCandidate = {
        target: verdict.target,
        value: finding.value,
        kind: finding.kind,
        source,
        evidence: finding.evidence,
        ...(finding.detail === undefined ? {} : { detail: finding.detail }),
      };
      if (verdict.rejection === undefined) {
        // A health probe is the strongest thing to monitor, so it is marked
        // here and surfaced first.
        accepted.push(
          isHealthCandidate(finding, verdict.target) ? { ...candidate, health: true } : candidate,
        );
      } else {
        rejected.push({ ...candidate, ...verdict.rejection });
        const recovered = recoveredHealthPath(finding);
        if (recovered !== undefined) accepted.push(recovered);
      }
    }
  }

  const uniqueAccepted = mergeDuplicates(accepted.sort(compareAccepted), (candidate) => [
    candidate.target,
    candidate.value,
  ]);
  const uniqueRejected = mergeDuplicates(rejected.sort(compareRejected), (candidate) => [
    candidate.target,
    candidate.value,
    candidate.reason,
  ]);
  heartbeats.sort(compareHeartbeats);

  return {
    schemaVersion: SEED_CONTEXT_SCHEMA_VERSION,
    repoRoot,
    summary: {
      findings: accepted.length + rejected.length + heartbeats.length,
      accepted: uniqueAccepted.length,
      rejected: uniqueRejected.length,
      heartbeats: heartbeats.length,
      rejectedByReason: countReasons(uniqueRejected),
    },
    accepted: uniqueAccepted,
    rejected: uniqueRejected,
    heartbeats,
  };
}

// --- Rules -----------------------------------------------------------------

interface Rejection {
  reason: RejectionReason;
  matched: string;
  message: string;
}

interface Verdict {
  target: CandidateTarget;
  rejection?: Rejection;
}

/** Routes a finding to the rules that suit its shape. */
function judge(
  finding: ScanFinding,
  source: 'containers' | 'routes',
  cronPaths: ReadonlyMap<string, ScanEvidence>,
): Verdict {
  if (source === 'routes') return judgeRoute(finding, cronPaths);

  switch (finding.kind) {
    case 'compose-expose': {
      return internal(
        finding.value,
        `Port ${finding.value} is exposed to other containers on the Compose network only; nothing outside the host's Docker network can reach it.`,
      );
    }
    case 'docker-expose': {
      return internal(
        finding.value,
        `EXPOSE ${finding.value} documents a container port. Docker does not publish it to the host, so it is not reachable until something maps it.`,
      );
    }
    case 'compose-port': {
      return judgeComposePort(finding);
    }
    case 'compose-healthcheck':
    case 'docker-healthcheck': {
      return judgeProbeUrl(finding);
    }
    case 'netlify-functions': {
      return {
        target: 'path',
        rejection: {
          reason: 'not-an-endpoint',
          matched: finding.value,
          message: `"${finding.value}" is the directory functions are built from, not a URL the site serves.`,
        },
      };
    }
    default: {
      return judgeRedirect(finding, cronPaths);
    }
  }
}

/**
 * A route value is a host-less path, so there is no host to test. What can go
 * wrong instead is that the path is a mount prefix, sits in an internal
 * namespace, or has a placeholder where a real segment belongs. The HTTP method
 * is not one of those things: a monitor can send POST as readily as GET, so a
 * write endpoint is passed on with its `detail.method` intact.
 */
function judgeRoute(finding: ScanFinding, cronPaths: ReadonlyMap<string, ScanEvidence>): Verdict {
  const target = 'path' as const;

  if (finding.detail?.mount === 'true') {
    return {
      target,
      rejection: {
        reason: 'route-prefix',
        matched: finding.value,
        message: `"${finding.value}" mounts middleware under a prefix; the server does not answer the prefix itself.`,
      },
    };
  }

  const scheduled = scheduledRejection(finding.value, cronPaths);
  if (scheduled !== undefined) return { target, rejection: scheduled };

  const internalNamespace = internalNamespaceOf(finding.value, finding.evidence.file);
  if (internalNamespace !== undefined) {
    return {
      target,
      rejection: {
        reason: 'internal-path',
        matched: internalNamespace,
        message: `"${finding.value}" is declared under the internal namespace "${internalNamespace}", which is normally blocked before it reaches the internet.`,
      },
    };
  }

  const placeholder = placeholderIn(finding.value);
  if (placeholder !== undefined) {
    return {
      target,
      rejection: {
        reason: 'dynamic-path',
        matched: placeholder,
        message: `"${finding.value}" carries the placeholder "${placeholder}", so no single URL answers it; substitute a real value before monitoring it.`,
      },
    };
  }

  return { target };
}

/**
 * The published side of a Compose port mapping is what a monitor could reach,
 * and `detail.hostIp` says which interface it is published on. A wildcard bind
 * means every interface, so it is the one address that passes here while being
 * rejected as a URL host.
 */
function judgeComposePort(finding: ScanFinding): Verdict {
  const detail = finding.detail ?? {};
  const target = 'port' as const;

  const variable = detail.variable;
  if (variable !== undefined) {
    return {
      target,
      rejection: {
        reason: 'unresolved-variable',
        matched: finding.value,
        message: `The published port is the unresolved variable "${finding.value}". The scan never reads .env files, so the number behind ${variable} is unknown.`,
      },
    };
  }

  if (detail.published === undefined) {
    return internal(
      finding.value,
      `Port ${finding.value} is a container port with no published host port, so nothing outside the container reaches it.`,
      target,
    );
  }

  const hostIp = detail.hostIp;
  if (hostIp === undefined || isWildcardBind(hostIp)) return { target };

  const rejection = classifyHost(hostIp);
  if (rejection === undefined) return { target };
  return {
    target,
    rejection: {
      reason: rejection.reason,
      matched: hostIp,
      message: `Port ${finding.value} is published on ${hostIp} only, ${rejection.phrase}.`,
    },
  };
}

/** A healthcheck names a whole address, so the host test applies directly. */
function judgeProbeUrl(finding: ScanFinding): Verdict {
  const target = 'url' as const;
  const host = hostOf(finding.value);
  if (host === undefined) return { target };

  const rejection = classifyHost(host);
  if (rejection === undefined) return { target };
  return {
    target,
    rejection: {
      reason: rejection.reason,
      matched: host,
      message: `"${finding.value}" points at ${host}, ${rejection.phrase}.`,
    },
  };
}

/**
 * A rewrite, redirect, or route entry names a path, not a URL. Its destination
 * may be absolute though, and a public path fronting an internal upstream is
 * not something to hand to an agent as a ready-made monitor.
 */
function judgeRedirect(
  finding: ScanFinding,
  cronPaths: ReadonlyMap<string, ScanEvidence>,
): Verdict {
  const target = 'path' as const;
  const detail = finding.detail ?? {};

  const scheduled = scheduledRejection(finding.value, cronPaths);
  if (scheduled !== undefined) return { target, rejection: scheduled };

  const placeholder = placeholderIn(finding.value);
  if (placeholder !== undefined) {
    return {
      target,
      rejection: {
        reason: 'dynamic-path',
        matched: placeholder,
        message: `"${finding.value}" carries the placeholder "${placeholder}", so no single URL answers it; substitute a real value before monitoring it.`,
      },
    };
  }

  const destination = detail.destination ?? detail.dest ?? detail.to;
  if (destination === undefined || !ABSOLUTE_URL.test(destination)) return { target };
  const host = hostOf(destination);
  if (host === undefined) return { target };

  const rejection = classifyHost(host);
  if (rejection === undefined) return { target };
  return {
    target,
    rejection: {
      reason: rejection.reason,
      matched: host,
      message: `"${finding.value}" is served by ${destination}, whose host ${host} is ${rejection.phrase}.`,
    },
  };
}

function internal(value: string, message: string, target: CandidateTarget = 'port'): Verdict {
  return { target, rejection: { reason: 'container-internal', matched: value, message } };
}

function scheduledRejection(
  value: string,
  cronPaths: ReadonlyMap<string, ScanEvidence>,
): Rejection | undefined {
  const evidence = cronPaths.get(value);
  if (evidence === undefined) return undefined;
  return {
    reason: 'scheduled-endpoint',
    matched: value,
    message: `"${value}" is invoked by the cron declared at ${evidence.file}:${evidence.line}, so it belongs with the heartbeats rather than with the uptime checks.`,
  };
}

// --- Paths -----------------------------------------------------------------

/**
 * Segments that mark work meant for the inside of a network. A path under one
 * of them, or a route declared in a module under one of them, is not something
 * the internet reaches — Go enforces `internal/` in the compiler, and Django,
 * Rails and Node projects use it by convention.
 */
const INTERNAL_SEGMENTS = new Set(['_internal', 'internal']);

/**
 * Everything that can stand where a literal path segment belongs: Next.js
 * brackets, Express and Rails colons, Laravel braces (`{id}`, `{id?}`), shell
 * and template interpolation, Django converters, and regular-expression syntax
 * from `re_path`.
 */
const PATH_PLACEHOLDER =
  /\$\{[^}]*\}?|\{[^}]*\}?|\[[^\]]*\]?|<[^>]*>?|\((?:\?[^)]*)?[^)]*\)?|(?:^|\/)(:[^/]+)|[*+?^$|\\{}]/;

const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:\/\//i;

function placeholderIn(value: string): string | undefined {
  const match = PATH_PLACEHOLDER.exec(value);
  if (match === null) return undefined;
  return match[1] ?? match[0];
}

/** The internal segment a path or its declaring file sits under, if any. */
function internalNamespaceOf(value: string, file: string): string | undefined {
  const first = value.split('/').find((segment) => segment !== '');
  if (first !== undefined && INTERNAL_SEGMENTS.has(first.toLowerCase())) return `/${first}`;
  // Django and Rails mount a sub-module's routes under a prefix the scanner
  // never sees, so the declaring directory is the only evidence of the
  // namespace the paths really live in.
  const directory = file
    .split('/')
    .slice(0, -1)
    .find((segment) => INTERNAL_SEGMENTS.has(segment.toLowerCase()));
  return directory === undefined ? undefined : `${directory}/`;
}

// --- Hosts -----------------------------------------------------------------

/** Why a host cannot be reached from the public internet. */
export interface HostRejection {
  reason: RejectionReason;
  /** A noun phrase completing "<host> is …", e.g. 'a loopback address (127.0.0.0/8)'. */
  phrase: string;
}

/** Suffixes reserved for names that public DNS never resolves. */
const PRIVATE_SUFFIXES = ['.home.arpa', '.internal', '.lan', '.local'];

/**
 * Classifies a host name or IP address, returning nothing when it could
 * genuinely be reachable from outside. Bracketed IPv6, IPv4-mapped IPv6, zone
 * identifiers and trailing root dots are all understood.
 */
export function classifyHost(host: string): HostRejection | undefined {
  const name = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/%.*$/, '')
    .replace(/\.$/, '');
  if (name === '') return undefined;
  return isIP(name) === 0 ? classifyName(name) : classifyAddress(name);
}

/**
 * True for the addresses that mean "every interface" rather than one host. As a
 * Compose bind they make a port public; as a URL host they are unusable, which
 * is why only the bind side calls this.
 */
function isWildcardBind(host: string): boolean {
  const name = host.trim().replace(/^\[|\]$/g, '');
  return name === '' || name === '0.0.0.0' || name === '::' || name === '*';
}

function classifyName(name: string): HostRejection | undefined {
  if (name === 'localhost' || name.endsWith('.localhost')) {
    return {
      reason: 'loopback',
      phrase: 'the loopback interface, which only the machine running the service can reach',
    };
  }
  for (const suffix of PRIVATE_SUFFIXES) {
    if (name === suffix.slice(1) || name.endsWith(suffix)) {
      return {
        reason: 'private-tld',
        phrase: `a name under "${suffix}", a private suffix that public DNS never resolves`,
      };
    }
  }
  if (!name.includes('.')) {
    return {
      reason: 'unqualified-host',
      phrase: 'a single-label name, which only resolves inside the network that defines it',
    };
  }
  return undefined;
}

function classifyAddress(address: string): HostRejection | undefined {
  if (!isIPv6(address)) return classifyIpv4(address.split('.').map(Number));

  const groups = ipv6Groups(address);
  if (groups === undefined) return undefined;
  const rejection = classifyIpv6(groups);
  if (rejection !== undefined) return rejection;

  // An IPv4-mapped or IPv4-compatible address is only ever as reachable as the
  // IPv4 address inside it.
  const mapped = mappedIpv4(groups);
  return mapped === undefined ? undefined : classifyIpv4(mapped);
}

function classifyIpv4(octets: readonly number[]): HostRejection | undefined {
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return undefined;
  const [first = 0, second = 0] = octets;

  if (first === 0) {
    return {
      reason: 'unspecified-address',
      phrase: 'in 0.0.0.0/8, which names no reachable interface',
    };
  }
  if (first === 127) {
    return {
      reason: 'loopback',
      phrase: 'a loopback address (127.0.0.0/8), reachable only from the host itself',
    };
  }
  if (first === 10 || (first === 172 && second >= 16 && second <= 31)) {
    return {
      reason: 'private-network',
      phrase: `a private address (RFC 1918, ${first === 10 ? '10.0.0.0/8' : '172.16.0.0/12'}), not routable from the internet`,
    };
  }
  if (first === 192 && second === 168) {
    return {
      reason: 'private-network',
      phrase: 'a private address (RFC 1918, 192.168.0.0/16), not routable from the internet',
    };
  }
  if (first === 169 && second === 254) {
    return {
      reason: 'link-local',
      phrase: 'a link-local address (169.254.0.0/16), which is never routed off its own link',
    };
  }
  if (first === 100 && second >= 64 && second <= 127) {
    return {
      reason: 'shared-address-space',
      phrase: 'carrier-grade NAT space (100.64.0.0/10), which the internet cannot address',
    };
  }
  return undefined;
}

function classifyIpv6(groups: readonly number[]): HostRejection | undefined {
  const [first = 0] = groups;
  const leading = groups.slice(0, 7).every((group) => group === 0);

  if (leading && groups[7] === 0) {
    return { reason: 'unspecified-address', phrase: 'the unspecified address "::"' };
  }
  if (leading && groups[7] === 1) {
    return {
      reason: 'loopback',
      phrase: 'the IPv6 loopback address (::1), reachable only from the host itself',
    };
  }
  if ((first & 0xff_c0) === 0xfe_80) {
    return {
      reason: 'link-local',
      phrase: 'an IPv6 link-local address (fe80::/10), which is never routed off its own link',
    };
  }
  if ((first & 0xfe_00) === 0xfc_00) {
    return {
      reason: 'unique-local',
      phrase: 'an IPv6 unique-local address (fc00::/7), private to a single site',
    };
  }
  return undefined;
}

/** The eight 16-bit groups of an IPv6 address, with `::` expanded. */
function ipv6Groups(address: string): readonly number[] | undefined {
  let text = address;

  // A trailing dotted quad, as in ::ffff:127.0.0.1, is two groups written long.
  const dotted = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (dotted?.[1] !== undefined) {
    const [a = 0, b = 0, c = 0, d = 0] = dotted[1].split('.').map(Number);
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return undefined;
  const head = halves[0] === '' ? [] : (halves[0] ?? '').split(':');
  const tail = halves.length < 2 || halves[1] === '' ? [] : (halves[1] ?? '').split(':');

  const missing = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (missing < 0 || head.length + tail.length + missing !== 8) return undefined;

  const groups = [...head, ...Array.from({ length: missing }, () => '0'), ...tail].map((group) =>
    Number.parseInt(group, 16),
  );
  return groups.some((group) => !Number.isInteger(group)) ? undefined : groups;
}

/** The IPv4 address written inside an ::ffff:a.b.c.d or ::a.b.c.d form. */
function mappedIpv4(groups: readonly number[]): readonly number[] | undefined {
  if (!groups.slice(0, 5).every((group) => group === 0)) return undefined;
  const marker = groups[5] ?? 0;
  if (marker !== 0 && marker !== 0xff_ff) return undefined;
  const [high = 0, low = 0] = [groups[6] ?? 0, groups[7] ?? 0];
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

/**
 * The host a URL or bare `host:port` names. Values that start with `/` are
 * paths and name no host, so they get nothing back.
 */
function hostOf(value: string): string | undefined {
  const text = value.trim();
  if (text === '' || text.startsWith('/')) return undefined;
  try {
    const { hostname } = new URL(ABSOLUTE_URL.test(text) ? text : `http://${text}`);
    return hostname === '' ? undefined : hostname;
  } catch {
    return undefined;
  }
}

// --- Heartbeats ------------------------------------------------------------

function scheduledHeartbeat(finding: ScanFinding): HeartbeatCandidate {
  const detail = finding.detail;
  const name = detail?.name ?? detail?.task ?? detail?.workflow;
  return {
    schedule: finding.value,
    kind: finding.kind,
    source: 'scheduled',
    ...(name === undefined ? {} : { name }),
    evidence: finding.evidence,
    ...(detail === undefined ? {} : { detail }),
  };
}

/** A platform cron names the path it calls rather than a command to run. */
function cronHeartbeat(finding: ScanFinding): HeartbeatCandidate {
  const detail = finding.detail ?? {};
  return {
    schedule: detail.schedule ?? '',
    kind: finding.kind,
    source: 'containers',
    name: finding.value,
    evidence: finding.evidence,
    detail: { ...detail, path: finding.value },
  };
}

// --- Shaping ---------------------------------------------------------------

const TARGET_ORDER: Record<CandidateTarget, number> = { url: 0, path: 1, port: 2 };

/**
 * Collapses candidates that share a key into the first of them, keeping the
 * others' evidence so every citation survives. One value must reach the agent
 * once, or it proposes the same monitor twice.
 */
function mergeDuplicates<T extends ScanCandidate>(
  candidates: readonly T[],
  keyOf: (candidate: T) => readonly string[],
): T[] {
  const merged = new Map<string, T>();
  for (const candidate of candidates) {
    const key = keyOf(candidate).join(' ');
    const existing = merged.get(key);
    if (existing === undefined) {
      merged.set(key, candidate);
      continue;
    }
    if (sameEvidence(existing, candidate)) continue;
    merged.set(key, { ...existing, alsoAt: [...(existing.alsoAt ?? []), candidate.evidence] });
  }
  return [...merged.values()];
}

function sameEvidence(left: ScanCandidate, right: ScanCandidate): boolean {
  return (
    (left.evidence.file === right.evidence.file && left.evidence.line === right.evidence.line) ||
    (left.alsoAt ?? []).some(
      (evidence) => evidence.file === right.evidence.file && evidence.line === right.evidence.line,
    )
  );
}

function countReasons(rejected: readonly RejectedCandidate[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const candidate of rejected) {
    counts.set(candidate.reason, (counts.get(candidate.reason) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => compare(left, right)));
}

function compareAccepted(left: ScanCandidate, right: ScanCandidate): number {
  return (
    TARGET_ORDER[left.target] - TARGET_ORDER[right.target] ||
    healthRank(left) - healthRank(right) ||
    compare(left.value, right.value) ||
    compare(left.kind, right.kind) ||
    compareEvidence(left.evidence, right.evidence)
  );
}

/**
 * Health endpoints lead their target group. Rejected candidates never carry the
 * mark, so this contributes nothing to {@link compareRejected}'s ordering.
 */
function healthRank(candidate: ScanCandidate): number {
  return candidate.health === true ? 0 : 1;
}

/**
 * The path of a container healthcheck whose URL was turned down, as a candidate
 * in its own right — or undefined when there is nothing worth recovering.
 *
 * A healthcheck executes inside the container's own network namespace, so it is
 * written against `localhost`, `127.0.0.1`, or a Compose service name almost
 * without exception. Rejecting that URL is correct, and it stays rejected: no
 * monitor can reach it. But the rejection is about the *host*, and the path is
 * a separate fact that outlives it — the repository stating outright which path
 * proves the service is up. Paired with a base URL the user confirms, that is
 * the strongest candidate a scan can produce, so it is recovered here rather
 * than lost to the skip list.
 *
 * Two things are not worth recovering: a bare `/`, which says nothing a route
 * scan has not already found, and a path with an unresolved `${VAR}` in it,
 * which no single URL answers.
 */
function recoveredHealthPath(finding: ScanFinding): ScanCandidate | undefined {
  if (!HEALTHCHECK_KINDS.has(finding.kind)) return undefined;

  const path = pathOf(finding.value);
  if (path === undefined || path === '/') return undefined;
  if (placeholderIn(path) !== undefined) return undefined;

  return {
    target: 'path',
    value: path,
    kind: finding.kind,
    source: 'containers',
    evidence: finding.evidence,
    ...(finding.detail === undefined ? {} : { detail: finding.detail }),
    health: true,
  };
}

/** The path a probe URL names, parsed the same way {@link hostOf} parses its host. */
function pathOf(value: string): string | undefined {
  const text = value.trim();
  if (text === '' || text.startsWith('/')) return undefined;
  try {
    const { pathname } = new URL(ABSOLUTE_URL.test(text) ? text : `http://${text}`);
    return pathname === '' ? undefined : pathname;
  } catch {
    return undefined;
  }
}

/** Container probes that name a URL: the image declares these ARE the health check. */
const HEALTHCHECK_KINDS: ReadonlySet<string> = new Set([
  'compose-healthcheck',
  'docker-healthcheck',
]);

/**
 * Whether a finding is the kind of thing worth monitoring first.
 *
 * Two independent signals, because the evidence differs in strength. A route is
 * a guess from its path — `/api/health` reads like a probe, so it is marked. A
 * container healthcheck needs no guess at all: the repository has already
 * declared that URL to be how the service proves it is up, whatever the path
 * says, which is why it is marked on kind alone. It is also already a whole
 * URL, so it is the rare candidate needing nothing from the user.
 */
function isHealthCandidate(finding: ScanFinding, target: CandidateTarget): boolean {
  if (HEALTHCHECK_KINDS.has(finding.kind)) return true;
  // Keyed on what the value resolved to, not on which scanner produced it: a
  // `/api/health` fronted by a platform rewrite is the same candidate as one
  // declared in a route file.
  return target === 'path' && isHealthPath(finding.value);
}

function compareRejected(left: RejectedCandidate, right: RejectedCandidate): number {
  return compare(left.reason, right.reason) || compareAccepted(left, right);
}

function compareHeartbeats(left: HeartbeatCandidate, right: HeartbeatCandidate): number {
  return (
    compareEvidence(left.evidence, right.evidence) ||
    compare(left.kind, right.kind) ||
    compare(left.schedule, right.schedule)
  );
}

function compareEvidence(left: ScanEvidence, right: ScanEvidence): number {
  return compare(left.file, right.file) || left.line - right.line;
}

/** Byte-order comparison; locale-aware sorting would not be reproducible. */
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

// --- Rendering -------------------------------------------------------------

/**
 * The same document as Markdown, for the agent that reads it as prose and for
 * the run report's "what was skipped and why" section. Every line carries its
 * `file:line` so any claim can be checked against the repository.
 */
export function formatSeedContext(context: SeedContext): string {
  const { summary } = context;
  const lines = [
    `# Scan seed context (schema ${context.schemaVersion})`,
    '',
    `Repository: ${context.repoRoot}`,
    `${summary.accepted} accepted, ${summary.rejected} skipped, ${summary.heartbeats} scheduled ${
      summary.heartbeats === 1 ? 'job' : 'jobs'
    }.`,
  ];

  const groups: readonly { heading: string; target: CandidateTarget }[] = [
    { heading: 'URLs (check the host is public, then monitor as written)', target: 'url' },
    { heading: 'Paths (combine with a base URL the user confirms)', target: 'path' },
    { heading: 'Published ports (combine with a host the user confirms)', target: 'port' },
  ];

  lines.push('', '## Accepted candidates');
  if (context.accepted.some((candidate) => candidate.health === true)) {
    lines.push('', '> ★ marks a likely health endpoint — usually the strongest thing to monitor.');
  }
  if (context.accepted.length === 0) lines.push('', 'None.');
  for (const { heading, target } of groups) {
    const members = context.accepted.filter((candidate) => candidate.target === target);
    if (members.length === 0) continue;
    lines.push('', `### ${heading}`, '');
    for (const candidate of members) lines.push(`- ${candidateLine(candidate)}`);
  }

  // NestJS paths are emitted controller-relative: the scanner never resolves the
  // app's global prefix or RouterModule module→path mounting, so a path here is
  // not an edge-reachable URL and must not read as verified.
  if (context.accepted.some((candidate) => candidate.kind === 'nestjs')) {
    lines.push(
      '',
      '> NestJS (`nestjs`) paths above are controller-relative — the global prefix (`setGlobalPrefix`), its `exclude` list, and `RouterModule.register()` module→path mounting are NOT resolved here. Resolve each into its real, edge-reachable URL before trusting it, or skip it.',
    );
  }

  lines.push('', '## Skipped, and why', '');
  if (context.rejected.length === 0) lines.push('Nothing was skipped.');
  for (const candidate of context.rejected) {
    lines.push(`- ${candidateLine(candidate)} — **${candidate.reason}**: ${candidate.message}`);
  }

  lines.push('', '## Scheduled jobs (heartbeat candidates)', '');
  if (context.heartbeats.length === 0) lines.push('None.');
  for (const heartbeat of context.heartbeats) {
    const schedule = heartbeat.schedule === '' ? 'no schedule declared' : heartbeat.schedule;
    const label = heartbeat.name === undefined ? '' : ` ${heartbeat.name}`;
    lines.push(
      `- \`${schedule}\` — ${heartbeat.kind}${label} — ${citation(heartbeat.evidence)}${detailSuffix(heartbeat.detail)}`,
    );
  }

  return `${lines.join('\n')}\n`;
}

function candidateLine(candidate: ScanCandidate): string {
  const alsoAt = (candidate.alsoAt ?? []).map((evidence) => citation(evidence)).join(', ');
  // Shared with the rejected list, which never carries the mark, so the star
  // only ever appears among accepted candidates.
  const marker = candidate.health === true ? '★ ' : '';
  return `${marker}\`${candidate.value}\` (${candidate.kind}) — ${citation(candidate.evidence)}${
    alsoAt === '' ? '' : `, also ${alsoAt}`
  }${detailSuffix(candidate.detail)}`;
}

function citation(evidence: ScanEvidence): string {
  return `${evidence.file}:${evidence.line}`;
}

function detailSuffix(detail: Readonly<Record<string, string>> | undefined): string {
  if (detail === undefined) return '';
  const entries = Object.entries(detail)
    .sort(([left], [right]) => compare(left, right))
    .map(([key, value]) => `${key}=${value}`);
  return entries.length === 0 ? '' : ` [${entries.join(', ')}]`;
}
