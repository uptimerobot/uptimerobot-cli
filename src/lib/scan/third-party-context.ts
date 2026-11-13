/**
 * The third-party section of the seed context: the walker's findings grouped
 * per provider, and the Markdown that renders them.
 *
 * One provider becomes one candidate whatever the number of signals; its class
 * is runtime when any signal is, its evidence is de-duplicated, and for the
 * five providers tracked by component the signals that name one become
 * component terms, each with the region of its file. A provider known only
 * through a hint (`Procfile`) is not a candidate. Skipped packages
 * and protocol clients are listed by name once, with their first location, so
 * the reader can see what was deliberately left out.
 */
import { componentTerm } from './components.js';
import type { ScanEvidence } from './finding.js';
import type { ThirdPartyFinding } from './third-party.js';
import { VENDORS, type VendorClass } from './vendors.js';

export interface ThirdPartyEvidence extends ScanEvidence {
  /** The signal kind: an ecosystem (`npm`), `file`, `terraform-resource`, `registry`, ... */
  kind: ThirdPartyFinding['kind'];
  /** `package@version`, a file name, `provider "aws"`, `FROM ghcr.io`, ... */
  signal: string;
  /** The app directory relative to the root, `.` for the root. */
  app: string;
}

/** The region a component term was seen in, and the terraform line that declared it. */
export interface ComponentRegion {
  code: string;
  declaredAt: ScanEvidence;
}

/**
 * One component term of a scoped provider: the built-in search text, the
 * region of the file that named it (`null` when none did), and the signals
 * behind it. A term seen in several regions appears once per region.
 */
export interface ThirdPartyComponent {
  term: string;
  region: ComponentRegion | null;
  evidence: readonly ThirdPartyEvidence[];
}

export interface ThirdPartyCandidate {
  /** The provider's exact catalog name. */
  provider: string;
  /** What to pass to `third-party-providers list --search`. */
  searchTerm: string;
  class: VendorClass;
  evidence: readonly ThirdPartyEvidence[];
  /** Empty for every provider outside the five tracked by component. */
  components: readonly ThirdPartyComponent[];
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
  /** Distinct names seen per bucket; the lists below hold at most {@link MAX_MENTIONS} each. */
  totals: { skipped: number; unknown: number };
  /** Frameworks and libraries on the skip list: no outage of theirs reaches the product. */
  skipped: readonly ThirdPartyMention[];
  /**
   * Protocol clients, unmapped dependencies and hint-only providers. One
   * entry per distinct name up to {@link MAX_MENTIONS}, so this is the
   * JSON-only audit trail and can be long; the Markdown counts the unmapped
   * names instead.
   */
  unknown: readonly ThirdPartyMention[];
}

const SEARCH_TERMS = new Map(VENDORS.map((entry) => [entry.catalogName, entry.searchTerm]));

/** Mentions kept per bucket; a manifest can declare thousands of names and the report is not the place for them. */
export const MAX_MENTIONS = 500;

export function buildThirdPartyContext(findings: readonly ThirdPartyFinding[]): ThirdPartyContext {
  const groups = new Map<string, ThirdPartyFinding[]>();
  const mentions = new Map<string, ThirdPartyMention>();
  const seen = { skipped: new Set<string>(), unknown: new Set<string>() };
  for (const finding of findings) {
    if (finding.outcome === 'vendor' || finding.outcome === 'hint') {
      const group = groups.get(finding.value);
      if (group === undefined) groups.set(finding.value, [finding]);
      else group.push(finding);
      continue;
    }
    const reason = finding.outcome === 'skip' ? 'framework' : finding.outcome;
    const bucket = reason === 'framework' ? seen.skipped : seen.unknown;
    if (bucket.has(finding.value)) continue;
    bucket.add(finding.value);
    if (bucket.size > MAX_MENTIONS) continue;
    mentions.set(`${reason}:${finding.value}`, {
      name: finding.value,
      reason,
      evidence: finding.evidence,
    });
  }

  const candidates: ThirdPartyCandidate[] = [];
  for (const [provider, group] of [...groups].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const vendorSignals = group.filter((finding) => finding.outcome === 'vendor');
    const [hint] = group;
    if (vendorSignals.length === 0) {
      if (hint !== undefined && !seen.unknown.has(provider)) {
        seen.unknown.add(provider);
        mentions.set(`hint:${provider}`, {
          name: provider,
          reason: 'hint',
          evidence: hint.evidence,
        });
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
      components: componentsOf(vendorSignals),
    });
  }

  const listed = [...mentions.values()];
  return {
    candidates,
    totals: { skipped: seen.skipped.size, unknown: seen.unknown.size },
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

function regionOf(finding: ThirdPartyFinding): ComponentRegion | null {
  const { detail } = finding;
  if (!('region' in detail) || detail.region === '') return null;
  // Detail values are strings by convention; the line was written by the matcher.
  const line = Number(detail.regionLine);
  if (!Number.isInteger(line) || line < 1) return null;
  return { code: detail.region, declaredAt: { file: finding.evidence.file, line } };
}

/**
 * Groups the findings that name a component by term. A term with no region
 * anywhere is one entry; a term seen in regions is one entry per region, and
 * the region-less signals of that term (a package) count for every region.
 */
function componentsOf(findings: readonly ThirdPartyFinding[]): ThirdPartyComponent[] {
  const byTerm = new Map<
    string,
    { finding: ThirdPartyFinding; region: ComponentRegion | null }[]
  >();
  for (const finding of findings) {
    const term = componentTerm(finding);
    if (term === undefined) continue;
    const items = byTerm.get(term) ?? [];
    items.push({ finding, region: regionOf(finding) });
    byTerm.set(term, items);
  }
  return [...byTerm.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([term, items]): ThirdPartyComponent[] => {
      const regions = new Map<string, ComponentRegion>();
      for (const { region } of items) {
        if (region !== null && !regions.has(region.code)) regions.set(region.code, region);
      }
      const evidenceIn = (code: string | null): ThirdPartyEvidence[] =>
        uniqueEvidence(
          items
            .filter(({ region }) => region === null || region.code === code)
            .map(({ finding }) => finding),
        );
      if (regions.size === 0) return [{ term, region: null, evidence: evidenceIn(null) }];
      return [...regions.values()]
        .sort((left, right) => left.code.localeCompare(right.code))
        .map((region) => ({ term, region, evidence: evidenceIn(region.code) }));
    });
}

// --- Rendering ---------------------------------------------------------------

const PACKAGE_KINDS: ReadonlySet<ThirdPartyFinding['kind']> = new Set([
  'npm',
  'pip',
  'go',
  'gem',
  'composer',
  'cargo',
]);
/**
 * Markdown shows this many evidence items per provider, in walk order, and
 * ends the line with `+N more`; `scan --json` keeps every item. Names on a
 * Skipped line are capped the same way, and every rendered item is clipped.
 */
const MAX_EVIDENCE_PER_LINE = 5;
const MAX_NAMES_PER_LINE = 20;
const MAX_ITEM_LENGTH = 120;

/** Backticks could open a code span in the agent's prompt; a clipped item ends in `...`. */
function rendered(text: string): string {
  const plain = text.replaceAll('`', "'");
  return plain.length > MAX_ITEM_LENGTH ? `${plain.slice(0, MAX_ITEM_LENGTH - 3)}...` : plain;
}

function capped(items: readonly string[], max: number): string[] {
  const shown = items.slice(0, max).map(rendered);
  const hidden = items.length - shown.length;
  return hidden > 0 ? [...shown, `+${hidden} more`] : shown;
}

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

function providerLine(candidate: ThirdPartyCandidate): string {
  const items = capped(candidate.evidence.map(evidenceText), MAX_EVIDENCE_PER_LINE);
  const terms = candidate.components.map(({ term, region }) =>
    region === null ? term : `${term} (${region.code})`,
  );
  const signals = terms.length === 0 ? '' : `; signals: ${terms.join(', ')}`;
  return `${candidate.provider}: ${items.join(', ')}${signals}`;
}

const REASON_LABELS: Readonly<Record<ThirdPartyMentionReason, string>> = {
  framework: 'framework or UI library',
  'protocol-client': 'protocol client, self-hosted or unknown',
  unmapped: 'not in the vendor map',
  hint: 'config hint only, no code or dependency signal',
};

/** The Markdown section, as lines without a trailing blank. */
export function formatThirdPartySection(context: ThirdPartyContext): string[] {
  const lines = [
    '## Third-party providers (candidates for third-party services)',
    '',
    '> These need no base URL: `uptimerobot scan --apply` resolves them against the catalog',
    '> and creates a third-party service per confirmed row.',
  ];
  const runtime = context.candidates.filter((candidate) => candidate.class === 'runtime');
  const buildTime = context.candidates.filter((candidate) => candidate.class === 'build-time');

  lines.push('', '### Runtime (proposed by default)', '');
  if (runtime.length === 0) lines.push('None.');
  for (const candidate of runtime) lines.push(`- ${providerLine(candidate)}`);

  lines.push('', '### Build-time (optional, affects deploys, not users)', '');
  if (buildTime.length === 0) lines.push('None.');
  for (const candidate of buildTime) lines.push(`- ${providerLine(candidate)}`);

  lines.push('', '### Skipped', '');
  const byReason = new Map<ThirdPartyMentionReason, string[]>();
  for (const mention of [...context.skipped, ...context.unknown]) {
    if (mention.reason === 'unmapped') continue;
    byReason.set(mention.reason, [...(byReason.get(mention.reason) ?? []), mention.name]);
  }
  const listedOther = context.unknown.filter((mention) => mention.reason !== 'unmapped').length;
  const unmapped = context.totals.unknown - listedOther;
  if (byReason.size === 0 && unmapped === 0) lines.push('Nothing was skipped.');
  for (const [reason, names] of byReason) {
    lines.push(`- ${capped(names, MAX_NAMES_PER_LINE).join(', ')} (${REASON_LABELS[reason]})`);
  }
  if (unmapped > 0) {
    const listed = unmapped > MAX_MENTIONS ? `the first ${MAX_MENTIONS} listed` : 'listed';
    lines.push(
      `- ${unmapped} other ${unmapped === 1 ? 'dependency' : 'dependencies'} not in the vendor map, ${listed} in the JSON output`,
    );
  }
  return lines;
}
