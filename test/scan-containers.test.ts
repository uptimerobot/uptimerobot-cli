import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ContainerFinding,
  DEFAULT_CONTAINER_SCAN_LIMITS,
  scanContainers,
} from '../src/lib/scan/containers.js';
import {
  CONTAINER_REPOSITORY,
  MALFORMED_REPOSITORY,
} from './fixtures/scan/containers/repositories.js';

/** Every path handed to readFile, so the dotenv guarantee can be asserted. */
const readPaths = vi.hoisted(() => [] as string[]);

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const readFile = (...args: unknown[]) => {
    readPaths.push(String(args[0]));
    return (actual.readFile as (...called: unknown[]) => unknown)(...args);
  };
  return { ...actual, default: { ...actual, readFile }, readFile };
});

/** The two fixture trees, written fresh for each test. See ./fixtures/scan/containers/. */
let REPO = '';
let MALFORMED = '';

const temporaryRoots: string[] = [];

beforeEach(async () => {
  REPO = await temporaryRepo(CONTAINER_REPOSITORY);
  MALFORMED = await temporaryRepo(MALFORMED_REPOSITORY);
});

afterEach(async () => {
  readPaths.length = 0;
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function temporaryRepo(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ur-scan-containers-'));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, contents);
  }
  return root;
}

/** Findings from one file, which is where the interesting assertions live. */
function findingsIn(
  findings: readonly ContainerFinding[],
  file: string,
): readonly ContainerFinding[] {
  return findings.filter((finding) => finding.evidence.file === file);
}

describe('scanContainers — dot-directories', () => {
  it('prunes agent worktrees and other dot-directories', async () => {
    const dockerfile = 'FROM node:22\nEXPOSE 8080\n';
    const root = await temporaryRepo({
      Dockerfile: dockerfile,
      // A nested git worktree is a second copy of the tree; without pruning,
      // its Dockerfile double-counts every EXPOSE.
      '.claude/worktrees/wt/Dockerfile': dockerfile,
    });

    const findings = await scanContainers(root);
    expect(findings.some((finding) => finding.evidence.file.startsWith('.claude/'))).toBe(false);
    expect(findingsIn(findings, 'Dockerfile')).not.toEqual([]);
  });
});

describe('scanContainers — Dockerfile', () => {
  it('reads every port on a multi-port EXPOSE, keeping /tcp and /udp suffixes', async () => {
    const findings = findingsIn(await scanContainers(REPO), 'Dockerfile');

    expect(findings.filter((finding) => finding.kind === 'docker-expose')).toEqual([
      {
        detail: { protocol: 'tcp' },
        evidence: { file: 'Dockerfile', line: 9 },
        kind: 'docker-expose',
        value: '3000',
      },
      {
        detail: { protocol: 'tcp' },
        evidence: { file: 'Dockerfile', line: 9 },
        kind: 'docker-expose',
        value: '8080',
      },
      {
        detail: { protocol: 'udp' },
        evidence: { file: 'Dockerfile', line: 9 },
        kind: 'docker-expose',
        value: '9090',
      },
      {
        detail: { protocol: 'tcp', variable: 'METRICS_PORT' },
        evidence: { file: 'Dockerfile', line: 10 },
        kind: 'docker-expose',
        value: '${METRICS_PORT}',
      },
    ]);
  });

  it('extracts the probed URL from a HEALTHCHECK split across a continuation', async () => {
    const findings = findingsIn(await scanContainers(REPO), 'Dockerfile');

    expect(findings.filter((finding) => finding.kind === 'docker-healthcheck')).toEqual([
      {
        detail: {
          command:
            '--interval=30s --timeout=3s --retries=3 CMD curl -fsS http://localhost:3000/healthz || exit 1',
        },
        evidence: { file: 'Dockerfile', line: 11 },
        kind: 'docker-healthcheck',
        value: 'http://localhost:3000/healthz',
      },
    ]);
  });

  it('matches the *.Dockerfile spelling and a single-line healthcheck', async () => {
    const findings = findingsIn(await scanContainers(REPO), 'apps/worker/worker.Dockerfile');

    expect(findings.map((finding) => [finding.kind, finding.value, finding.evidence.line])).toEqual(
      [
        ['docker-expose', '8000', 3],
        ['docker-healthcheck', 'http://127.0.0.1:8000/live', 4],
      ],
    );
  });

  it('drops healthchecks that name no address for a monitor to reproduce', async () => {
    const root = await temporaryRepo({
      Dockerfile:
        'FROM postgres:16\nHEALTHCHECK CMD pg_isready -U app\nHEALTHCHECK CMD nc -z db 5432\n',
    });

    expect(await scanContainers(root)).toEqual([]);
  });
});

describe('scanContainers — Compose', () => {
  it('reads the short port form, including host bindings and protocol suffixes', async () => {
    const findings = findingsIn(await scanContainers(REPO), 'docker-compose.yml').filter(
      (finding) => finding.kind === 'compose-port' && finding.detail?.service === 'api',
    );

    expect(findings).toEqual([
      {
        detail: {
          protocol: 'tcp',
          published: '8080',
          raw: '8080:3000',
          service: 'api',
          target: '3000',
        },
        evidence: { file: 'docker-compose.yml', line: 8 },
        kind: 'compose-port',
        value: '8080',
      },
      {
        detail: {
          hostIp: '127.0.0.1',
          protocol: 'tcp',
          published: '9229',
          raw: '127.0.0.1:9229:9229',
          service: 'api',
          target: '9229',
        },
        evidence: { file: 'docker-compose.yml', line: 9 },
        kind: 'compose-port',
        value: '9229',
      },
      {
        detail: {
          protocol: 'udp',
          published: '${METRICS_PORT:-9090}',
          raw: '${METRICS_PORT:-9090}:9090/udp',
          service: 'api',
          target: '9090',
          variable: 'METRICS_PORT',
        },
        evidence: { file: 'docker-compose.yml', line: 10 },
        kind: 'compose-port',
        value: '${METRICS_PORT:-9090}',
      },
      {
        detail: { protocol: 'tcp', raw: '5000', service: 'api', target: '5000' },
        evidence: { file: 'docker-compose.yml', line: 11 },
        kind: 'compose-port',
        value: '5000',
      },
    ]);
  });

  it('reads the long port form with published, target, and host_ip', async () => {
    const findings = findingsIn(await scanContainers(REPO), 'docker-compose.yml').filter(
      (finding) => finding.detail?.service === 'db',
    );

    expect(findings).toEqual([
      {
        detail: {
          hostIp: '127.0.0.1',
          mode: 'host',
          protocol: 'tcp',
          published: '5433',
          service: 'db',
          target: '5432',
        },
        evidence: { file: 'docker-compose.yml', line: 21 },
        kind: 'compose-port',
        value: '5433',
      },
    ]);
  });

  it('splits a bracketed IPv6 binding without mistaking its colons for separators', async () => {
    const findings = findingsIn(await scanContainers(REPO), 'docker-compose.yml').filter(
      (finding) => finding.kind === 'compose-port' && finding.detail?.service === 'edge',
    );

    expect(findings).toEqual([
      {
        detail: {
          hostIp: '::1',
          protocol: 'tcp',
          published: '8443',
          raw: '[::1]:8443:443',
          service: 'edge',
          target: '443',
        },
        evidence: { file: 'docker-compose.yml', line: 31 },
        kind: 'compose-port',
        value: '8443',
      },
    ]);
  });

  it('records expose entries as container-internal ports', async () => {
    const findings = findingsIn(await scanContainers(REPO), 'docker-compose.yml').filter(
      (finding) => finding.kind === 'compose-expose',
    );

    expect(findings).toEqual([
      {
        detail: { protocol: 'tcp', service: 'api' },
        evidence: { file: 'docker-compose.yml', line: 13 },
        kind: 'compose-expose',
        value: '4000',
      },
      {
        detail: { protocol: 'udp', service: 'api' },
        evidence: { file: 'docker-compose.yml', line: 14 },
        kind: 'compose-expose',
        value: '4001',
      },
    ]);
  });

  it('extracts healthcheck URLs from both the exec array and the shell string form', async () => {
    const findings = findingsIn(await scanContainers(REPO), 'docker-compose.yml').filter(
      (finding) => finding.kind === 'compose-healthcheck',
    );

    expect(findings).toEqual([
      {
        detail: { command: 'curl -f http://api.internal:3000/health', service: 'api' },
        evidence: { file: 'docker-compose.yml', line: 16 },
        kind: 'compose-healthcheck',
        value: 'http://api.internal:3000/health',
      },
      {
        detail: {
          command: 'wget -q --spider http://0.0.0.0:443/ping || exit 1',
          service: 'edge',
        },
        evidence: { file: 'docker-compose.yml', line: 33 },
        kind: 'compose-healthcheck',
        value: 'http://0.0.0.0:443/ping',
      },
    ]);
  });

  it('matches compose.yaml and docker-compose.<override>.yml spellings', async () => {
    const service = 'services:\n  web:\n    ports:\n      - "1234:80"\n';
    const root = await temporaryRepo({
      'compose.yaml': service,
      'docker-compose.override.yml': service,
      'docker-compose.yaml': service,
    });

    expect((await scanContainers(root)).map((finding) => finding.evidence.file)).toEqual([
      'compose.yaml',
      'docker-compose.override.yml',
      'docker-compose.yaml',
    ]);
  });
});

describe('scanContainers — Vercel and Netlify', () => {
  it('reads rewrites, redirects, routes, and crons out of vercel.json', async () => {
    const findings = findingsIn(await scanContainers(REPO), 'apps/web/vercel.json');

    expect(findings).toEqual([
      {
        detail: { destination: 'https://api.example.com/$1' },
        evidence: { file: 'apps/web/vercel.json', line: 3 },
        kind: 'vercel-rewrite',
        value: '/api/(.*)',
      },
      {
        detail: { destination: '/new', permanent: 'true' },
        evidence: { file: 'apps/web/vercel.json', line: 7 },
        kind: 'vercel-redirect',
        value: '/legacy',
      },
      {
        detail: { dest: '/api/health' },
        evidence: { file: 'apps/web/vercel.json', line: 12 },
        kind: 'vercel-route',
        value: '/health',
      },
      {
        detail: { schedule: '0 3 * * *' },
        evidence: { file: 'apps/web/vercel.json', line: 14 },
        kind: 'vercel-cron',
        value: '/api/cron/rotate',
      },
      {
        detail: { schedule: '*/15 * * * *' },
        evidence: { file: 'apps/web/vercel.json', line: 15 },
        kind: 'vercel-cron',
        value: '/api/cron/digest',
      },
    ]);
  });

  it('reads redirect blocks and both functions-directory settings out of netlify.toml', async () => {
    const findings = findingsIn(await scanContainers(REPO), 'apps/web/netlify.toml');

    expect(findings).toEqual([
      {
        detail: { setting: 'build.functions' },
        evidence: { file: 'apps/web/netlify.toml', line: 5 },
        kind: 'netlify-functions',
        value: 'netlify/functions',
      },
      {
        detail: { setting: 'functions.directory' },
        evidence: { file: 'apps/web/netlify.toml', line: 8 },
        kind: 'netlify-functions',
        value: 'netlify/edge',
      },
      {
        detail: { status: '301', to: '/docs/:splat' },
        evidence: { file: 'apps/web/netlify.toml', line: 12 },
        kind: 'netlify-redirect',
        value: '/old-docs/*',
      },
      {
        detail: { status: '200', to: 'https://api.example.com/:splat' },
        evidence: { file: 'apps/web/netlify.toml', line: 17 },
        kind: 'netlify-redirect',
        value: '/api/*',
      },
      {
        detail: { to: '/' },
        evidence: { file: 'apps/web/netlify.toml', line: 23 },
        kind: 'netlify-redirect',
        value: '/beta',
      },
    ]);
  });
});

describe('scanContainers — resilience', () => {
  it('skips malformed YAML, JSON, and TOML instead of throwing', async () => {
    await expect(scanContainers(MALFORMED)).resolves.toEqual([]);
    // The files were reached and read; they yielded nothing because they are
    // unparseable, not because the walk missed them.
    expect(readPaths.map((path) => path.split('/').at(-1)).sort()).toEqual([
      'Dockerfile',
      'docker-compose.yml',
      'netlify.toml',
      'vercel.json',
    ]);
  });

  it('returns nothing for a missing or unreadable root', async () => {
    await expect(scanContainers(join(REPO, 'does-not-exist'))).resolves.toEqual([]);
  });

  it('leaves YAML aliases unresolved rather than expanding them', async () => {
    const root = await temporaryRepo({
      'docker-compose.yml':
        'x-ports: &shared\n  - "7000:80"\nservices:\n  api:\n    ports: *shared\n',
    });

    expect(await scanContainers(root)).toEqual([]);
  });
});

describe('scanContainers — guardrails', () => {
  it('never opens a dotenv file, and never reports what one contains', async () => {
    const findings = await scanContainers(REPO);

    expect(readPaths.length).toBeGreaterThan(0);
    expect(readPaths.filter((path) => /(^|[/\\])\.env(\.|$)/.test(path))).toEqual([]);
    expect(JSON.stringify(findings)).not.toContain('fixture-secret');
    expect(JSON.stringify(findings)).not.toContain('61234');
  });

  it('skips vendored and virtual-environment directories', async () => {
    const files = new Set((await scanContainers(REPO)).map((finding) => finding.evidence.file));

    expect([...files].sort()).toEqual([
      'Dockerfile',
      'apps/web/netlify.toml',
      'apps/web/vercel.json',
      'apps/worker/worker.Dockerfile',
      'docker-compose.yml',
    ]);
  });

  it('skips node_modules, dist, and the rest of the excluded directory set', async () => {
    const dockerfile = 'FROM scratch\nEXPOSE 4242\n';
    const root = await temporaryRepo({
      '.git/Dockerfile': dockerfile,
      '.next/Dockerfile': dockerfile,
      '.venv/Dockerfile': dockerfile,
      '__pycache__/Dockerfile': dockerfile,
      'build/Dockerfile': dockerfile,
      'dist/Dockerfile': dockerfile,
      'node_modules/pkg/Dockerfile': dockerfile,
      'vendor/Dockerfile': dockerfile,
    });

    expect(await scanContainers(root)).toEqual([]);
  });

  it('does not follow a symlink that leaves the repository', async () => {
    const outside = await temporaryRepo({ Dockerfile: 'FROM scratch\nEXPOSE 5151\n' });
    const root = await temporaryRepo({ 'README.md': 'placeholder\n' });
    await symlink(join(outside, 'Dockerfile'), join(root, 'Dockerfile'));

    expect(await scanContainers(root)).toEqual([]);
  });

  it('orders findings by file, then line, then value', async () => {
    const findings = await scanContainers(REPO);
    const keys = findings.map(
      (finding) => `${finding.evidence.file} ${String(finding.evidence.line).padStart(6, '0')}`,
    );

    expect(keys).toEqual([...keys].sort());
    expect(findings).toEqual(await scanContainers(REPO));
  });
});

describe('scanContainers — caps', () => {
  it('defaults to limits sized for a monorepo', () => {
    expect(DEFAULT_CONTAINER_SCAN_LIMITS).toEqual({
      maxDepth: 8,
      maxEntries: 5_000,
      maxFileBytes: 512 * 1_024,
      maxFiles: 200,
    });
  });

  it('stops the walk once maxEntries directory entries have been visited', async () => {
    expect(await scanContainers(REPO, { maxEntries: 1 })).toEqual([]);
    expect((await scanContainers(REPO, { maxEntries: 4 })).length).toBeGreaterThan(0);
  });

  it('stops collecting once maxFiles candidates have matched', async () => {
    const files = new Set(
      (await scanContainers(REPO, { maxFiles: 1 })).map((finding) => finding.evidence.file),
    );

    expect([...files]).toEqual(['Dockerfile']);
  });

  it('does not descend past maxDepth', async () => {
    const files = new Set(
      (await scanContainers(REPO, { maxDepth: 1 })).map((finding) => finding.evidence.file),
    );

    expect([...files].sort()).toEqual(['Dockerfile', 'docker-compose.yml']);
  });

  it('skips files larger than maxFileBytes without reading them', async () => {
    expect(await scanContainers(REPO, { maxFileBytes: 16 })).toEqual([]);
    expect(readPaths).toEqual([]);
  });
});

describe('healthcheck findings never carry a credential', () => {
  it('bounds the probe and the command of an oversize healthcheck before redacting', async () => {
    const path = 'a'.repeat(60_000);
    const root = await temporaryRepo({
      Dockerfile: `FROM node\nHEALTHCHECK CMD curl -f http://localhost:3000/${path}\n`,
    });

    const [finding] = await scanContainers(root);

    expect(finding?.value.length).toBeLessThanOrEqual(2001);
    expect(finding?.detail?.command?.length).toBeLessThanOrEqual(200);
  });

  it('redacts userinfo and sensitive query parameters in the probe and the command', async () => {
    const root = await temporaryRepo({
      Dockerfile:
        'FROM node\nHEALTHCHECK CMD curl -f "http://admin:hunter2@localhost:3000/health?token=abc123def"\n',
    });

    const [finding] = await scanContainers(root);

    expect(finding?.value).toBe('http://***@localhost:3000/health?token=***');
    expect(finding?.detail?.command).toBe(
      'CMD curl -f "http://***@localhost:3000/health?token=***"',
    );
    expect(JSON.stringify(finding)).not.toContain('hunter2');
    expect(JSON.stringify(finding)).not.toContain('abc123def');
  });
});

describe('a credential the clip cuts in half never leaks', () => {
  it('masks a userinfo whose password runs past the redaction window', async () => {
    const password = 'p'.repeat(3000);
    const root = await temporaryRepo({
      Dockerfile: `FROM node\nHEALTHCHECK CMD curl -f http://admin:${password}@localhost:3000/health\n`,
    });

    const [finding] = await scanContainers(root);

    expect(JSON.stringify(finding)).not.toContain('ppp');
    expect(finding?.value).toBe('http://***');
  });
});

describe('the probe is read from the redacted command', () => {
  it('never exposes a password prefix when a comma in it would end the probe early', async () => {
    const root = await temporaryRepo({
      Dockerfile:
        'FROM node\nHEALTHCHECK CMD curl -f http://admin:hunter,2@localhost:3000/health\n',
    });

    const [finding] = await scanContainers(root);

    expect(finding?.value).not.toContain('hunter');
    expect(finding?.value).toBe('http://***@localhost:3000/health');
    expect(JSON.stringify(finding)).not.toContain('hunter');
  });
});

describe('round two: redaction and truncation', () => {
  it('redacts Vercel and Netlify destinations like healthcheck commands', async () => {
    const root = await temporaryRepo({
      'vercel.json': JSON.stringify({
        rewrites: [
          { source: '/api/:path*', destination: 'https://api.vendor.com/:path*?api_key=abc123def' },
        ],
      }),
      'netlify.toml': [
        '[[redirects]]',
        '  from = "/old"',
        '  to = "https://admin:hunter2@x.example/"',
        '  status = 301',
        '',
      ].join('\n'),
    });

    const findings = await scanContainers(root);
    const text = JSON.stringify(findings);

    expect(text).not.toContain('abc123def');
    expect(text).not.toContain('hunter2');
    expect(text).toContain('api_key=***');
    expect(text).toContain('https://***@x.example/');
  });

  it('reports no truncation when the budget is full and the next entry is not a candidate', async () => {
    const compose = 'services:\n  web:\n    ports:\n      - "80:80"\n';
    const root = await temporaryRepo({ 'a/docker-compose.yml': compose, 'b/README.md': 'hi' });
    let truncated = false;

    await scanContainers(root, {
      maxFiles: 1,
      onTruncated: () => {
        truncated = true;
      },
    });

    expect(truncated).toBe(false);
  });
});

describe('a destination keeps its host for classification', () => {
  it('redacts but does not clip a long rewrite destination', async () => {
    const label = 'a'.repeat(63);
    const destination = `https://${label}.${label}.${label}.internal/`;
    const root = await temporaryRepo({
      'vercel.json': JSON.stringify({ rewrites: [{ source: '/api/:path*', destination }] }),
    });

    const [finding] = await scanContainers(root);

    expect(finding?.detail?.destination).toBe(destination);
  });
});

describe('scanContainers — round three', () => {
  it('keeps a bracketed IPv6 authority in a healthcheck probe', async () => {
    const root = await temporaryRepo({
      Dockerfile: 'FROM x\nHEALTHCHECK CMD curl http://[::1]:8080/health\n',
      'app/Dockerfile': 'FROM x\nHEALTHCHECK CMD curl http://host:8080/health\n',
    });

    const findings = await scanContainers(root);

    expect(findingsIn(findings, 'Dockerfile')[0]?.value).toBe('http://[::1]:8080/health');
    expect(findingsIn(findings, 'app/Dockerfile')[0]?.value).toBe('http://host:8080/health');
  });

  it('reports a scan the depth limit cut short as truncated', async () => {
    const root = await temporaryRepo({ 'a/b/Dockerfile': 'FROM x\nEXPOSE 80\n' });
    let truncated = false;

    const findings = await scanContainers(root, {
      maxDepth: 1,
      onTruncated: () => {
        truncated = true;
      },
    });

    expect(findings).toEqual([]);
    expect(truncated).toBe(true);
  });

  it('never reads a dotenv file through a symlink named like a Dockerfile', async () => {
    const root = await temporaryRepo({ '.env': 'EXPOSE 80\n' });
    await symlink(join(root, '.env'), join(root, 'Dockerfile'));

    const findings = await scanContainers(root);

    expect(findings).toEqual([]);
    expect(readPaths.some((path) => path.endsWith('.env'))).toBe(false);
  });

  it('keeps a CMD-SHELL script as written so a quoted credential inside it is still masked', async () => {
    const root = await temporaryRepo({
      'docker-compose.yml': [
        'services:',
        '  api:',
        '    healthcheck:',
        '      test: ["CMD-SHELL", "curl --user \\"admin:alpha hunter2\\" http://localhost:3000/health"]',
        '',
      ].join('\n'),
    });
    const [finding] = await scanContainers(root);
    expect(finding?.value).toBe('http://localhost:3000/health');
    expect(finding?.detail?.command).not.toContain('hunter2');
    expect(finding?.detail?.command).not.toContain('alpha');
  });

  it('keeps a credential with a space inside one exec-array argument out of the command', async () => {
    const root = await temporaryRepo({
      'docker-compose.yml': [
        'services:',
        '  api:',
        '    healthcheck:',
        '      test: ["CMD", "curl", "-u", "admin:alpha hunter2", "http://localhost:3000/health"]',
        '',
      ].join('\n'),
    });

    const [finding] = await scanContainers(root);

    expect(finding?.value).toBe('http://localhost:3000/health');
    expect(finding?.detail?.command).not.toContain('hunter2');
    expect(finding?.detail?.command).not.toContain('alpha');
  });
});
