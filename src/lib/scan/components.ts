/**
 * The component terms of the five providers that are tracked by component
 * rather than whole. A term is the text `scan --apply` sends to
 * `third-party-providers components --search`, so every one is a built-in
 * string that matches a component name in the catalog; nothing from the
 * repository is ever used as a term. Each rule names the terraform service
 * word (`s3` from `aws_s3_bucket`), the package names, or the signal texts
 * that point at the component. The tables mirror the component scoping
 * section of the discover-third-party-services skill.
 */
import type { ThirdPartyFinding } from './third-party.js';

interface ComponentRule {
  readonly term: string;
  /** The first word after the terraform resource prefix. */
  readonly services?: readonly string[];
  /** Exact package names, or a scope with a trailing `*`. */
  readonly packages?: readonly string[];
  /** Substrings of a file, CI, registry or git-host signal. */
  readonly signals?: readonly string[];
}

const rule = (term: string, parts: Omit<ComponentRule, 'term'>): ComponentRule => ({
  term,
  ...parts,
});

const AWS: readonly ComponentRule[] = [
  rule('Amazon Simple Storage Service', { services: ['s3'], packages: ['@aws-sdk/client-s3'] }),
  rule('Amazon Relational Database Service', { services: ['db', 'rds'] }),
  rule('Amazon Simple Queue Service', { services: ['sqs'], packages: ['@aws-sdk/client-sqs'] }),
  rule('Amazon Simple Notification Service', {
    services: ['sns'],
    packages: ['@aws-sdk/client-sns'],
  }),
  rule('Amazon Simple Email Service', {
    services: ['ses'],
    packages: ['@aws-sdk/client-ses', '@aws-sdk/client-sesv2'],
  }),
  rule('Amazon DynamoDB', { services: ['dynamodb'], packages: ['@aws-sdk/client-dynamodb'] }),
  rule('AWS Lambda', { services: ['lambda'], packages: ['@aws-sdk/client-lambda'] }),
  rule('Amazon Elastic Compute Cloud', { services: ['instance', 'launch'] }),
  rule('Amazon Elastic Container Service', { services: ['ecs'] }),
  rule('Amazon Elastic Kubernetes Service', { services: ['eks'] }),
  rule('Amazon ElastiCache', { services: ['elasticache'] }),
  rule('Amazon CloudFront', { services: ['cloudfront'] }),
  rule('Amazon Route 53', { services: ['route53'] }),
  rule('Amazon Elastic Container Registry', { services: ['ecr'], signals: ['.dkr.ecr.'] }),
  rule('Amazon Cognito', {
    services: ['cognito'],
    packages: ['@aws-sdk/client-cognito-identity-provider'],
  }),
];

const GOOGLE_CLOUD: readonly ComponentRule[] = [
  rule('Google Cloud Storage', {
    services: ['storage'],
    packages: ['@google-cloud/storage', 'cloud.google.com/go/storage', 'google-cloud-storage'],
  }),
  rule('Google Cloud Pub/Sub', {
    services: ['pubsub'],
    packages: ['@google-cloud/pubsub', 'cloud.google.com/go/pubsub', 'google-cloud-pubsub'],
  }),
  rule('Cloud Firestore', {
    services: ['firestore'],
    packages: [
      '@google-cloud/firestore',
      'cloud.google.com/go/firestore',
      'google-cloud-firestore',
    ],
  }),
  rule('Google BigQuery', {
    services: ['bigquery'],
    packages: ['@google-cloud/bigquery', 'cloud.google.com/go/bigquery', 'google-cloud-bigquery'],
  }),
  rule('Google Cloud SQL', { services: ['sql'] }),
  rule('Cloud Run', { services: ['cloud'] }),
  rule('Google Cloud Functions', { services: ['cloudfunctions', 'cloudfunctions2'] }),
  rule('Google Kubernetes Engine', { services: ['container'] }),
  rule('Cloud Memorystore', { services: ['redis'] }),
  rule('Cloud Build', { signals: ['cloudbuild.yaml'] }),
  rule('Artifact Registry', { services: ['artifact'], signals: ['.pkg.dev'] }),
];

const AZURE: readonly ComponentRule[] = [
  rule('Storage Accounts', { services: ['storage'], packages: ['@azure/storage-blob'] }),
  rule('Azure Cosmos DB', { services: ['cosmosdb'], packages: ['@azure/cosmos'] }),
  rule('Azure SQL Database', { services: ['mssql'] }),
  rule('Azure Kubernetes Service (AKS)', { services: ['kubernetes'] }),
  rule('Azure Cache for Redis', { services: ['redis'] }),
  rule('Azure Active Directory (Azure AD)', { packages: ['@azure/identity'] }),
];

const CLOUDFLARE: readonly ComponentRule[] = [
  rule('Workers', { services: ['workers'], signals: ['wrangler.toml', 'wrangler.jsonc'] }),
  rule('R2', { services: ['r2'] }),
  rule('Pages', { services: ['pages'] }),
  rule('Authoritative DNS', { services: ['record', 'zone'] }),
  rule('Access', { services: ['access'] }),
];

const GITHUB: readonly ComponentRule[] = [
  rule('Git Operations', { signals: ['git remote: github.com'] }),
  rule('Actions', { signals: ['ci: .github/workflows/'] }),
  rule('Packages', { signals: ['ghcr.io', 'npm.pkg.github.com'] }),
  rule('API Requests', { packages: ['@octokit/*'] }),
];

/** Providers tracked by component, each with its rules; every other provider has none. */
export const COMPONENT_RULES: ReadonlyMap<string, readonly ComponentRule[]> = new Map([
  ['AWS', AWS],
  ['Google Cloud', GOOGLE_CLOUD],
  ['Microsoft Azure', AZURE],
  ['Cloudflare', CLOUDFLARE],
  ['GitHub', GITHUB],
]);

/** Every term of every provider, for the test that checks them against the recorded catalog trees. */
export const COMPONENT_TERMS: readonly string[] = [...COMPONENT_RULES.values()]
  .flat()
  .map(({ term }) => term);

function packageMatches(pattern: string, name: string): boolean {
  return pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
}

const PACKAGE_KINDS: ReadonlySet<ThirdPartyFinding['kind']> = new Set([
  'npm',
  'pip',
  'go',
  'gem',
  'composer',
  'cargo',
]);

function ruleMatches(item: ComponentRule, finding: ThirdPartyFinding): boolean {
  const { detail } = finding;
  if (finding.kind === 'terraform-resource') {
    return 'service' in detail && (item.services?.includes(detail.service) ?? false);
  }
  if (PACKAGE_KINDS.has(finding.kind) && 'package' in detail) {
    return item.packages?.some((pattern) => packageMatches(pattern, detail.package)) ?? false;
  }
  return item.signals?.some((text) => detail.signal.includes(text)) ?? false;
}

/** The component term one finding of a scoped provider points at, if any. */
export function componentTerm(finding: ThirdPartyFinding): string | undefined {
  return COMPONENT_RULES.get(finding.value)?.find((item) => ruleMatches(item, finding))?.term;
}
