import { describe, expect, it } from 'vitest';
import { type ConfigFinding, matchConfig, resolveVendorClasses } from '../src/lib/scan/config.js';

const vendors = (findings: readonly ConfigFinding[]) => findings.map((finding) => finding.value);
const only = (findings: readonly ConfigFinding[]): ConfigFinding => {
  const [first, ...rest] = findings;
  if (first === undefined || rest.length > 0)
    throw new Error(`expected one finding, got ${findings.length}`);
  return first;
};

describe('deploy and platform files', () => {
  it.each([
    ['vercel.json', 'Vercel'],
    ['netlify.toml', 'Netlify'],
    ['fly.toml', 'Fly.io'],
    ['wrangler.toml', 'Cloudflare'],
    ['wrangler.jsonc', 'Cloudflare'],
    ['firebase.json', 'Firebase'],
    ['render.yaml', 'Render'],
    ['railway.json', 'Railway'],
    ['railway.toml', 'Railway'],
    ['heroku.yml', 'Heroku'],
  ])('%s names %s by existence alone', (name, vendor) => {
    const finding = only(matchConfig({ path: `apps/web/${name}`, contents: '{}' }));
    expect(finding).toMatchObject({
      kind: 'file',
      outcome: 'vendor',
      value: vendor,
      evidence: { file: `apps/web/${name}`, line: 1 },
      detail: { signal: name, class: 'runtime' },
    });
  });

  it('reads the provider name out of serverless.yml', () => {
    const nested = ['service: api', 'provider:', '  name: google', '  runtime: nodejs20'].join(
      '\n',
    );
    expect(only(matchConfig({ path: 'serverless.yml', contents: nested }))).toMatchObject({
      kind: 'file',
      value: 'Google Cloud',
      evidence: { line: 3 },
      detail: { signal: 'serverless.yml provider google', class: 'runtime' },
    });
  });

  it.each([
    ['an inline provider', 'provider: aws\n', ['AWS']],
    ['a nested name in serverless.yaml', 'provider:\n  name: azure\n', ['Microsoft Azure']],
    [
      'blank lines and comments inside the block',
      'provider: # cloud\n\n  # which one\n  name: aws # for now\n',
      ['AWS'],
    ],
    ['an unknown provider', 'provider:\n  name: knative\n', []],
    ['no provider key', 'service: api\n', []],
    ['a name under another key', 'custom:\n  name: aws\n', []],
    [
      'a name after the provider block closed',
      'provider:\n  runtime: nodejs20\ncustom:\n  name: google\n',
      [],
    ],
    [
      'a name nested deeper than the provider children',
      'provider:\n  stage: dev\n  environment:\n    name: google\n',
      [],
    ],
  ])('handles %s', (_case, contents, expected) => {
    expect(vendors(matchConfig({ path: 'serverless.yaml', contents }))).toEqual(expected);
  });

  it('treats a Procfile as a Heroku hint, never a candidate', () => {
    expect(
      only(matchConfig({ path: 'Procfile', contents: 'web: node server.js\n' })),
    ).toMatchObject({
      kind: 'file',
      outcome: 'hint',
      value: 'Heroku',
      detail: { signal: 'Procfile' },
    });
  });

  it('ignores files that merely mention a vendor', () => {
    expect(matchConfig({ path: 'README.md', contents: 'Deployed on Vercel, data in AWS' })).toEqual(
      [],
    );
    expect(matchConfig({ path: 'vercel.json.bak', contents: '{}' })).toEqual([]);
    expect(matchConfig({ path: 'src/vercel.json.ts', contents: '{}' })).toEqual([]);
  });
});

describe('terraform', () => {
  const MAIN_TF = [
    'terraform {',
    '  required_providers {',
    '    aws = { source = "hashicorp/aws" }',
    '  }',
    '}',
    '',
    'provider "aws" {',
    '  region = "eu-central-1"',
    '}',
    '',
    '# provider "google" is only mentioned in this comment',
    '/*',
    'resource "azurerm_storage_account" "commented_out" {}',
    '*/',
    '',
    'resource "aws_s3_bucket" "logs" {',
    '  bucket = "acme-prod-logs-7f3a"',
    '}',
    '',
    'data "aws_caller_identity" "current" {}',
    '',
    'resource "cloudflare_record" "www" {',
    '  name = "www.acme.example"',
    '}',
    '',
    'resource "digitalocean_droplet" "unknown" {}',
    '',
  ].join('\n');

  it('names providers and resource types with the line they sit on', () => {
    const findings = matchConfig({ path: 'infra/main.tf', contents: MAIN_TF });
    expect(findings).toEqual([
      expect.objectContaining({
        kind: 'terraform-provider',
        value: 'AWS',
        evidence: { file: 'infra/main.tf', line: 7 },
        detail: {
          signal: 'provider "aws"',
          class: 'runtime',
          service: '',
          component: '',
          region: 'eu-central-1',
          regionLine: '8',
        },
      }),
      expect.objectContaining({
        kind: 'terraform-resource',
        value: 'AWS',
        evidence: { file: 'infra/main.tf', line: 16 },
        detail: {
          signal: 'aws_s3',
          class: 'runtime',
          service: 's3',
          component: 'Amazon Simple Storage Service',
          region: 'eu-central-1',
          regionLine: '8',
        },
      }),
      expect.objectContaining({
        kind: 'terraform-resource',
        value: 'AWS',
        evidence: { file: 'infra/main.tf', line: 20 },
        detail: expect.objectContaining({ signal: 'aws_caller', service: 'caller' }),
      }),
      expect.objectContaining({
        kind: 'terraform-resource',
        value: 'Cloudflare',
        evidence: { file: 'infra/main.tf', line: 22 },
        detail: expect.objectContaining({ signal: 'cloudflare_record', service: 'record' }),
      }),
    ]);
  });

  it('never leaks resource names, bucket names or hostnames', () => {
    const report = JSON.stringify(matchConfig({ path: 'main.tf', contents: MAIN_TF }));
    expect(report).not.toContain('logs');
    expect(report).not.toContain('bucket');
    expect(report).not.toContain('identity');
    expect(report).not.toContain('acme');
    expect(report).not.toContain('www');
  });

  it('recognises the google and azure prefixes', () => {
    const contents = [
      'provider "google" {',
      '  region = "europe-west1"',
      '}',
      'resource "google_cloud_run_service" "api" {}',
      'provider "azurerm" {}',
      'resource "azurerm_storage_account" "blobs" {}',
    ].join('\n');
    const findings = matchConfig({ path: 'main.tf', contents });
    expect(vendors(findings)).toEqual([
      'Google Cloud',
      'Google Cloud',
      'Microsoft Azure',
      'Microsoft Azure',
    ]);
    expect(findings.map((finding) => finding.detail.service)).toEqual(['', 'cloud', '', 'storage']);
    expect(findings.map((finding) => finding.detail.region)).toEqual([
      'europe-west1',
      'europe-west1',
      '',
      '',
    ]);
  });

  it('keeps a region only when it reads as a region', () => {
    for (const value of [
      'ignore-previous-instructions',
      'ignore-all-previous-instructions-1',
      'hunter2',
      'EU-CENTRAL-1',
      'eu',
      'eu-central-',
    ]) {
      const contents = `provider "aws" {\n  region = "${value}"\n}\n`;
      expect(only(matchConfig({ path: 'main.tf', contents })).detail.region).toBe('');
    }
    for (const value of [
      'eu-central-1',
      'europe-west1',
      'us-gov-west-1',
      'us-iso-east-1',
      'northamerica-northeast2',
    ]) {
      const contents = `provider "aws" {\n  region = "${value}"\n}\n`;
      expect(only(matchConfig({ path: 'main.tf', contents })).detail.region).toBe(value);
    }
  });

  it('keeps a region only when it reads as a plain region word', () => {
    const findings = matchConfig({
      path: 'main.tf',
      contents: 'provider "aws" {\n  region = "eu\u0000central ${var.secret}"\n}\n',
    });
    expect(only(findings).detail.region).toBe('');
    expect(
      only(matchConfig({ path: 'main.tf', contents: 'provider "aws" {}\nregion = var.region\n' }))
        .detail.region,
    ).toBe('');
  });

  it('does not let a line comment open a block comment', () => {
    const contents = ['# /* not a block comment', 'provider "aws" {}', '// /* nor this'].join('\n');
    expect(vendors(matchConfig({ path: 'main.tf', contents }))).toEqual(['AWS']);
  });

  it('keeps the masked line as long as the raw one, so an escaped quote before a comment shifts nothing', () => {
    // One blank short before the fix, the `*/` search started a character
    // early, read the `*` of `/*` as its close and let the commented region in.
    const contents = [
      'provider "aws" {',
      '  alias = "\\"" */* note',
      '  region = "us-west-2"',
      '  */',
      '  region = "eu-central-1"',
      '}',
    ].join('\n');
    const findings = matchConfig({ path: 'main.tf', contents });
    expect(findings.map((finding) => [finding.value, finding.detail.region])).toEqual([
      ['AWS', 'eu-central-1'],
    ]);
  });

  it('binds each region to its provider block and ignores commented ones', () => {
    const contents = [
      '# region = "us-east-1"',
      'provider "aws" {',
      '  region = "eu-central-1"',
      '}',
      'provider "google" {',
      '  region = "us-west-2"',
      '}',
    ].join('\n');
    const findings = matchConfig({ path: 'main.tf', contents });
    expect(findings.map((finding) => [finding.value, finding.detail.region])).toEqual([
      ['AWS', 'eu-central-1'],
      ['Google Cloud', 'us-west-2'],
    ]);
  });

  it('keeps a region inside its own provider block', () => {
    const contents =
      'provider "google" {}\nprovider "cloudflare" {}\nprovider "aws" {\n  region = "eu-west-1"\n}\nresource "google_storage_bucket" "b" {}\n';
    const findings = matchConfig({ path: 'main.tf', contents });
    expect(findings.map((finding) => [finding.value, finding.detail.region])).toEqual([
      ['Google Cloud', ''],
      ['Cloudflare', ''],
      ['AWS', 'eu-west-1'],
      ['Google Cloud', ''],
    ]);
  });

  it('shares a region declared before any provider block with every cloud provider', () => {
    const contents =
      'locals { x = 1 }\nregion = "eu-west-1"\nprovider "google" {}\nprovider "cloudflare" {}\nresource "aws_s3_bucket" "b" {}\n';
    const findings = matchConfig({ path: 'main.tf', contents });
    expect(findings.map((finding) => [finding.value, finding.detail.region])).toEqual([
      ['Google Cloud', 'eu-west-1'],
      ['Cloudflare', ''],
      ['AWS', 'eu-west-1'],
    ]);
  });

  it('forgets a provider once its block closes, so a resource region never becomes its region', () => {
    const contents = [
      'provider "aws" {',
      '  assume_role {',
      '    region = "us-west-2"',
      '  }',
      '}',
      'resource "aws_s3_bucket" "b" {',
      '  region = "us-west-2"',
      '}',
      'region = "us-east-1"',
      'provider "google" {}',
    ].join('\n');
    const findings = matchConfig({ path: 'main.tf', contents });
    expect(findings.map((finding) => [finding.value, finding.detail.region])).toEqual([
      ['AWS', ''],
      ['AWS', ''],
      ['Google Cloud', ''],
    ]);
  });

  it('drops the region when two blocks of one provider name disagree, and keeps a repeated one', () => {
    const contents = [
      'provider "aws" {',
      '  region = "eu-central-1"',
      '}',
      'provider "aws" {',
      '  alias  = "use1"',
      '  region = "us-east-1"',
      '}',
      'resource "aws_cloudfront_distribution" "cdn" {}',
      'provider "google" {',
      '  region = "europe-west1"',
      '}',
      'provider "google" {',
      '  region = "europe-west1"',
      '}',
      'resource "google_storage_bucket" "b" {}',
    ].join('\n');
    const findings = matchConfig({ path: 'main.tf', contents });
    expect(findings.map((finding) => [finding.value, finding.detail.region])).toEqual([
      ['AWS', ''],
      ['AWS', ''],
      ['Google Cloud', 'europe-west1'],
      ['Google Cloud', 'europe-west1'],
    ]);
  });

  it('names the component of a resource type by its full type when the first word is shared', () => {
    const contents = [
      'provider "google" {}',
      'resource "google_cloud_run_v2_service" "api" {}',
      'resource "google_cloud_scheduler_job" "nightly" {}',
      'resource "google_container_registry" "images" {}',
      'provider "cloudflare" {}',
      'resource "cloudflare_workers_kv_namespace" "kv" {}',
      'resource "cloudflare_zone_settings_override" "z" {}',
      'provider "azurerm" {}',
      'resource "azurerm_linux_web_app" "web" {}',
      'resource "azurerm_windows_function_app" "fn" {}',
    ].join('\n');
    const findings = matchConfig({ path: 'main.tf', contents });
    expect(
      findings
        .filter((finding) => finding.kind === 'terraform-resource')
        .map((finding) => [finding.detail.signal, finding.detail.component]),
    ).toEqual([
      ['google_cloud', 'Cloud Run'],
      ['google_container', ''],
      ['cloudflare_workers', 'Workers KV'],
      ['cloudflare_zone', ''],
      ['azurerm_linux', 'App Service'],
      ['azurerm_windows', 'Azure Functions'],
    ]);
  });

  it('takes a file default only from the top level, never from a resource before the first provider', () => {
    const contents = [
      'resource "aws_s3_bucket" "b" {',
      '  region = "us-west-2"',
      '}',
      'provider "aws" {}',
      'provider "google" {}',
    ].join('\n');
    const findings = matchConfig({ path: 'main.tf', contents });
    expect(findings.map((finding) => [finding.value, finding.detail.region])).toEqual([
      ['AWS', ''],
      ['AWS', ''],
      ['Google Cloud', ''],
    ]);
  });

  it('keeps the region of an unknown provider block out of the file default', () => {
    const contents = 'provider "awscc" {\n  region = "us-west-2"\n}\nprovider "google" {}\n';
    const findings = matchConfig({ path: 'main.tf', contents });
    expect(findings.map((finding) => [finding.value, finding.detail.region])).toEqual([
      ['Google Cloud', ''],
    ]);
  });

  it('counts braces outside strings only when closing a provider block', () => {
    const contents = 'provider "aws" {\n  alias = "}"\n  region = "eu-west-1"\n}\n';
    expect(only(matchConfig({ path: 'main.tf', contents })).detail.region).toBe('eu-west-1');
  });

  it('reports a resource only through a short service word, never the full type', () => {
    const contents = [
      'resource "aws_deadbeefcafe0123456789secrettoken" "x" {}',
      'resource "aws__x" "y" {}',
      'resource "aws_" "z" {}',
      'resource "aws_lambda_function" "fn" {}',
    ].join('\n');
    const findings = matchConfig({ path: 'main.tf', contents });
    expect(findings.map((finding) => finding.detail.signal)).toEqual(['aws_lambda']);
  });

  it('does not let a quoted string open a block comment', () => {
    const contents = [
      'locals {',
      '  arns = ["arn:aws:s3:::b/*", "x\\"/*"]',
      '}',
      'provider "aws" {',
      '  region = "eu-central-1"',
      '}',
    ].join('\n');
    expect(only(matchConfig({ path: 'main.tf', contents }))).toMatchObject({
      value: 'AWS',
      evidence: { line: 4 },
      detail: { region: 'eu-central-1' },
    });
  });

  it('skips a block comment that opens mid-line', () => {
    const contents = 'locals { x = "a" } /*\nprovider "aws" {}\n*/ provider "google" {}\n';
    expect(vendors(matchConfig({ path: 'main.tf', contents }))).toEqual([]);
  });

  it('reports a repeated signal once, at its first line', () => {
    const contents = 'resource "aws_s3_bucket" "a" {}\n'.repeat(1000);
    const findings = matchConfig({ path: 'main.tf', contents });
    expect(findings).toHaveLength(1);
    expect(only(findings).evidence.line).toBe(1);
  });

  it('reads only .tf files', () => {
    expect(matchConfig({ path: 'notes.md', contents: 'provider "aws" {}' })).toEqual([]);
    expect(matchConfig({ path: 'main.tf.bak', contents: 'provider "aws" {}' })).toEqual([]);
  });
});

describe('CI files', () => {
  it.each([
    ['.github/workflows/ci.yml', 'GitHub'],
    ['.github/workflows/release.yaml', 'GitHub'],
    ['.gitlab-ci.yml', 'GitLab'],
    ['bitbucket-pipelines.yml', 'Bitbucket'],
    ['.circleci/config.yml', 'CircleCI'],
    ['cloudbuild.yaml', 'Google Cloud'],
    ['apps/api/.gitlab-ci.yml', 'GitLab'],
    ['apps/api/cloudbuild.yaml', 'Google Cloud'],
  ])('%s is build-time evidence for %s', (path, vendor) => {
    expect(only(matchConfig({ path, contents: 'steps: []' }))).toMatchObject({
      kind: 'ci-file',
      outcome: 'vendor',
      value: vendor,
      evidence: { file: path, line: 1 },
      detail: { signal: expect.stringMatching(/^ci: /), class: 'build-time' },
    });
  });

  it('names the matched location, not the file', () => {
    expect(
      only(matchConfig({ path: '.github/workflows/ci.yml', contents: '' })).detail.signal,
    ).toBe('ci: .github/workflows/');
  });

  it('ignores other files under .github', () => {
    expect(matchConfig({ path: '.github/dependabot.yml', contents: '' })).toEqual([]);
    expect(matchConfig({ path: '.github/workflows/README.md', contents: '' })).toEqual([]);
    expect(matchConfig({ path: '.github/workflows/sub/x.yml', contents: '' })).toEqual([]);
    expect(matchConfig({ path: '.github/workflows/../../x.yml', contents: '' })).toEqual([]);
    expect(matchConfig({ path: '.github/workflows/a\nb\u001b[31m.yml', contents: '' })).toEqual([]);
    expect(matchConfig({ path: '.github\\workflows\\ci.yml', contents: '' })).toEqual([]);
    expect(vendors(matchConfig({ path: '.github/workflows/vercel.json', contents: '' }))).toEqual([
      'Vercel',
    ]);
    expect(
      vendors(
        matchConfig({
          path: '.github/workflows/docker-compose.yml',
          contents: 'image: ghcr.io/x/y',
        }),
      ),
    ).toEqual(['GitHub', 'GitHub']);
    expect(matchConfig({ path: '.github/workflows', contents: '' })).toEqual([]);
    expect(matchConfig({ path: 'docs/.github/workflows/ci.yml', contents: '' })).toEqual([]);
  });
});

describe('container registries', () => {
  it('reads registry hosts out of FROM lines and reports the pattern, not the image', () => {
    const dockerfile = [
      'FROM node:22-alpine AS build',
      'FROM --platform=linux/amd64 ghcr.io/acme/base:1.4',
      'from 123456789012.dkr.ecr.eu-west-1.amazonaws.com/acme/api:prod',
      '# FROM gcr.io/commented/out',
      'RUN echo "FROM gcr.io/not-a-from"',
      'FROM europe-west1-docker.pkg.dev/acme-prod/images/api',
      'FROM registry.gitlab.com/acme/api',
      'FROM ${REGISTRY}/api',
      '',
    ].join('\n');
    const findings = matchConfig({ path: 'Dockerfile', contents: dockerfile });
    expect(findings).toEqual([
      expect.objectContaining({
        kind: 'registry',
        value: 'GitHub',
        evidence: { file: 'Dockerfile', line: 2 },
        detail: {
          signal: 'FROM ghcr.io',
          class: 'build-time',
          service: '',
          component: '',
          region: '',
          regionLine: '',
        },
      }),
      expect.objectContaining({
        value: 'AWS',
        evidence: { file: 'Dockerfile', line: 3 },
        detail: expect.objectContaining({ signal: 'FROM *.dkr.ecr.*.amazonaws.com' }),
      }),
      expect.objectContaining({
        value: 'Google Cloud',
        evidence: { file: 'Dockerfile', line: 6 },
        detail: expect.objectContaining({ signal: 'FROM *.pkg.dev' }),
      }),
      expect.objectContaining({
        value: 'GitLab',
        evidence: { file: 'Dockerfile', line: 7 },
        detail: expect.objectContaining({ signal: 'FROM registry.gitlab.com' }),
      }),
    ]);
    expect(JSON.stringify(findings)).not.toContain('acme');
    expect(JSON.stringify(findings)).not.toContain('123456789012');
  });

  it('reads image references out of compose files', () => {
    const compose = [
      'services:',
      '  api:',
      '    image: "gcr.io/acme-prod/api:1.2"',
      '  worker:',
      "    image: 'ghcr.io/acme/worker'",
      '  db:',
      '    image: postgres:16',
      '  # image: gcr.io/commented/out',
      '  cache:',
      '    image: ${REGISTRY}/cache',
      '',
    ].join('\n');
    const findings = matchConfig({ path: 'deploy/docker-compose.prod.yml', contents: compose });
    expect(findings).toEqual([
      expect.objectContaining({
        kind: 'registry',
        value: 'Google Cloud',
        evidence: { file: 'deploy/docker-compose.prod.yml', line: 3 },
        detail: expect.objectContaining({ signal: 'image: gcr.io', class: 'build-time' }),
      }),
      expect.objectContaining({
        value: 'GitHub',
        evidence: expect.objectContaining({ line: 5 }),
        detail: expect.objectContaining({ signal: 'image: ghcr.io' }),
      }),
    ]);
  });

  it.each([
    'Dockerfile',
    'Dockerfile.prod',
    'api.Dockerfile',
    'compose.yaml',
    'docker-compose.yml',
  ])('recognises %s by name', (name) => {
    const line = name.includes('ompose') ? 'image: ghcr.io/x/y' : 'FROM ghcr.io/x/y';
    expect(vendors(matchConfig({ path: `svc/${name}`, contents: line }))).toEqual(['GitHub']);
  });

  it('matches registry hosts exactly or by dotted suffix, never by substring', () => {
    const contents = [
      'FROM evilpkg.dev/x',
      'FROM notgcr.io/x',
      'FROM gcr.io.evil.example/x',
      'FROM 1.dkr.ecr.amazonaws.com/x',
    ].join('\n');
    expect(matchConfig({ path: 'Dockerfile', contents })).toEqual([]);
    const regional = ['FROM eu.gcr.io/p/x', 'FROM ghcr.io:443/x/y'].join('\n');
    expect(vendors(matchConfig({ path: 'Dockerfile', contents: regional }))).toEqual([
      'Google Cloud',
      'GitHub',
    ]);
  });

  it('does not read FROM or image lines from other files', () => {
    expect(matchConfig({ path: 'Makefile', contents: 'FROM ghcr.io/x/y' })).toEqual([]);
    expect(matchConfig({ path: 'k8s/deploy.yaml', contents: 'image: ghcr.io/x/y' })).toEqual([]);
    expect(matchConfig({ path: 'decompose.yaml', contents: 'image: ghcr.io/x/y' })).toEqual([]);
  });
});

describe('git remotes', () => {
  it('reduces the remote URL to its host and drops credentials', () => {
    const config = [
      '[core]',
      '\trepositoryformatversion = 0',
      '[remote "origin"]',
      '\turl = https://deploy:ghp_s3cr3tT0ken@github.com/acme/app.git',
      '\tfetch = +refs/heads/*:refs/remotes/origin/*',
      '[remote "mirror"]',
      '\turl = git@gitlab.com:acme/app.git',
      '[remote "legacy"]',
      '\turl = ssh://git@bitbucket.org:22/acme/app.git',
      '[remote "internal"]',
      '\turl = https://git.acme.internal/app.git',
      '',
    ].join('\n');
    const findings = matchConfig({ path: '.git/config', contents: config });
    expect(findings).toEqual([
      expect.objectContaining({
        kind: 'git-host',
        outcome: 'vendor',
        value: 'GitHub',
        evidence: { file: '.git/config', line: 4 },
        detail: {
          signal: 'git remote: github.com',
          class: 'build-time',
          service: '',
          component: '',
          region: '',
          regionLine: '',
        },
      }),
      expect.objectContaining({
        value: 'GitLab',
        evidence: expect.objectContaining({ line: 7 }),
        detail: expect.objectContaining({ signal: 'git remote: gitlab.com' }),
      }),
      expect.objectContaining({
        value: 'Bitbucket',
        evidence: expect.objectContaining({ line: 9 }),
        detail: expect.objectContaining({ signal: 'git remote: bitbucket.org' }),
      }),
    ]);
    const report = JSON.stringify(findings);
    expect(report).not.toContain('ghp_');
    expect(report).not.toContain('deploy');
    expect(report).not.toContain('acme');
  });

  it('drops userinfo up to its last at sign and reports one host once', () => {
    const config = [
      '[remote "odd"]',
      '\turl = https://u:p@w@github.com/acme/app.git',
      '[remote "again"]',
      '\turl = git@github.com:acme/other.git',
    ].join('\n');
    const findings = matchConfig({ path: '.git/config', contents: config });
    expect(findings.map((finding) => [finding.value, finding.evidence.line])).toEqual([
      ['GitHub', 2],
    ]);
    expect(JSON.stringify(findings)).not.toContain('p@w');
  });

  it('drops host-confusion URLs', () => {
    const config = [
      '[remote "a"]',
      '\turl = https://github.com@evil.example/x.git',
      '[remote "b"]',
      '\turl = https://evil.example/x@github.com',
      '[remote "c"]',
      '\turl = evil.example:x@github.com/y.git',
      '[remote "d"]',
      '\turl = https://evil.example?@github.com/x',
      '[remote "e"]',
      '\turl = https://evil.example#@github.com/x',
      '[remote "f"]',
      '\turl = https://evil.example\\@github.com/x',
      '[remote "g"]',
      '\turl = https://bitbuc\u212aet.org/x',
    ].join('\n');
    expect(matchConfig({ path: '.git/config', contents: config })).toEqual([]);
  });

  it('reads only the root repository config', () => {
    const config = '[remote "origin"]\n\turl = https://github.com/acme/vendored.git\n';
    expect(matchConfig({ path: 'vendor/lib/.git/config', contents: config })).toEqual([]);
    expect(matchConfig({ path: '.git/config.bak', contents: config })).toEqual([]);
  });
});

describe('resolveVendorClasses', () => {
  const finding = (
    value: string,
    cls: 'runtime' | 'build-time',
    outcome = 'vendor',
  ): Parameters<typeof resolveVendorClasses>[0][number] => ({
    outcome,
    value,
    detail: { class: cls },
  });

  it('lets a runtime signal win over build-time signals for the same provider', () => {
    const classes = resolveVendorClasses([
      finding('Google Cloud', 'build-time'),
      finding('Google Cloud', 'runtime'),
      finding('GitHub', 'build-time'),
      finding('Stripe', 'runtime'),
      finding('Stripe', 'build-time'),
    ]);
    expect([...classes]).toEqual([
      ['Google Cloud', 'runtime'],
      ['GitHub', 'build-time'],
      ['Stripe', 'runtime'],
    ]);
  });

  it('keeps a provider build-time when every signal is build-time', () => {
    expect([...resolveVendorClasses([finding('AWS', 'build-time')])]).toEqual([
      ['AWS', 'build-time'],
    ]);
  });

  it('ignores hints and non-vendor outcomes', () => {
    const classes = resolveVendorClasses([
      finding('Heroku', 'runtime', 'hint'),
      finding('left-pad', 'runtime', 'unmapped'),
      finding('pg', 'runtime', 'protocol-client'),
    ]);
    expect(classes.size).toBe(0);
  });
});

describe('hostile inputs', () => {
  it('never throws and stays linear on unterminated or repeated constructs', () => {
    const start = performance.now();
    expect(() =>
      matchConfig({ path: 'main.tf', contents: 'provider "'.repeat(100_000) }),
    ).not.toThrow();
    expect(() => matchConfig({ path: 'main.tf', contents: '/*\n'.repeat(100_000) })).not.toThrow();
    expect(() =>
      matchConfig({ path: 'Dockerfile', contents: 'FROM '.repeat(100_000) }),
    ).not.toThrow();
    expect(() =>
      matchConfig({ path: '.git/config', contents: 'url = '.repeat(100_000) }),
    ).not.toThrow();
    expect(() =>
      matchConfig({ path: 'serverless.yml', contents: 'provider:\n'.repeat(100_000) }),
    ).not.toThrow();
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('stays linear on long whitespace runs and long hosts', () => {
    const start = performance.now();
    const compose = matchConfig({
      path: 'docker-compose.yml',
      contents: `${' '.repeat(4000)}image: x\n`.repeat(500),
    });
    const docker = matchConfig({
      path: 'Dockerfile',
      contents: `FROM ${'a.dkr.ecr.b.'.repeat(19)}/y\n`.repeat(500),
    });
    expect(performance.now() - start).toBeLessThan(500);
    expect(compose).toEqual([]);
    expect(docker).toEqual([]);
  });

  it('skips an over-long line and keeps the numbering of the lines after it', () => {
    const contents = `FROM ghcr.io/x/${'a'.repeat(5000)}\nFROM gcr.io/p/x\n`;
    const findings = matchConfig({ path: 'Dockerfile', contents });
    expect(findings.map((finding) => [finding.value, finding.evidence.line])).toEqual([
      ['Google Cloud', 2],
    ]);
  });

  it('reads a file with a byte order mark', () => {
    expect(
      vendors(matchConfig({ path: 'serverless.yml', contents: '\uFEFFprovider: aws\n' })),
    ).toEqual(['AWS']);
  });

  it('never folds a non-ASCII host onto a vendor host', () => {
    expect(matchConfig({ path: 'Dockerfile', contents: 'FROM evil.p\u212ag.dev/x' })).toEqual([]);
  });

  it('keeps hosts with control characters or no dot out of the report', () => {
    const contents = ['FROM ghcr.io\u0000evil/x', 'FROM ghcr/x', 'FROM ghcr.io/x'].join('\n');
    expect(vendors(matchConfig({ path: 'Dockerfile', contents }))).toEqual(['GitHub']);
  });
});
