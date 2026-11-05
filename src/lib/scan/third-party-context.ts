/**
 * The third-party section of the seed context: the walker's findings grouped
 * per provider, and the Markdown that renders them.
 *
 * One provider becomes one candidate whatever the number of signals; its class
 * is runtime when any signal is, its evidence is de-duplicated, and the plain
 * service and region words of its terraform signals become hints. A provider
 * known only through a hint (`Procfile`) is not a candidate. Skipped packages
 * and protocol clients are listed by name once, with their first location, so
 * the reader can see what was deliberately left out.
 */
import type { ScanEvidence } from './finding.js';
import type { ThirdPartyFinding } from './third-party.js';
import { VENDORS, type VendorClass } from './vendors.js';

export interface ThirdPartyEvidence extends ScanEvidence {
  /** The signal kind: an ecosystem (`npm`), `file`, `terraform-resource`, `registry`, ... */
  kind: string;
  /** `package@version`, a file name, `provider "aws"`, `FROM ghcr.io`, ... */
  signal: string;
  /** The app directory relative to the root, `.` for the root. */
  app: string;
}

export interface ThirdPartyCandidate {
  /** The provider's exact catalog name. */
  provider: string;
  /** What to pass to `third-party-providers list --search`. */
  searchTerm: string;
  class: VendorClass;
  evidence: readonly ThirdPartyEvidence[];
  /** Plain words: terraform service names and regions, never a resource name. */
  hints: readonly string[];
}

export type ThirdPartyMentionReason = 'framework' | 'protocol-client' | 'unmapped' | 'hint';

/** A name the scan saw and does not propose, with its first location. */
export interface ThirdPartyMention {
  name: string;
  reason: ThirdPartyMentionReason;
  evidence: ScanEvidence;
}

export interface ThirdPartyContext {
  candidates: readonly ThirdPartyCandidate[];
  /** Frameworks and libraries on the skip list: no outage of theirs reaches the product. */
  skipped: readonly ThirdPartyMention[];
  /** Protocol clients, unmapped dependencies and hint-only providers. */
  unknown: readonly ThirdPartyMention[];
}

const SEARCH_TERMS = new Map(VENDORS.map((entry) => [entry.catalogName, entry.searchTerm]));

export function buildThirdPartyContext(findings: readonly ThirdPartyFinding[]): ThirdPartyContext {
  const groups = new Map<string, ThirdPartyFinding[]>();
  const mentions = new Map<string, ThirdPartyMention>();
  for (const finding of findings) {
    if (finding.outcome === 'vendor' || finding.outcome === 'hint') {
      groups.set(finding.value, [...(groups.get(finding.value) ?? []), finding]);
      continue;
    }
    const reason = finding.outcome === 'skip' ? 'framework' : finding.outcome;
    if (!mentions.has(finding.value)) {
      mentions.set(finding.value, { name: finding.value, reason, evidence: finding.evidence });
    }
  }

  const candidates: ThirdPartyCandidate[] = [];
  for (const [provider, group] of [...groups].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const vendorSignals = group.filter((finding) => finding.outcome === 'vendor');
    if (vendorSignals.length === 0) {
      const hint = group[0];
      if (hint !== undefined) {
        if (!mentions.has(provider)) {
          mentions.set(provider, { name: provider, reason: 'hint', evidence: hint.evidence });
        }
      }
      continue;
    }
    candidates.push({
      provider,
      searchTerm: SEARCH_TERMS.get(provider) ?? provider.toLowerCase(),
      class: vendorSignals.some((finding) => finding.detail.class === 'runtime')
        ? 'runtime'
        : 'build-time',
      evidence: uniqueEvidence(vendorSignals),
      hints: hintsOf(vendorSignals),
    });
  }

  const listed = [...mentions.values()];
  return {
    candidates,
    skipped: listed.filter((mention) => mention.reason === 'framework'),
    unknown: listed.filter((mention) => mention.reason !== 'framework'),
  };
}

function uniqueEvidence(findings: readonly ThirdPartyFinding[]): ThirdPartyEvidence[] {
  const seen = new Set<string>();
  const evidence: ThirdPartyEvidence[] = [];
  for (const finding of findings) {
    const item: ThirdPartyEvidence = {
      file: finding.evidence.file,
      line: finding.evidence.line,
      kind: finding.kind,
      signal: finding.detail.signal,
      app: finding.detail.app,
    };
    const key = `${item.app}\u0000${item.file}\u0000${item.line}\u0000${item.signal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push(item);
  }
  return evidence;
}

function hintsOf(findings: readonly ThirdPartyFinding[]): string[] {
  const words = new Set<string>();
  for (const finding of findings) {
    const service = 'service' in finding.detail ? finding.detail.service : '';
    const region = 'region' in finding.detail ? finding.detail.region : '';
    if (service !== '') words.add(service);
    if (region !== '') words.add(region);
  }
  return [...words].sort();
}

// --- Rendering ---------------------------------------------------------------

const PACKAGE_KINDS = new Set(['npm', 'pip', 'go', 'gem', 'composer', 'cargo']);
/** Markdown shows this many evidence items per provider; the JSON output keeps them all. */
const MAX_EVIDENCE_PER_LINE = 5;

/** `stripe@17.4.0 (package.json:12)`, `vercel.json`, `infra/main.tf:10 (provider "aws")`. */
function evidenceText(evidence: ThirdPartyEvidence): string {
  const prefix = evidence.app === '.' ? '' : `${evidence.app}: `;
  if (PACKAGE_KINDS.has(evidence.kind)) {
    return `${prefix}${evidence.signal} (${evidence.file}:${evidence.line})`;
  }
  if (evidence.kind === 'file' || evidence.kind === 'git-host')
    return `${prefix}${evidence.signal}`;
  if (evidence.kind === 'ci-file') return `${prefix}${evidence.file}`;
  return `${prefix}${evidence.file}:${evidence.line} (${evidence.signal})`;
}

function candidateLine(candidate: ThirdPartyCandidate): string {
  const shown = candidate.evidence.slice(0, MAX_EVIDENCE_PER_LINE).map(evidenceText);
  const hidden = candidate.evidence.length - shown.length;
  const items = hidden > 0 ? [...shown, `+${hidden} more`] : shown;
  const hints = candidate.hints.length === 0 ? '' : `; signals: ${candidate.hints.join(', ')}`;
  return `- ${candidate.provider}: ${items.join(', ')}${hints}`;
}

const REASON_LABELS: Readonly<Record<ThirdPartyMentionReason, string>> = {
  framework: 'framework or UI library',
  'protocol-client': 'protocol client, self-hosted or unknown',
  unmapped: 'not in the vendor map',
  hint: 'hint only, no other signal',
};

/** The Markdown section, as lines without a trailing blank. */
export function formatThirdPartySection(context: ThirdPartyContext): string[] {
  const lines = ['## Third-party providers (candidates for third-party services)'];
  const runtime = context.candidates.filter((candidate) => candidate.class === 'runtime');
  const buildTime = context.candidates.filter((candidate) => candidate.class === 'build-time');

  lines.push('', '### Runtime (proposed by default)', '');
  if (runtime.length === 0) lines.push('None.');
  for (const candidate of runtime) lines.push(candidateLine(candidate));

  lines.push('', '### Build-time (optional, affects deploys, not users)', '');
  if (buildTime.length === 0) lines.push('None.');
  for (const candidate of buildTime) lines.push(candidateLine(candidate));

  lines.push('', '### Skipped', '');
  const byReason = new Map<ThirdPartyMentionReason, string[]>();
  for (const mention of [...context.skipped, ...context.unknown]) {
    if (mention.reason === 'unmapped') continue;
    byReason.set(mention.reason, [...(byReason.get(mention.reason) ?? []), mention.name]);
  }
  const unmapped = context.unknown.filter((mention) => mention.reason === 'unmapped').length;
  if (byReason.size === 0 && unmapped === 0) lines.push('Nothing was skipped.');
  for (const [reason, names] of byReason) {
    lines.push(`- ${names.join(', ')} (${REASON_LABELS[reason]})`);
  }
  if (unmapped > 0) {
    lines.push(
      `- ${unmapped} other ${unmapped === 1 ? 'dependency' : 'dependencies'} not in the vendor map, listed in the JSON output`,
    );
  }
  return lines;
}
