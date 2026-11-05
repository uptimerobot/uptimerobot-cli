import { describe, expect, it } from 'vitest';
import {
  buildThirdPartyContext,
  formatThirdPartySection,
} from '../src/lib/scan/third-party-context.js';
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
        detail: { signal: 'aws_s3', service: 's3', region: 'eu-central-1' },
      }),
      finding('AWS', {
        kind: 'terraform-resource',
        file: 'infra/main.tf',
        line: 20,
        detail: { signal: 'aws_db', service: 'db', region: 'eu-central-1' },
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
        hints: ['eu-central-1', 's3', 'db'],
      },
      {
        provider: 'Stripe',
        searchTerm: 'stripe',
        class: 'runtime',
        evidence: [
          { file: 'package.json', line: 12, kind: 'npm', signal: 'stripe@17.4.0', app: '.' },
        ],
        hints: [],
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
        detail: { signal: 'aws_s3', region: 'eu-central-1', service: 's3' },
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
      '### Runtime (proposed by default)',
      '',
      '- AWS: apps/api: boto3@1.35.80 (requirements.txt:3), infra/main.tf:10 (provider "aws"), infra/main.tf:14 (aws_s3); signals: eu-central-1, s3',
      '- Stripe: stripe@17.4.0 (package.json:12)',
      '- Vercel: vercel.json',
      '',
      '### Build-time (optional, affects deploys, not users)',
      '',
      '- GitHub: git remote: github.com, .github/workflows/ci.yml',
      '- Google Cloud: Dockerfile:1 (FROM gcr.io)',
      '',
      '### Skipped',
      '',
      '- next, react (framework or UI library)',
      '- pg (protocol client, self-hosted or unknown)',
      '- 2 other dependencies not in the vendor map, listed in the JSON output',
    ]);
  });

  it('says so when there is nothing in a group', () => {
    expect(formatThirdPartySection(buildThirdPartyContext([]))).toEqual([
      '## Third-party providers (candidates for third-party services)',
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
      '- Heroku (hint only, no other signal)',
      '- 1 other dependency not in the vendor map, listed in the JSON output',
    ]);
  });
});
