/**
 * The vendor map: which repository signals point at which third-party
 * provider in the UptimeRobot catalog, and what to search the catalog for.
 *
 * The map exists for names that differ from the brand (`boto3` is AWS,
 * `@octokit/*` is GitHub). Every `catalogName` returned exactly one row with
 * that name when the catalog was checked in November 2026; the resolver still
 * treats "no exact-name row today" as "not in the catalog", whatever this file
 * says. Data only: nothing here reads a file or reaches the network.
 */

export type VendorClass = 'runtime' | 'build-time';

export type PackageEcosystem = 'npm' | 'pip' | 'go' | 'gem' | 'composer' | 'cargo';

export type VendorSignal =
  /**
   * A dependency name. `pattern` is an exact name, or a prefix when it ends in
   * `*` (`@aws-sdk/*`, `cloud.google.com/go/*`). Restricted to `ecosystems`
   * when given; a bare `openai` is a vendor on npm and pip but nowhere else.
   */
  | { kind: 'package'; pattern: string; ecosystems?: readonly PackageEcosystem[] }
  /** A file that exists by name, e.g. `vercel.json`. */
  | { kind: 'file'; pattern: string }
  /** A terraform `provider "<name>"` block. */
  | { kind: 'terraform-provider'; pattern: string }
  /** A terraform resource type prefix, e.g. `aws_`. */
  | { kind: 'terraform-resource'; pattern: string }
  /** A CI configuration file; build-time on its own. */
  | { kind: 'ci-file'; pattern: string }
  /** A container registry host; build-time on its own. */
  | { kind: 'registry'; pattern: string }
  /** The host of the repository's git remote; build-time on its own. */
  | { kind: 'git-host'; pattern: string }
  /** A hostname pattern (`*.supabase.co`), matched by domain suffix. */
  | { kind: 'hostname'; pattern: string };

export interface VendorEntry {
  /** The provider's exact name in the catalog. */
  catalogName: string;
  /** What to pass to `third-party-providers list --search`. */
  searchTerm: string;
  class: VendorClass;
  signals: readonly VendorSignal[];
}

const pkg = (pattern: string, ecosystems?: readonly PackageEcosystem[]): VendorSignal =>
  ecosystems === undefined
    ? { kind: 'package', pattern }
    : { kind: 'package', pattern, ecosystems };
const file = (pattern: string): VendorSignal => ({ kind: 'file', pattern });
const host = (pattern: string): VendorSignal => ({ kind: 'hostname', pattern });
const tfProvider = (pattern: string): VendorSignal => ({ kind: 'terraform-provider', pattern });
const tfResource = (pattern: string): VendorSignal => ({ kind: 'terraform-resource', pattern });
const ci = (pattern: string): VendorSignal => ({ kind: 'ci-file', pattern });
const registry = (pattern: string): VendorSignal => ({ kind: 'registry', pattern });
const gitHost = (pattern: string): VendorSignal => ({ kind: 'git-host', pattern });

const runtime = (
  catalogName: string,
  signals: readonly VendorSignal[],
  searchTerm = catalogName.toLowerCase(),
): VendorEntry => ({ catalogName, searchTerm, class: 'runtime', signals });

const buildTime = (
  catalogName: string,
  signals: readonly VendorSignal[],
  searchTerm = catalogName.toLowerCase(),
): VendorEntry => ({ catalogName, searchTerm, class: 'build-time', signals });

export const VENDORS: readonly VendorEntry[] = [
  // Hosting and cloud
  runtime('AWS', [
    pkg('@aws-sdk/*', ['npm']),
    pkg('aws-sdk', ['npm']),
    pkg('aws-cdk', ['npm']),
    pkg('aws-cdk-lib', ['npm']),
    pkg('boto3', ['pip']),
    pkg('botocore', ['pip']),
    pkg('aws-sdk-*', ['cargo']),
    pkg('github.com/aws/aws-sdk-go*', ['go']),
    tfProvider('aws'),
    tfResource('aws_'),
    host('*.amazonaws.com'),
    registry('*.dkr.ecr.amazonaws.com'),
  ]),
  runtime(
    'Google Cloud',
    [
      pkg('@google-cloud/*', ['npm']),
      pkg('googleapis', ['npm']),
      pkg('google-cloud-*', ['pip']),
      pkg('cloud.google.com/go/*', ['go']),
      tfProvider('google'),
      tfResource('google_'),
      host('*.googleapis.com'),
      ci('cloudbuild.yaml'),
      registry('gcr.io'),
      registry('*.pkg.dev'),
    ],
    'google cloud',
  ),
  runtime('Firebase', [
    pkg('firebase', ['npm', 'pip']),
    pkg('firebase-admin', ['npm', 'pip']),
    file('firebase.json'),
    host('*.firebaseio.com'),
    host('*.firebaseapp.com'),
  ]),
  runtime(
    'Microsoft Azure',
    [
      pkg('@azure/*', ['npm']),
      pkg('azure-*', ['pip']),
      tfProvider('azurerm'),
      tfResource('azurerm_'),
      host('*.azure.com'),
      host('*.azurewebsites.net'),
      host('*.windows.net'),
      host('login.microsoftonline.com'),
    ],
    'azure',
  ),
  runtime('Vercel', [pkg('@vercel/*', ['npm']), file('vercel.json')]),
  runtime('Netlify', [pkg('@netlify/*', ['npm']), file('netlify.toml')]),
  runtime('Fly.io', [file('fly.toml'), host('*.fly.dev')], 'fly.io'),
  runtime('Render', [file('render.yaml'), host('*.onrender.com')]),
  runtime('Railway', [file('railway.json'), file('railway.toml'), host('*.railway.app')]),
  runtime('Heroku', [file('heroku.yml'), host('*.herokuapp.com')]),
  runtime('Cloudflare', [
    pkg('@cloudflare/*', ['npm']),
    pkg('cloudflare', ['npm', 'pip']),
    file('wrangler.toml'),
    file('wrangler.jsonc'),
    tfProvider('cloudflare'),
    tfResource('cloudflare_'),
    host('*.workers.dev'),
    host('*.pages.dev'),
  ]),
  // Data
  runtime('Supabase', [
    pkg('@supabase/*', ['npm']),
    pkg('supabase', ['pip']),
    host('*.supabase.co'),
  ]),
  runtime('MongoDB', [host('*.mongodb.net')]),
  runtime('PlanetScale', [pkg('@planetscale/*', ['npm']), host('*.psdb.cloud')]),
  runtime('Neon', [pkg('@neondatabase/*', ['npm']), host('*.neon.tech')]),
  runtime('Upstash', [pkg('@upstash/*', ['npm']), host('*.upstash.io')]),
  runtime('Algolia', [
    pkg('algoliasearch', ['npm', 'pip']),
    host('*.algolia.net'),
    host('*.algolianet.com'),
  ]),
  runtime('Cloudinary', [pkg('cloudinary', ['npm', 'pip', 'gem']), host('*.cloudinary.com')]),
  // Payments and commerce
  runtime('Stripe', [
    pkg('stripe', ['npm', 'pip', 'gem']),
    pkg('stripe/stripe-php', ['composer']),
    pkg('async-stripe', ['cargo']),
    pkg('github.com/stripe/stripe-go*', ['go']),
    host('api.stripe.com'),
  ]),
  runtime('PayPal', [
    pkg('@paypal/*', ['npm']),
    pkg('paypal-rest-sdk', ['npm']),
    pkg('paypalrestsdk', ['pip']),
    host('api-m.paypal.com'),
    host('api.paypal.com'),
  ]),
  runtime('Plaid', [pkg('plaid', ['npm']), pkg('plaid-python', ['pip']), host('*.plaid.com')]),
  runtime('Shopify', [
    pkg('@shopify/shopify-api', ['npm']),
    pkg('@shopify/shopify-app-*', ['npm']),
    host('*.myshopify.com'),
  ]),
  // Messaging
  runtime('Twilio', [
    pkg('twilio', ['npm', 'pip', 'gem']),
    pkg('github.com/twilio/twilio-go*', ['go']),
    host('api.twilio.com'),
  ]),
  runtime('SendGrid', [
    pkg('@sendgrid/*', ['npm']),
    pkg('sendgrid', ['pip', 'gem']),
    host('api.sendgrid.com'),
  ]),
  runtime('Mailgun', [
    pkg('mailgun.js', ['npm']),
    pkg('mailgun-js', ['npm']),
    host('api.mailgun.net'),
  ]),
  runtime('Postmark', [pkg('postmark', ['npm', 'pip', 'gem']), host('api.postmarkapp.com')]),
  runtime('Resend', [pkg('resend', ['npm', 'pip', 'gem']), host('api.resend.com')]),
  runtime('Slack', [
    pkg('@slack/*', ['npm']),
    pkg('slack-sdk', ['pip']),
    host('hooks.slack.com'),
    host('slack.com'),
  ]),
  runtime('Pusher', [
    pkg('pusher', ['npm', 'pip']),
    pkg('pusher-js', ['npm']),
    host('*.pusher.com'),
  ]),
  runtime('Ably', [pkg('ably', ['npm', 'pip']), host('*.ably.io'), host('*.ably.net')]),
  // AI
  runtime('OpenAI', [pkg('openai', ['npm', 'pip']), host('api.openai.com')]),
  runtime('Anthropic', [
    pkg('@anthropic-ai/sdk', ['npm']),
    pkg('anthropic', ['pip']),
    host('api.anthropic.com'),
  ]),
  // Auth and identity
  runtime('Auth0', [pkg('auth0', ['npm', 'pip']), pkg('@auth0/*', ['npm']), host('*.auth0.com')]),
  runtime('Clerk', [pkg('@clerk/*', ['npm']), host('api.clerk.com'), host('*.clerk.accounts.dev')]),
  runtime('Okta', [pkg('@okta/*', ['npm']), host('*.okta.com')]),
  // Observability and product analytics
  runtime('Sentry', [pkg('@sentry/*', ['npm']), pkg('sentry-sdk', ['pip']), host('*.sentry.io')]),
  runtime('New Relic', [pkg('newrelic', ['npm', 'pip']), host('*.newrelic.com')], 'new relic'),
  runtime('Segment', [
    pkg('@segment/*', ['npm']),
    pkg('analytics-node', ['npm']),
    host('api.segment.io'),
  ]),
  runtime('LaunchDarkly', [
    pkg('launchdarkly-*', ['npm', 'pip']),
    pkg('@launchdarkly/*', ['npm']),
    host('*.launchdarkly.com'),
  ]),
  runtime('PagerDuty', [
    pkg('@pagerduty/*', ['npm']),
    pkg('pdpyras', ['pip']),
    host('events.pagerduty.com'),
  ]),
  // Content and CRM
  runtime('Contentful', [pkg('contentful', ['npm', 'pip']), host('*.contentful.com')]),
  runtime('Sanity', [pkg('@sanity/*', ['npm']), host('*.sanity.io')]),
  runtime('HubSpot', [
    pkg('@hubspot/*', ['npm']),
    pkg('hubspot-api-client', ['pip']),
    host('api.hubapi.com'),
  ]),
  runtime('Mapbox', [
    pkg('mapbox-gl', ['npm']),
    pkg('@mapbox/mapbox-sdk', ['npm']),
    host('api.mapbox.com'),
  ]),
  // Build-time: code hosts and CI
  buildTime('GitHub', [
    pkg('@octokit/*', ['npm']),
    gitHost('github.com'),
    ci('.github/workflows/'),
    registry('ghcr.io'),
    registry('npm.pkg.github.com'),
  ]),
  buildTime('GitLab', [
    gitHost('gitlab.com'),
    ci('.gitlab-ci.yml'),
    registry('registry.gitlab.com'),
  ]),
  buildTime('Bitbucket', [gitHost('bitbucket.org'), ci('bitbucket-pipelines.yml')]),
  buildTime('CircleCI', [ci('.circleci/config.yml')]),
];

/**
 * Frameworks, runtimes, ORMs, build tools and UI libraries: no outage of
 * theirs reaches the user's product, so they are mentioned in one line and
 * never proposed. Matched after normalization, by exact name or `prefix*`.
 */
export const SKIP_PACKAGES: ReadonlySet<string> = new Set([
  'next',
  'react',
  'react-dom',
  'vue',
  'nuxt',
  'svelte',
  'angular',
  '@angular/*',
  'express',
  'fastify',
  'koa',
  'hono',
  'nestjs',
  '@nestjs/*',
  'django',
  'django-*',
  'flask',
  'fastapi',
  'rails',
  'sinatra',
  'laravel/framework',
  'prisma',
  '@prisma/*',
  'sqlalchemy',
  'typeorm',
  'sequelize',
  'knex',
  'typescript',
  'eslint',
  'prettier',
  'vite',
  'webpack',
  'esbuild',
  'jest',
  'vitest',
  'pytest',
  'phpunit/phpunit',
  '@types/*',
  'jquery',
  'tailwindcss',
  'serde',
  'tokio',
  '@shopify/polaris',
  '@shopify/hydrogen',
]);

/**
 * Protocol clients with no vendor hostname of their own. The database behind
 * them is self-hosted or unknown; the scan says so instead of guessing.
 */
export const PROTOCOL_CLIENTS: ReadonlySet<string> = new Set([
  'pg',
  'postgres',
  'psycopg',
  'psycopg2',
  'psycopg2-binary',
  'asyncpg',
  'mysql',
  'mysql2',
  'mysqlclient',
  'pymysql',
  'redis',
  'ioredis',
  'celery',
  'amqplib',
  'pika',
  'kafkajs',
  'kafka-python',
  'mongodb',
  'mongoose',
  'pymongo',
  'motor',
  'memcached',
  'pymemcache',
]);

export interface PackageMatch {
  entry: VendorEntry;
  signal: Extract<VendorSignal, { kind: 'package' }>;
}

/**
 * The name test the resolver applies to a catalog row: lowercase with every
 * non-alphanumeric character removed, so `Fly.io` equals `fly.io` and
 * `Clerk Chat` does not equal `Clerk`.
 */
export function normalizeCatalogName(name: string): string {
  return name.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
}

/**
 * Normalizes a dependency name for lookup: lowercase, pip extras dropped
 * (`psycopg[binary]`), and pip's interchangeable `_` and `.` folded to `-`.
 * Go module paths and npm scopes keep their punctuation.
 */
export function normalizePackageName(ecosystem: PackageEcosystem, name: string): string {
  const lower = name.trim().toLowerCase();
  if (ecosystem !== 'pip') return lower;
  return lower.replace(/\[.*$/, '').replaceAll(/[._]/g, '-');
}

function patternMatches(pattern: string, name: string): boolean {
  if (pattern.endsWith('*')) return name.startsWith(pattern.slice(0, -1));
  return name === pattern;
}

export function isSkippedPackage(ecosystem: PackageEcosystem, name: string): boolean {
  const normalized = normalizePackageName(ecosystem, name);
  for (const pattern of SKIP_PACKAGES) if (patternMatches(pattern, normalized)) return true;
  return false;
}

export function isProtocolClient(ecosystem: PackageEcosystem, name: string): boolean {
  return PROTOCOL_CLIENTS.has(normalizePackageName(ecosystem, name));
}

/** The vendor a dependency name points at, if the map knows it. */
export function matchPackage(ecosystem: PackageEcosystem, name: string): PackageMatch | undefined {
  const normalized = normalizePackageName(ecosystem, name);
  if (isSkippedPackage(ecosystem, name) || isProtocolClient(ecosystem, name)) return undefined;
  for (const entry of VENDORS) {
    for (const signal of entry.signals) {
      if (signal.kind !== 'package') continue;
      if (signal.ecosystems !== undefined && !signal.ecosystems.includes(ecosystem)) continue;
      if (patternMatches(signal.pattern, normalized)) return { entry, signal };
    }
  }
  return undefined;
}
