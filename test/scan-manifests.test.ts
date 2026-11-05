import { describe, expect, it } from 'vitest';
import { type ManifestFinding, matchManifest } from '../src/lib/scan/manifests.js';

const NEXT_PACKAGE_JSON = [
  '{',
  '  "name": "acme-web",',
  '  "description": "stripe datadog openai: none of these words count",',
  '  "private": true,',
  '  "scripts": { "dev": "next dev", "build": "next build" },',
  '  "dependencies": {',
  '    "next": "15.1.0",',
  '    "react": "19.0.0",',
  '    "stripe": "17.4.0",',
  '    "@supabase/supabase-js": "2.47.0",',
  '    "@sentry/nextjs": "8.42.0",',
  '    "resend": "4.0.1",',
  '    "pg": "8.13.0"',
  '  },',
  '  "devDependencies": {',
  '    "typescript": "5.7.2",',
  '    "@octokit/rest": "21.0.0"',
  '  }',
  '}',
  '',
].join('\n');

const REQUIREMENTS = [
  'Django==5.1.4',
  'boto3==1.35.80',
  'django-storages==1.14.4',
  'sendgrid==6.11.0',
  'sentry-sdk==2.19.2',
  'celery==5.4.0',
  'redis>=5.2.1',
  'psycopg[binary]==3.2.3',
  '-r base.txt',
  '# stripe is only mentioned in this comment',
  '',
].join('\n');

const GO_MOD = [
  'module github.com/acme/billing',
  '',
  'go 1.23',
  '',
  'require (',
  '\tcloud.google.com/go/storage v1.47.0',
  '\tgithub.com/stripe/stripe-go/v81 v81.1.0',
  '\tgithub.com/twilio/twilio-go v1.23.8 // indirect',
  ')',
  '',
].join('\n');

function byProvider(findings: readonly ManifestFinding[], provider: string) {
  return findings.find((finding) => finding.outcome === 'vendor' && finding.value === provider);
}

describe('matchManifest on package.json', () => {
  const findings = matchManifest({ path: 'package.json', contents: NEXT_PACKAGE_JSON });

  it('reports each mapped dependency with package@version and its line', () => {
    expect(byProvider(findings, 'Stripe')).toMatchObject({
      kind: 'npm',
      evidence: { file: 'package.json', line: 9 },
      detail: { signal: 'stripe@17.4.0', class: 'runtime', scope: 'dependencies' },
    });
    expect(byProvider(findings, 'Supabase')?.detail).toMatchObject({
      signal: '@supabase/supabase-js@2.47.0',
    });
    expect(byProvider(findings, 'Sentry')?.evidence.line).toBe(11);
    expect(byProvider(findings, 'Resend')).toBeDefined();
  });

  it('classes a devDependency as build-time', () => {
    expect(byProvider(findings, 'GitHub')?.detail).toMatchObject({
      class: 'build-time',
      scope: 'devDependencies',
      signal: '@octokit/rest@21.0.0',
    });
  });

  it('lists frameworks as skipped and protocol clients as unknown, never as vendors', () => {
    const skipped = findings.filter((finding) => finding.outcome === 'skip').map((f) => f.value);
    expect(skipped).toEqual(expect.arrayContaining(['next', 'react', 'typescript']));
    expect(findings.find((finding) => finding.value === 'pg')).toMatchObject({
      outcome: 'protocol-client',
      evidence: { line: 13 },
    });
    expect(
      findings.filter((finding) => finding.outcome === 'vendor').map((f) => f.value),
    ).not.toContain('pg');
  });

  it('ignores free text: the description names three vendors and yields nothing', () => {
    const vendors = findings.filter((finding) => finding.outcome === 'vendor').map((f) => f.value);
    expect(vendors).not.toContain('Datadog');
    expect(vendors).not.toContain('OpenAI');
    expect(vendors.filter((value) => value === 'Stripe')).toHaveLength(1);
  });

  it('returns nothing for malformed JSON instead of throwing', () => {
    expect(matchManifest({ path: 'package.json', contents: '{ not json' })).toEqual([]);
  });
});

describe('matchManifest on requirements.txt', () => {
  const findings = matchManifest({ path: 'requirements.txt', contents: REQUIREMENTS });

  it('reads pins, extras and comparison operators', () => {
    expect(byProvider(findings, 'AWS')).toMatchObject({
      kind: 'pip',
      evidence: { file: 'requirements.txt', line: 2 },
      detail: { signal: 'boto3@1.35.80', class: 'runtime' },
    });
    expect(byProvider(findings, 'SendGrid')?.detail.signal).toBe('sendgrid@6.11.0');
    expect(byProvider(findings, 'Sentry')?.evidence.line).toBe(5);
  });

  it('keeps comments, includes and protocol clients out of the vendor list', () => {
    const vendors = findings.filter((finding) => finding.outcome === 'vendor').map((f) => f.value);
    expect(vendors).toEqual(['AWS', 'SendGrid', 'Sentry']);
    expect(findings.find((finding) => finding.value === 'celery')?.outcome).toBe('protocol-client');
    expect(findings.find((finding) => finding.value === 'redis')?.outcome).toBe('protocol-client');
    expect(findings.find((finding) => finding.value === 'psycopg')?.outcome).toBe(
      'protocol-client',
    );
    expect(findings.find((finding) => finding.value === 'django')?.outcome).toBe('skip');
  });
});

describe('matchManifest on pyproject.toml', () => {
  it('reads PEP 621 and Poetry dependency tables', () => {
    const contents = [
      '[project]',
      'name = "acme"',
      'dependencies = [',
      '  "stripe>=11",',
      '  "openai==1.57.0",',
      ']',
      '',
      '[tool.poetry.dependencies]',
      'python = "^3.12"',
      'anthropic = "0.40.0"',
      'sentry-sdk = { version = "2.19.2", extras = ["django"] }',
      '',
    ].join('\n');
    const findings = matchManifest({ path: 'pyproject.toml', contents });
    expect(byProvider(findings, 'Stripe')).toMatchObject({
      evidence: { line: 4 },
      detail: { signal: 'stripe@>=11' },
    });
    expect(byProvider(findings, 'OpenAI')?.detail.signal).toBe('openai@1.57.0');
    expect(byProvider(findings, 'Anthropic')?.evidence.line).toBe(10);
    expect(byProvider(findings, 'Sentry')?.detail.signal).toBe('sentry-sdk@2.19.2');
  });
});

describe('matchManifest on go.mod', () => {
  const findings = matchManifest({ path: 'go.mod', contents: GO_MOD });

  it('matches module paths by prefix with their version', () => {
    expect(byProvider(findings, 'Google Cloud')).toMatchObject({
      kind: 'go',
      evidence: { line: 6 },
      detail: { signal: 'cloud.google.com/go/storage@v1.47.0' },
    });
    expect(byProvider(findings, 'Stripe')?.detail.signal).toBe(
      'github.com/stripe/stripe-go/v81@v81.1.0',
    );
    expect(byProvider(findings, 'Twilio')?.evidence.line).toBe(8);
  });

  it('does not report the module itself', () => {
    expect(findings.map((finding) => finding.value)).not.toContain('github.com/acme/billing');
  });
});

describe('matchManifest on Gemfile, composer.json and Cargo.toml', () => {
  it('reads Gemfile gem lines', () => {
    const findings = matchManifest({
      path: 'Gemfile',
      contents: [
        "source 'https://rubygems.org'",
        "gem 'rails', '~> 7.2'",
        'gem "stripe", "~> 13.0"',
        "gem 'pg'",
        '',
      ].join('\n'),
    });
    expect(byProvider(findings, 'Stripe')).toMatchObject({
      kind: 'gem',
      evidence: { line: 3 },
      detail: { signal: 'stripe@~> 13.0' },
    });
    expect(findings.find((finding) => finding.value === 'rails')?.outcome).toBe('skip');
  });

  it('reads composer require and require-dev', () => {
    const findings = matchManifest({
      path: 'composer.json',
      contents: [
        '{',
        '  "require": { "php": "^8.3", "stripe/stripe-php": "^16.0" },',
        '  "require-dev": { "phpunit/phpunit": "^11" }',
        '}',
        '',
      ].join('\n'),
    });
    expect(byProvider(findings, 'Stripe')).toMatchObject({
      kind: 'composer',
      evidence: { line: 2 },
      detail: { signal: 'stripe/stripe-php@^16.0', scope: 'require' },
    });
  });

  it('reads Cargo dependency tables', () => {
    const findings = matchManifest({
      path: 'Cargo.toml',
      contents: [
        '[package]',
        'name = "acme"',
        '',
        '[dependencies]',
        'aws-sdk-s3 = "1.60.0"',
        'serde = { version = "1", features = ["derive"] }',
        '',
        '[dev-dependencies]',
        'async-stripe = { version = "0.39", features = ["runtime-tokio-hyper"] }',
        '',
      ].join('\n'),
    });
    expect(byProvider(findings, 'AWS')).toMatchObject({
      kind: 'cargo',
      evidence: { line: 5 },
      detail: { signal: 'aws-sdk-s3@1.60.0', class: 'runtime' },
    });
    expect(byProvider(findings, 'Stripe')?.detail).toMatchObject({
      class: 'build-time',
      scope: 'dev-dependencies',
    });
  });

  it('returns nothing for a file it does not understand', () => {
    expect(matchManifest({ path: 'README.md', contents: 'stripe boto3' })).toEqual([]);
  });
});
