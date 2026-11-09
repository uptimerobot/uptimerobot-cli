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
  'sentry-sdk[django, celery]==2.19.2',
  'celery==5.4.0',
  'redis>=5.2.1',
  'psycopg[binary]==3.2.3',
  '-r base.txt',
  'git+https://github.com/org/repo.git#egg=stripe',
  'https://host.example/stripe-1.whl',
  'file:///x/stripe',
  './vendor/stripe',
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
  '\t// github.com/sendgrid/sendgrid-go v3.16.0',
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

  it('reads peer and optional dependencies as runtime', () => {
    const peers = matchManifest({
      path: 'package.json',
      contents:
        '{\n  "peerDependencies": { "stripe": "^17" },\n  "optionalDependencies": { "twilio": "5.0.0" }\n}',
    });
    expect(byProvider(peers, 'Stripe')?.detail).toMatchObject({
      class: 'runtime',
      scope: 'peerDependencies',
      version: '^17',
    });
    expect(byProvider(peers, 'Twilio')?.evidence.line).toBe(3);
  });

  it('puts every finding of a minified manifest on line 1', () => {
    const findings = matchManifest({
      path: 'package.json',
      contents: '{"dependencies":{"stripe":"1"}}',
    });
    expect(byProvider(findings, 'Stripe')?.evidence.line).toBe(1);
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
    expect(findings.find((finding) => finding.value === 'resend')).toBeUndefined();
    expect(
      matchManifest({
        path: 'package.json',
        contents: '{ "dependencies": { "left-pad": "1" } }',
      })[0],
    ).toMatchObject({ outcome: 'unmapped', value: 'left-pad' });
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
    expect(byProvider(findings, 'Sentry')).toMatchObject({
      evidence: { line: 5 },
      detail: { signal: 'sentry-sdk[django,celery]@2.19.2' },
    });
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

  it('reports nothing for URL, path and include lines', () => {
    const values = findings.map((finding) => finding.value);
    expect(values.filter((value) => /^(git|https?|file|\.|-)/.test(value))).toEqual([]);
    expect(byProvider(findings, 'Stripe')).toBeUndefined();
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
    expect(findings.map((finding) => finding.value)).not.toContain('python');
  });
});

describe('matchManifest on pyproject.toml edge cases', () => {
  it('ends an inline array on the same line and keeps extras brackets out of it', () => {
    const contents = [
      '[project]',
      'dependencies = ["psycopg[binary]>=3",',
      '  "stripe"]',
      'keywords = [',
      '  "sendgrid",',
      ']',
      '',
    ].join('\n');
    const findings = matchManifest({ path: 'pyproject.toml', contents });
    expect(byProvider(findings, 'Stripe')?.evidence.line).toBe(3);
    expect(byProvider(findings, 'SendGrid')).toBeUndefined();
    expect(findings.find((finding) => finding.value === 'psycopg')?.outcome).toBe(
      'protocol-client',
    );
  });

  it('classes every optional, group and dev table as build-time, except the main group', () => {
    const contents = [
      '[project.optional-dependencies]',
      'dev = ["stripe"]',
      '',
      '[dependency-groups]',
      'test = ["sendgrid"]',
      '',
      '[tool.poetry.dev-dependencies]',
      'twilio = "^9"',
      '',
      '[tool.poetry.group.lint.dependencies]',
      'resend = "^2"',
      '',
      '[tool.poetry.group.main.dependencies]',
      'openai = "^1"',
      '',
    ].join('\n');
    const findings = matchManifest({ path: 'pyproject.toml', contents });
    for (const provider of ['Stripe', 'SendGrid', 'Twilio', 'Resend']) {
      expect(byProvider(findings, provider)?.detail.class).toBe('build-time');
    }
    expect(byProvider(findings, 'OpenAI')?.detail.class).toBe('runtime');
  });

  it('reads subtables and ignores array-of-table headers and header comments', () => {
    const contents = [
      '[tool.poetry.dependencies]',
      'python = "^3.12"',
      '',
      '[tool.poetry.dependencies.stripe]',
      'version = "11.0.0"',
      'extras = ["async"]',
      '',
      '[[tool.poetry.source]]',
      'name = "openai"',
      'url = "https://example.invalid"',
      '',
      '[tool.poetry.group.docs.dependencies] # docs only',
      'sentry-sdk = "2.0"',
      '',
    ].join('\n');
    const findings = matchManifest({ path: 'pyproject.toml', contents });
    expect(byProvider(findings, 'Stripe')).toMatchObject({
      evidence: { line: 5 },
      detail: { signal: 'stripe@11.0.0', class: 'runtime' },
    });
    expect(byProvider(findings, 'OpenAI')).toBeUndefined();
    expect(findings.map((finding) => finding.value)).not.toContain('name');
    expect(findings.map((finding) => finding.value)).not.toContain('python');
    expect(byProvider(findings, 'Sentry')?.detail.class).toBe('build-time');
  });

  it('never takes a dependency from a comment inside an array', () => {
    const contents = [
      '[project]',
      'dependencies = [',
      '  "requests",',
      '  # "stripe>=1",',
      '  "sendgrid", # "twilio"',
      ']',
      '',
    ].join('\n');
    const findings = matchManifest({ path: 'pyproject.toml', contents });
    expect(findings.filter((finding) => finding.outcome === 'vendor').map((f) => f.value)).toEqual([
      'SendGrid',
    ]);
  });

  it('reads a dotted key as the subtable form', () => {
    const findings = matchManifest({
      path: 'Cargo.toml',
      contents: [
        '[dependencies]',
        'async-stripe.version = "0.39"',
        'serde.features = ["derive"]',
        '',
      ].join('\n'),
    });
    expect(byProvider(findings, 'Stripe')).toMatchObject({
      evidence: { line: 2 },
      detail: { version: '0.39' },
    });
    expect(findings.map((finding) => finding.value)).not.toContain('serde.features');
    expect(findings.map((finding) => finding.value)).not.toContain('serde.version');
  });

  it('reports nothing from a pyproject.toml without dependency tables', () => {
    const contents = [
      '[build-system]',
      'requires = ["setuptools"]',
      '',
      '[tool.black]',
      'line-length = 88',
      '',
    ].join('\n');
    expect(matchManifest({ path: 'pyproject.toml', contents })).toEqual([]);
  });
});

describe('matchManifest on go.mod', () => {
  const findings = matchManifest({ path: 'go.mod', contents: GO_MOD });

  it('matches module paths by prefix with their version', () => {
    expect(byProvider(findings, 'Google Cloud')).toMatchObject({
      kind: 'go',
      evidence: { line: 6 },
      detail: { signal: 'cloud.google.com/go/storage@v1.47.0', scope: 'require', class: 'runtime' },
    });
    expect(byProvider(findings, 'Stripe')?.detail.signal).toBe(
      'github.com/stripe/stripe-go/v81@v81.1.0',
    );
    expect(byProvider(findings, 'Twilio')?.evidence.line).toBe(8);
  });

  it('strips a comment on a CRLF line instead of reading it as a module', () => {
    const crlf = matchManifest({ path: 'go.mod', contents: GO_MOD.replaceAll('\n', '\r\n') });
    expect(crlf.map((finding) => finding.value)).toEqual(findings.map((finding) => finding.value));
    expect(crlf.some((finding) => finding.value.startsWith('//'))).toBe(false);
  });

  it('does not report the module itself, a commented-out line, or a build-time class', () => {
    const values = findings.map((finding) => finding.value);
    expect(values).not.toContain('github.com/acme/billing');
    expect(values.some((value) => value.startsWith('//'))).toBe(false);
    expect(byProvider(findings, 'SendGrid')).toBeUndefined();
    expect(findings.every((finding) => finding.detail.class === 'runtime')).toBe(true);
  });
});

describe('matchManifest on Gemfile, composer.json and Cargo.toml', () => {
  it('classes gems inside a group block or with a group option as build-time', () => {
    const findings = matchManifest({
      path: 'Gemfile',
      contents: [
        "gem 'stripe'",
        "gem 'twilio-ruby', group: :development",
        'group :test, :development do',
        "  gem 'sendgrid-ruby'",
        'end',
        "gem 'resend'",
        '',
      ].join('\n'),
    });
    expect(byProvider(findings, 'Stripe')?.detail.class).toBe('runtime');
    expect(byProvider(findings, 'Resend')?.detail.class).toBe('runtime');
    expect(
      findings.find((finding) => finding.detail.package === 'sendgrid-ruby')?.detail.class,
    ).toBe('build-time');
    expect(findings.find((finding) => finding.detail.package === 'twilio-ruby')?.detail.class).toBe(
      'build-time',
    );
  });

  it('classes a dev, test, lint, docs or ci requirements file as build-time, like every other dev section', () => {
    for (const path of ['requirements-dev.txt', 'requirements_test.txt', 'requirements.ci.txt']) {
      const findings = matchManifest({ path, contents: 'sentry-sdk==2.19.2\n' });
      expect(byProvider(findings, 'Sentry')?.detail.class, path).toBe('build-time');
      expect(byProvider(findings, 'Sentry')?.detail.scope, path).toBe('requirements-dev');
    }
    const runtime = matchManifest({ path: 'requirements.txt', contents: 'sentry-sdk==2.19.2\n' });
    expect(byProvider(runtime, 'Sentry')?.detail.class).toBe('runtime');
  });

  it('keeps a gem grouped through a nested block and reads the hash-rocket group option', () => {
    const findings = matchManifest({
      path: 'Gemfile',
      contents: [
        'group :development do',
        '  platforms :mri do',
        "    gem 'sendgrid-ruby'",
        '  end',
        "  gem 'twilio-ruby'",
        'end',
        "gem 'stripe', :group => :test",
        "if ENV['CI']",
        "  gem 'resend'",
        'end',
        "gem 'postmark'",
        '',
      ].join('\n'),
    });
    const classOf = (pkg: string) =>
      findings.find((finding) => finding.detail.package === pkg)?.detail.class;
    expect(classOf('sendgrid-ruby')).toBe('build-time');
    expect(classOf('twilio-ruby')).toBe('build-time');
    expect(byProvider(findings, 'Stripe')?.detail.class).toBe('build-time');
    expect(byProvider(findings, 'Resend')?.detail.class).toBe('runtime');
    expect(classOf('postmark')).toBe('runtime');
  });

  it('classes a runtime vendor that only sits in a dev section as build-time', () => {
    const npm = matchManifest({
      path: 'package.json',
      contents: '{ "devDependencies": { "stripe": "17.4.0" } }',
    });
    expect(byProvider(npm, 'Stripe')?.detail.class).toBe('build-time');
    const composer = matchManifest({
      path: 'composer.json',
      contents: '{ "require-dev": { "stripe/stripe-php": "^16" } }',
    });
    expect(byProvider(composer, 'Stripe')?.detail.class).toBe('build-time');
  });

  it('reads Cargo subtables and survives array-of-table headers', () => {
    const findings = matchManifest({
      path: 'Cargo.toml',
      contents: [
        '[dependencies.async-stripe]',
        'version = "0.39"',
        '',
        '[dependencies]',
        'aws-sdk-s3 = "1.60.0"',
        '',
        '[[bin]]',
        'name = "openai"',
        'path = "src/main.rs"',
        '',
      ].join('\n'),
    });
    expect(byProvider(findings, 'Stripe')).toMatchObject({
      evidence: { line: 2 },
      detail: { signal: 'async-stripe@0.39' },
    });
    expect(byProvider(findings, 'AWS')).toBeDefined();
    expect(byProvider(findings, 'OpenAI')).toBeUndefined();
    expect(findings.map((finding) => finding.value)).not.toContain('name');
  });

  it('reads a Cargo dependency inherited from the workspace', () => {
    const findings = matchManifest({
      path: 'Cargo.toml',
      contents: [
        '[dependencies]',
        'async-stripe.workspace = true',
        '',
        '[dependencies.aws-sdk-s3]',
        'workspace = true',
        'features = ["rt-tokio"]',
        '',
        '[dependencies.openai]',
        'features = ["stream"]',
        '',
      ].join('\n'),
    });
    expect(byProvider(findings, 'Stripe')).toMatchObject({
      evidence: { line: 2 },
      detail: { signal: 'async-stripe' },
    });
    expect(byProvider(findings, 'AWS')).toMatchObject({
      evidence: { line: 5 },
      detail: { signal: 'aws-sdk-s3' },
    });
    expect(byProvider(findings, 'OpenAI')).toBeUndefined();
  });

  it('anchors a package.json section to its key, not to the word inside a value', () => {
    const findings = matchManifest({
      path: 'package.json',
      contents: [
        '{',
        '  "keywords": ["dependencies"],',
        '  "resolutions": { "stripe": "16.0.0" },',
        '  "dependencies": {',
        '    "stripe": "17.4.0"',
        '  }',
        '}',
        '',
      ].join('\n'),
    });
    expect(byProvider(findings, 'Stripe')).toMatchObject({
      evidence: { line: 5 },
      detail: { signal: 'stripe@17.4.0' },
    });
  });

  it('keeps credentials, keys and control characters out of the report', () => {
    const npm = matchManifest({
      path: 'package.json',
      contents:
        '{\n  "dependencies": {\n    "stripe": "git+https://user:token@github.com/x/y.git",\n    "twilio": "5.0.0\\u001b[31m"\n  }\n}',
    });
    expect(byProvider(npm, 'Stripe')?.detail).toMatchObject({ signal: 'stripe', version: '' });
    expect(byProvider(npm, 'Twilio')?.detail.signal).toBe('twilio');
    const pip = matchManifest({
      path: 'requirements.txt',
      contents: 'stripe==https://u:p@h/x\nsendgrid==sk_live_abcdefghij\n',
    });
    expect(byProvider(pip, 'Stripe')?.detail.signal).toBe('stripe');
    expect(byProvider(pip, 'SendGrid')?.detail.signal).toBe('sendgrid');
    const long = matchManifest({
      path: 'package.json',
      contents: `{ "dependencies": { "${'a'.repeat(5000)}": "1", "stripe": "${'9'.repeat(5000)}" } }`,
    });
    expect(long.map((finding) => finding.value)).toEqual(['Stripe']);
    expect(byProvider(long, 'Stripe')?.detail.signal).toBe('stripe');
  });

  it('ignores a fake dependency table inside a multi-line string', () => {
    const pyproject = matchManifest({
      path: 'pyproject.toml',
      contents: [
        '[project]',
        'description = """',
        '[tool.poetry.dependencies]',
        'stripe = "1"',
        '"""',
        '',
        '[tool.poetry.dependencies]',
        'twilio = "1"',
        '',
      ].join('\n'),
    });
    expect(pyproject.map((finding) => finding.value)).toEqual(['Twilio']);
    const cargo = matchManifest({
      path: 'Cargo.toml',
      contents: [
        '[package]',
        "description = '''",
        '[dependencies]',
        'async-stripe = "1"',
        "'''",
        '',
      ].join('\n'),
    });
    expect(cargo).toEqual([]);
  });

  it('abandons an unterminated array at the next header instead of swallowing the file', () => {
    const findings = matchManifest({
      path: 'pyproject.toml',
      contents: [
        '[project]',
        'keywords = [',
        '  "a",',
        '',
        '[tool.poetry.dependencies]',
        'stripe = "1"',
        '',
      ].join('\n'),
    });
    expect(byProvider(findings, 'Stripe')?.evidence.line).toBe(6);
  });

  it('does not read a go.mod require block opener with content on its line as a dependency', () => {
    const findings = matchManifest({
      path: 'go.mod',
      contents: 'require ( github.com/stripe/stripe-go v1\n',
    });
    expect(findings.map((finding) => finding.value)).not.toContain('(');
  });

  describe('stays linear on hostile input', () => {
    const under = (ms: number, run: () => unknown) => {
      const started = performance.now();
      run();
      expect(performance.now() - started).toBeLessThan(ms);
    };

    it('an unclosed header with thousands of spaces', () => {
      under(200, () =>
        matchManifest({ path: 'Cargo.toml', contents: `[${' '.repeat(4000)}aaaa\n` }),
      );
    });

    it('a line of eighty thousand spaces', () => {
      under(200, () =>
        matchManifest({ path: 'pyproject.toml', contents: `${' '.repeat(80_000)}\n[project]\n` }),
      );
    });

    it('a forty thousand item array and an unterminated one', () => {
      const items = Array.from({ length: 40_000 }, (_, i) => `  "pkg${i}",`).join('\n');
      under(1000, () =>
        matchManifest({
          path: 'pyproject.toml',
          contents: `[project]\ndependencies = [\n${items}\n]\n`,
        }),
      );
      under(1000, () =>
        matchManifest({ path: 'pyproject.toml', contents: `[project]\nx = [\n${items}\n` }),
      );
    });

    it('twenty thousand pretty-printed dependencies', () => {
      const entries = Array.from({ length: 20_000 }, (_, i) => `    "pkg\\\\${i}": "1"`).join(
        ',\n',
      );
      under(1000, () =>
        matchManifest({
          path: 'package.json',
          contents: `{\n  "dependencies": {\n${entries}\n  }\n}\n`,
        }),
      );
    });
  });

  it('never throws on malformed or empty manifests', () => {
    for (const [path, contents] of [
      ['package.json', '[1, 2]'],
      ['package.json', '{ "dependencies": ["stripe"] }'],
      ['composer.json', 'null'],
      ['pyproject.toml', '[project\ndependencies = ['],
      ['Cargo.toml', '= = ='],
      ['go.mod', 'require ('],
      ['Gemfile', 'group do'],
      ['requirements.txt', ''],
    ] as const) {
      expect(() => matchManifest({ path, contents })).not.toThrow();
      expect(
        matchManifest({ path, contents }).filter((finding) => finding.outcome === 'vendor'),
      ).toEqual([]);
    }
  });

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
        "[target.'cfg(unix)'.dependencies]",
        'openssl = "0.10"',
        'aws-sdk-sqs = "1.50.0"',
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
    expect(
      findings.filter((finding) => finding.value === 'AWS').map((finding) => finding.evidence.line),
    ).toEqual([5, 13]);
  });

  it('returns nothing for a file it does not understand', () => {
    expect(matchManifest({ path: 'README.md', contents: 'stripe boto3' })).toEqual([]);
  });
});
