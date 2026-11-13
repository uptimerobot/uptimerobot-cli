import { describe, expect, it } from 'vitest';
import {
  buildThirdPartyContext,
  formatThirdPartySection,
} from '../src/lib/scan/third-party-context.js';
import { COMPONENT_RULES, terraformComponent } from '../src/lib/scan/components.js';
import { VENDORS } from '../src/lib/scan/vendors.js';
import type { ThirdPartyFinding } from '../src/lib/scan/third-party.js';

type Overrides = Partial<Omit<ThirdPartyFinding, 'detail' | 'evidence'>> & {
  detail?: Partial<ThirdPartyFinding['detail']>;
  file?: string;
  line?: number;
};

/** A vendor finding from a package manifest unless overridden. */
function finding(value: string, overrides: Overrides = {}): ThirdPartyFinding {
  const { detail, file, line, ...rest } = overrides;
  return {
    kind: 'npm',
    outcome: 'vendor',
    value,
    evidence: { file: file ?? 'package.json', line: line ?? 1 },
    detail: {
      signal: `${value.toLowerCase()}@1.0.0`,
      package: value.toLowerCase(),
      version: '1.0.0',
      scope: 'dependencies',
      class: 'runtime',
      app: '.',
      ...detail,
    },
    ...rest,
  };
}

describe('buildThirdPartyContext', () => {
  it('groups every signal of a provider into one candidate with its search term', () => {
    const context = buildThirdPartyContext([
      finding('AWS', {
        kind: 'pip',
        file: 'requirements.txt',
        line: 3,
        detail: { signal: 'boto3@1.35.80' },
      }),
      finding('AWS', {
        kind: 'terraform-provider',
        file: 'infra/main.tf',
        line: 10,
        detail: { signal: 'provider "aws"', service: '', region: 'eu-central-1' },
      }),
      finding('AWS', {
        kind: 'terraform-resource',
        file: 'infra/main.tf',
        line: 14,
        detail: {
          signal: 'aws_s3',
          service: 's3',
          component: 'Amazon Simple Storage Service',
          region: 'eu-central-1',
          regionLine: '9',
        },
      }),
      finding('AWS', {
        kind: 'terraform-resource',
        file: 'infra/main.tf',
        line: 20,
        detail: {
          signal: 'aws_db',
          service: 'db',
          component: 'Amazon Relational Database Service',
          region: 'eu-central-1',
          regionLine: '9',
        },
      }),
      finding('Stripe', { line: 12, detail: { signal: 'stripe@17.4.0' } }),
    ]);
    expect(context.candidates).toEqual([
      {
        provider: 'AWS',
        searchTerm: 'aws',
        class: 'runtime',
        evidence: [
          { file: 'requirements.txt', line: 3, kind: 'pip', signal: 'boto3@1.35.80', app: '.' },
          {
            file: 'infra/main.tf',
            line: 10,
            kind: 'terraform-provider',
            signal: 'provider "aws"',
            app: '.',
          },
          {
            file: 'infra/main.tf',
            line: 14,
            kind: 'terraform-resource',
            signal: 'aws_s3',
            app: '.',
          },
          {
            file: 'infra/main.tf',
            line: 20,
            kind: 'terraform-resource',
            signal: 'aws_db',
            app: '.',
          },
        ],
        components: [
          {
            term: 'Amazon Relational Database Service',
            region: { code: 'eu-central-1', declaredAt: { file: 'infra/main.tf', line: 9 } },
            evidence: [
              {
                file: 'infra/main.tf',
                line: 20,
                kind: 'terraform-resource',
                signal: 'aws_db',
                app: '.',
              },
            ],
          },
          {
            term: 'Amazon Simple Storage Service',
            region: { code: 'eu-central-1', declaredAt: { file: 'infra/main.tf', line: 9 } },
            evidence: [
              {
                file: 'infra/main.tf',
                line: 14,
                kind: 'terraform-resource',
                signal: 'aws_s3',
                app: '.',
              },
            ],
          },
        ],
      },
      {
        provider: 'Stripe',
        searchTerm: 'stripe',
        class: 'runtime',
        evidence: [
          { file: 'package.json', line: 12, kind: 'npm', signal: 'stripe@17.4.0', app: '.' },
        ],
        components: [],
      },
    ]);
    expect(context.skipped).toEqual([]);
    expect(context.unknown).toEqual([]);
  });

  it('classes a provider runtime when any signal is, build-time when none is', () => {
    const context = buildThirdPartyContext([
      finding('Google Cloud', {
        kind: 'registry',
        file: 'Dockerfile',
        detail: { signal: 'FROM gcr.io', class: 'build-time' },
      }),
      finding('Google Cloud', {
        kind: 'go',
        file: 'go.mod',
        line: 6,
        detail: { signal: 'cloud.google.com/go/storage@v1.47.0' },
      }),
      finding('GitHub', {
        kind: 'ci-file',
        file: '.github/workflows/ci.yml',
        detail: { signal: 'ci: .github/workflows/', class: 'build-time' },
      }),
      finding('GitHub', {
        detail: { signal: '@octokit/rest@21.0.0', scope: 'devDependencies', class: 'build-time' },
      }),
      finding('Microsoft Azure', {
        kind: 'terraform-provider',
        file: 'main.tf',
        detail: { signal: 'provider "azurerm"' },
      }),
    ]);
    expect(
      context.candidates.map((candidate) => [
        candidate.provider,
        candidate.class,
        candidate.searchTerm,
      ]),
    ).toEqual([
      ['GitHub', 'build-time', 'github'],
      ['Google Cloud', 'runtime', 'google cloud'],
      ['Microsoft Azure', 'runtime', 'azure'],
    ]);
  });

  it('de-duplicates evidence and keeps app prefixes apart', () => {
    const context = buildThirdPartyContext([
      finding('Stripe', { detail: { app: 'apps/web' }, file: 'apps/web/package.json' }),
      finding('Stripe', { detail: { app: 'apps/web' }, file: 'apps/web/package.json' }),
      finding('Stripe', { detail: { app: 'apps/api' }, file: 'apps/api/package.json' }),
    ]);
    expect(context.candidates[0]?.evidence.map((evidence) => evidence.app)).toEqual([
      'apps/web',
      'apps/api',
    ]);
  });

  it('lists skipped and unknown names once, with their first location, and hint-only providers as unknown', () => {
    const context = buildThirdPartyContext([
      finding('next', { outcome: 'skip', line: 9 }),
      finding('next', { outcome: 'skip', line: 30, file: 'apps/web/package.json' }),
      finding('pg', { outcome: 'protocol-client', line: 11 }),
      finding('left-pad', { outcome: 'unmapped', line: 12 }),
      finding('Heroku', {
        outcome: 'hint',
        kind: 'file',
        file: 'Procfile',
        detail: { signal: 'Procfile' },
      }),
    ]);
    expect(context.candidates).toEqual([]);
    expect(context.skipped).toEqual([
      { name: 'next', reason: 'framework', evidence: { file: 'package.json', line: 9 } },
    ]);
    expect(context.unknown).toEqual([
      { name: 'pg', reason: 'protocol-client', evidence: { file: 'package.json', line: 11 } },
      { name: 'left-pad', reason: 'unmapped', evidence: { file: 'package.json', line: 12 } },
      { name: 'Heroku', reason: 'hint', evidence: { file: 'Procfile', line: 1 } },
    ]);
  });

  it('keeps a build-time provider a candidate when only a hint sits beside it', () => {
    const context = buildThirdPartyContext([
      finding('Heroku', {
        outcome: 'hint',
        kind: 'file',
        file: 'Procfile',
        detail: { signal: 'Procfile' },
      }),
      finding('Heroku', {
        detail: { signal: 'heroku@1.0.0', scope: 'devDependencies', class: 'build-time' },
      }),
    ]);
    expect(context.candidates.map((candidate) => [candidate.provider, candidate.class])).toEqual([
      ['Heroku', 'build-time'],
    ]);
    expect(context.unknown).toEqual([]);
  });

  it('keeps a provider a candidate when a hint sits beside a real signal', () => {
    const context = buildThirdPartyContext([
      finding('Heroku', {
        outcome: 'hint',
        kind: 'file',
        file: 'Procfile',
        detail: { signal: 'Procfile' },
      }),
      finding('Heroku', { kind: 'file', file: 'heroku.yml', detail: { signal: 'heroku.yml' } }),
    ]);
    expect(context.candidates.map((candidate) => candidate.provider)).toEqual(['Heroku']);
    expect(context.candidates[0]?.evidence.map((evidence) => evidence.signal)).toEqual([
      'heroku.yml',
    ]);
    expect(context.unknown).toEqual([]);
  });
});

describe('component terms', () => {
  /** The real resource types behind the short signals the tests use. */
  const TYPES: Record<string, string> = {
    aws_s3: 'aws_s3_bucket',
    aws_db: 'aws_db_instance',
    aws_lambda: 'aws_lambda_function',
    aws_sqs: 'aws_sqs_queue',
    aws_iam: 'aws_iam_role',
    azurerm_storage: 'azurerm_storage_account',
  };
  const tf = (
    provider: string,
    file: string,
    line: number,
    signal: string,
    service: string,
    region = '',
    regionLine = '',
    resource = TYPES[signal] ?? `${signal}_x`,
  ): ThirdPartyFinding =>
    finding(provider, {
      kind: 'terraform-resource',
      file,
      line,
      detail: {
        signal,
        service,
        component: terraformComponent(provider, resource) ?? '',
        region,
        regionLine,
      },
    });
  const componentsByProvider = (findings: ThirdPartyFinding[]) =>
    buildThirdPartyContext(findings).candidates.map((candidate) => [
      candidate.provider,
      candidate.components.map(({ term, region, evidence }) => ({
        term,
        region: region === null ? null : region.code,
        evidence: evidence.map((item) => `${item.file}:${item.line}`),
      })),
    ]);

  it('names one term per service word, with the region of its file, and merges region-less package evidence into it', () => {
    expect(
      componentsByProvider([
        finding('AWS', {
          line: 4,
          detail: { signal: '@aws-sdk/client-s3@3.700.0', package: '@aws-sdk/client-s3' },
        }),
        tf('AWS', 'infra/main.tf', 14, 'aws_s3', 's3', 'eu-central-1', '9'),
        tf('AWS', 'infra/main.tf', 20, 'aws_db', 'db', 'eu-central-1', '9'),
        tf('AWS', 'infra/main.tf', 26, 'aws_s3', 's3', 'eu-central-1', '9'),
      ]),
    ).toEqual([
      [
        'AWS',
        [
          {
            term: 'Amazon Relational Database Service',
            region: 'eu-central-1',
            evidence: ['infra/main.tf:20'],
          },
          {
            term: 'Amazon Simple Storage Service',
            region: 'eu-central-1',
            evidence: ['package.json:4', 'infra/main.tf:14', 'infra/main.tf:26'],
          },
        ],
      ],
    ]);
  });

  it('lists a term once per region when two files place it in two regions', () => {
    expect(
      componentsByProvider([
        tf('AWS', 'infra/eu.tf', 5, 'aws_s3', 's3', 'eu-central-1', '2'),
        tf('AWS', 'infra/us.tf', 5, 'aws_lambda', 'lambda', 'us-east-1', '2'),
        tf('AWS', 'infra/us.tf', 9, 'aws_s3', 's3', 'us-east-1', '2'),
      ]),
    ).toEqual([
      [
        'AWS',
        [
          {
            term: 'Amazon Simple Storage Service',
            region: 'eu-central-1',
            evidence: ['infra/eu.tf:5'],
          },
          {
            term: 'Amazon Simple Storage Service',
            region: 'us-east-1',
            evidence: ['infra/us.tf:9'],
          },
          { term: 'AWS Lambda', region: 'us-east-1', evidence: ['infra/us.tf:5'] },
        ],
      ],
    ]);
  });

  it('keeps the region null for a package-only term, for Azure, and for a service word with no region', () => {
    expect(
      componentsByProvider([
        finding('Google Cloud', {
          detail: { signal: '@google-cloud/storage@7.0.0', package: '@google-cloud/storage' },
        }),
        tf('Microsoft Azure', 'infra/az.tf', 3, 'azurerm_storage', 'storage', '', ''),
        tf('AWS', 'infra/main.tf', 3, 'aws_sqs', 'sqs'),
      ]),
    ).toEqual([
      [
        'AWS',
        [{ term: 'Amazon Simple Queue Service', region: null, evidence: ['infra/main.tf:3'] }],
      ],
      [
        'Google Cloud',
        [{ term: 'Google Cloud Storage', region: null, evidence: ['package.json:1'] }],
      ],
      [
        'Microsoft Azure',
        [{ term: 'Storage Accounts', region: null, evidence: ['infra/az.tf:3'] }],
      ],
    ]);
  });

  it('maps Cloudflare and GitHub signals that are not packages or resources', () => {
    expect(
      componentsByProvider([
        finding('Cloudflare', {
          kind: 'file',
          file: 'wrangler.toml',
          detail: { signal: 'wrangler.toml' },
        }),
        finding('GitHub', {
          kind: 'ci-file',
          file: '.github/workflows/ci.yml',
          detail: { signal: 'ci: .github/workflows/', class: 'build-time' },
        }),
        finding('GitHub', {
          kind: 'git-host',
          file: '.git/config',
          line: 7,
          detail: { signal: 'git remote: github.com', class: 'build-time' },
        }),
        finding('GitHub', {
          kind: 'registry',
          file: 'Dockerfile',
          line: 1,
          detail: { signal: 'FROM ghcr.io', class: 'build-time' },
        }),
        finding('GitHub', {
          kind: 'npm',
          line: 9,
          detail: { signal: '@octokit/rest@21.0.0', package: '@octokit/rest', class: 'build-time' },
        }),
      ]),
    ).toEqual([
      ['Cloudflare', [{ term: 'Workers', region: null, evidence: ['wrangler.toml:1'] }]],
      [
        'GitHub',
        [
          { term: 'Actions', region: null, evidence: ['.github/workflows/ci.yml:1'] },
          { term: 'API Requests', region: null, evidence: ['package.json:9'] },
          { term: 'Git Operations', region: null, evidence: ['.git/config:7'] },
          { term: 'Packages', region: null, evidence: ['Dockerfile:1'] },
        ],
      ],
    ]);
  });

  it('keeps a terraform resource without a region out of the region entries another file made', () => {
    expect(
      componentsByProvider([
        tf('AWS', 'infra/eu.tf', 5, 'aws_s3', 's3', 'eu-central-1', '2'),
        tf('AWS', 'infra/multi.tf', 9, 'aws_s3', 's3'),
        finding('AWS', {
          line: 4,
          detail: { signal: '@aws-sdk/client-s3@3.0.0', package: '@aws-sdk/client-s3' },
        }),
      ]),
    ).toEqual([
      [
        'AWS',
        [
          { term: 'Amazon Simple Storage Service', region: null, evidence: ['infra/multi.tf:9'] },
          {
            term: 'Amazon Simple Storage Service',
            region: 'eu-central-1',
            evidence: ['infra/eu.tf:5', 'package.json:4'],
          },
        ],
      ],
    ]);
  });

  it('keeps at most twenty component entries per provider', () => {
    const findings = Array.from({ length: 25 }, (_, index) =>
      tf(
        'AWS',
        `infra/r${index}.tf`,
        1,
        'aws_s3',
        's3',
        `us-east-${String(index + 1).padStart(2, '0')}`,
        '1',
      ),
    );
    expect(componentsByProvider(findings)[0]?.[1]).toHaveLength(20);
    const section = formatThirdPartySection(buildThirdPartyContext(findings)).join('\n');
    expect(section).toContain('(us-east-20)');
    expect(section).not.toContain('us-east-21');
  });

  it('gives an unmapped signal of a scoped provider no term, and a provider outside the five an empty list', () => {
    expect(
      componentsByProvider([
        finding('AWS', { detail: { signal: 'boto3@1.35.80', package: 'boto3' }, kind: 'pip' }),
        tf('AWS', 'infra/main.tf', 3, 'aws_iam', 'iam', 'eu-central-1', '1'),
        finding('Stripe'),
      ]),
    ).toEqual([
      ['AWS', []],
      ['Stripe', []],
    ]);
  });
});

describe('COMPONENT_RULES', () => {
  it('keys every table on a vendor catalog name and keeps terms non-empty and unique per provider', () => {
    const names = new Set(VENDORS.map((entry) => entry.catalogName));
    for (const [provider, rules] of COMPONENT_RULES) {
      expect(names.has(provider), provider).toBe(true);
      const terms = rules.map(({ term }) => term);
      expect(terms.every((term) => term.length > 0)).toBe(true);
      expect(new Set(terms).size, provider).toBe(terms.length);
    }
  });
});

describe('formatThirdPartySection', () => {
  it('renders the contract section with evidence text per signal kind', () => {
    const context = buildThirdPartyContext([
      finding('Stripe', { line: 12, detail: { signal: 'stripe@17.4.0' } }),
      finding('Vercel', { kind: 'file', file: 'vercel.json', detail: { signal: 'vercel.json' } }),
      finding('AWS', {
        kind: 'pip',
        file: 'requirements.txt',
        line: 3,
        detail: { signal: 'boto3@1.35.80', app: 'apps/api' },
      }),
      finding('AWS', {
        kind: 'terraform-provider',
        file: 'infra/main.tf',
        line: 10,
        detail: { signal: 'provider "aws"', region: 'eu-central-1', service: '' },
      }),
      finding('AWS', {
        kind: 'terraform-resource',
        file: 'infra/main.tf',
        line: 14,
        detail: {
          signal: 'aws_s3',
          region: 'eu-central-1',
          regionLine: '9',
          service: 's3',
          component: 'Amazon Simple Storage Service',
        },
      }),
      finding('GitHub', {
        kind: 'git-host',
        file: '.git/config',
        line: 2,
        detail: { signal: 'git remote: github.com', class: 'build-time' },
      }),
      finding('GitHub', {
        kind: 'ci-file',
        file: '.github/workflows/ci.yml',
        detail: { signal: 'ci: .github/workflows/', class: 'build-time' },
      }),
      finding('Google Cloud', {
        kind: 'registry',
        file: 'Dockerfile',
        line: 1,
        detail: { signal: 'FROM gcr.io', class: 'build-time' },
      }),
      finding('next', { outcome: 'skip', line: 9 }),
      finding('react', { outcome: 'skip', line: 10 }),
      finding('pg', { outcome: 'protocol-client', line: 11 }),
      finding('left-pad', { outcome: 'unmapped', line: 12 }),
      finding('lodash', { outcome: 'unmapped', line: 13 }),
    ]);
    expect(formatThirdPartySection(context)).toEqual([
      '## Third-party providers (candidates for third-party services)',
      '',
      '> These need no base URL: `uptimerobot scan --apply` resolves them against the catalog',
      '> and creates a third-party service per confirmed row.',
      '',
      '### Runtime (proposed by default)',
      '',
      '- AWS: apps/api: boto3@1.35.80 (requirements.txt:3), infra/main.tf:10 (provider "aws"), infra/main.tf:14 (aws_s3); signals: Amazon Simple Storage Service (eu-central-1)',
      '- Stripe: stripe@17.4.0 (package.json:12)',
      '- Vercel: vercel.json',
      '',
      '### Build-time (optional, affects deploys, not users)',
      '',
      '- GitHub: git remote: github.com, .github/workflows/ci.yml; signals: Actions, Git Operations',
      '- Google Cloud: Dockerfile:1 (FROM gcr.io)',
      '',
      '### Skipped',
      '',
      '- next, react (framework or UI library)',
      '- pg (protocol client, self-hosted or unknown)',
      '- 2 other dependencies not in the vendor map, listed in the JSON output',
    ]);
  });

  it('shows at most five evidence items per provider and counts the rest', () => {
    const context = buildThirdPartyContext(
      Array.from({ length: 7 }, (_, index) =>
        finding('Stripe', {
          file: `apps/a${index}/package.json`,
          detail: { app: `apps/a${index}` },
        }),
      ),
    );
    const line = formatThirdPartySection(context).find((text) => text.startsWith('- Stripe'));
    expect(line).toBe(
      '- Stripe: apps/a0: stripe@1.0.0 (apps/a0/package.json:1), apps/a1: stripe@1.0.0 (apps/a1/package.json:1), apps/a2: stripe@1.0.0 (apps/a2/package.json:1), apps/a3: stripe@1.0.0 (apps/a3/package.json:1), apps/a4: stripe@1.0.0 (apps/a4/package.json:1), +2 more',
    );
    expect(context.candidates[0]?.evidence).toHaveLength(7);
  });

  it('caps the names on a Skipped line and the mentions it keeps, counting the rest', () => {
    const findings = [
      ...Array.from({ length: 25 }, (_, index) =>
        finding(`@types/t${index}`, { outcome: 'skip', line: index + 1 }),
      ),
      ...Array.from({ length: 600 }, (_, index) =>
        finding(`dep-${index}`, { outcome: 'unmapped', line: index + 1 }),
      ),
      finding('pg', { outcome: 'protocol-client', line: 999 }),
    ];
    const context = buildThirdPartyContext(findings);
    expect(context.totals).toEqual({ skipped: 25, unknown: 601 });
    expect(context.skipped).toHaveLength(25);
    expect(context.unknown).toHaveLength(500);
    expect(context.unknown.some((mention) => mention.name === 'pg')).toBe(false);
    const lines = formatThirdPartySection(context);
    const skippedLine = lines.find((line) => line.includes('framework or UI library'));
    expect(skippedLine?.split(', ')).toHaveLength(21);
    expect(skippedLine).toContain('+5 more (framework or UI library)');
    expect(lines.at(-1)).toBe(
      '- 601 other dependencies not in the vendor map, the first 500 listed in the JSON output',
    );
  });

  it('keeps a name that is skipped in one place and unmapped in another in both lists', () => {
    const context = buildThirdPartyContext([
      finding('shared', { outcome: 'skip', line: 1 }),
      finding('shared', { outcome: 'unmapped', line: 2 }),
    ]);
    expect(context.totals).toEqual({ skipped: 1, unknown: 1 });
    expect(context.skipped.map((mention) => mention.name)).toEqual(['shared']);
    expect(context.unknown.map((mention) => mention.name)).toEqual(['shared']);
  });

  it('clips a long rendered item and never prints a backtick', () => {
    const context = buildThirdPartyContext([
      finding('Stripe', {
        file: `${'a'.repeat(150)}/package.json`,
        detail: { app: `\`${'a'.repeat(150)}`, signal: 'stripe@1.0.0' },
      }),
    ]);
    const line = formatThirdPartySection(context).find((text) => text.startsWith('- Stripe'));
    expect(line).not.toContain('`');
    expect(line?.length).toBeLessThan(140);
    expect(line?.endsWith('...')).toBe(true);
  });

  it('says so when there is nothing in a group', () => {
    expect(formatThirdPartySection(buildThirdPartyContext([]))).toEqual([
      '## Third-party providers (candidates for third-party services)',
      '',
      '> These need no base URL: `uptimerobot scan --apply` resolves them against the catalog',
      '> and creates a third-party service per confirmed row.',
      '',
      '### Runtime (proposed by default)',
      '',
      'None.',
      '',
      '### Build-time (optional, affects deploys, not users)',
      '',
      'None.',
      '',
      '### Skipped',
      '',
      'Nothing was skipped.',
    ]);
  });

  it('names a hint-only provider under Skipped', () => {
    const context = buildThirdPartyContext([
      finding('Heroku', {
        outcome: 'hint',
        kind: 'file',
        file: 'Procfile',
        detail: { signal: 'Procfile' },
      }),
      finding('left-pad', { outcome: 'unmapped' }),
    ]);
    expect(formatThirdPartySection(context).slice(-2)).toEqual([
      '- Heroku (config hint only, no code or dependency signal)',
      '- 1 other dependency not in the vendor map, listed in the JSON output',
    ]);
  });
});
