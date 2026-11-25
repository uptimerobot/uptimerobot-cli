/**
 * Sample repositories for the container scanner, held as data rather than as
 * files on disk. `oxfmt` globs the whole repository, and Dockerfiles aside,
 * every shape this scanner reads is a format oxfmt owns: checked in, these
 * fixtures are the formatter's to rewrite. It collapses the `rewrites` array in
 * `vercel.json` onto one line, which silently shifts every line number the
 * tests assert, and it cannot parse the malformed set at all, which fails
 * `format:check` outright. The tests write the tree they need into a temporary
 * directory instead.
 *
 * Each entry maps a repo-relative POSIX path to that file's contents.
 */

export type ContainerRepositoryFixture = Readonly<Record<string, string>>;

/**
 * A monorepo carrying one of every source the scanner understands, plus the
 * dotenv files it must never open and the vendored trees it must never enter.
 * The secrets are fake, and exist only so a leak would be visible in a finding.
 */
export const CONTAINER_REPOSITORY: ContainerRepositoryFixture = {
  '.env': [
    '// Fixture only. Fake values that the scanner must never read or report.',
    'DATABASE_URL=postgres://user:fixture-secret-1@db.internal:5432/app',
    'API_TOKEN=fixture-secret-2',
    'PORT=61234',
    '',
  ].join('\n'),
  '.env.production': [
    '// Fixture only. Fake values that the scanner must never read or report.',
    'API_TOKEN=fixture-secret-3',
    'METRICS_PORT=61235',
    '',
  ].join('\n'),
  '.venv/Dockerfile': 'FROM python:3.12-slim\nEXPOSE 61236\n',
  Dockerfile: [
    '# Build stage',
    'FROM node:22-alpine AS build',
    'WORKDIR /app',
    'COPY . .',
    'RUN npm ci',
    '',
    'FROM node:22-alpine',
    'ENV PORT=3000',
    'EXPOSE 3000 8080/tcp 9090/udp',
    'EXPOSE ${METRICS_PORT}',
    'HEALTHCHECK --interval=30s --timeout=3s --retries=3 \\',
    '  CMD curl -fsS http://localhost:3000/healthz || exit 1',
    'CMD ["node", "server.js"]',
    '',
  ].join('\n'),
  'apps/web/netlify.toml': [
    '# Netlify settings',
    '[build]',
    '  command = "pnpm build"',
    '  publish = "dist"',
    '  functions = "netlify/functions"',
    '',
    '[functions]',
    '  directory = "netlify/edge"',
    '  node_bundler = "esbuild"',
    '',
    '[[redirects]]',
    '  from = "/old-docs/*"',
    '  to = "/docs/:splat"',
    '  status = 301',
    '',
    '[[redirects]]',
    '  from = "/api/*"',
    '  to = "https://api.example.com/:splat"',
    '  status = 200',
    '  force = true',
    '',
    '[[context.production.redirects]]',
    '  from = "/beta"',
    '  to = "/"',
    '',
  ].join('\n'),
  'apps/web/vercel.json': [
    '{',
    '  "rewrites": [',
    '    { "source": "/api/(.*)", "destination": "https://api.example.com/$1" }',
    '  ],',
    '  "redirects": [',
    '    {',
    '      "source": "/legacy",',
    '      "destination": "/new",',
    '      "permanent": true',
    '    }',
    '  ],',
    '  "routes": [{ "src": "/health", "dest": "/api/health" }],',
    '  "crons": [',
    '    { "path": "/api/cron/rotate", "schedule": "0 3 * * *" },',
    '    { "path": "/api/cron/digest", "schedule": "*/15 * * * *" }',
    '  ]',
    '}',
    '',
  ].join('\n'),
  'apps/worker/worker.Dockerfile': [
    'FROM python:3.12-slim',
    'WORKDIR /srv',
    'EXPOSE 8000/tcp',
    'HEALTHCHECK --interval=1m CMD wget -qO- http://127.0.0.1:8000/live > /dev/null || exit 1',
    '',
  ].join('\n'),
  'docker-compose.yml': [
    'services:',
    '  api:',
    '    image: example/api:1.0',
    '    env_file: .env',
    '    environment:',
    '      - DATABASE_URL=${DATABASE_URL}',
    '    ports:',
    '      - "8080:3000"',
    '      - "127.0.0.1:9229:9229"',
    '      - "${METRICS_PORT:-9090}:9090/udp"',
    '      - "5000"',
    '    expose:',
    '      - 4000',
    '      - "4001/udp"',
    '    healthcheck:',
    '      test: ["CMD", "curl", "-f", "http://api.internal:3000/health"]',
    '      interval: 10s',
    '  db:',
    '    image: postgres:16',
    '    ports:',
    '      - target: 5432',
    '        published: "5433"',
    '        protocol: tcp',
    '        host_ip: 127.0.0.1',
    '        mode: host',
    '    healthcheck:',
    '      test: pg_isready -U postgres',
    '  edge:',
    '    image: caddy',
    '    ports:',
    '      - "[::1]:8443:443"',
    '    healthcheck:',
    '      test: wget -q --spider http://0.0.0.0:443/ping || exit 1',
    '',
  ].join('\n'),
  'vendor/acme/docker-compose.yml': [
    'services:',
    '  vendored:',
    '    ports:',
    '      - "61237:80"',
    '',
  ].join('\n'),
};

/**
 * DELIBERATELY BROKEN INPUT — do not repair any of it.
 *
 * The scanner's promise is that a malformed file is skipped and the scan
 * carries on, so these files exist only to be unparseable. Fix one and the
 * resilience test stops testing anything.
 *
 * Two guards keep that from happening quietly. The breakage is written with
 * escape sequences (`\t` for the illegal YAML indentation, an unterminated
 * bracket for the JSON) so no editor's format-on-save can tidy it away, and the
 * test asserts an empty result: repair any file here and the scanner starts
 * reporting findings from it, and the assertion fails loudly.
 */
export const MALFORMED_REPOSITORY: ContainerRepositoryFixture = {
  Dockerfile: [
    'FROM scratch',
    // EXPOSE with no ports, a healthcheck that names no address, and a
    // continuation with nothing after it: legible, but nothing to monitor.
    'EXPOSE',
    'HEALTHCHECK NONE',
    'HEALTHCHECK CMD pg_isready -U app',
    'RUN echo "trailing continuation" \\',
    '',
  ].join('\n'),
  // Tab-indented YAML. The YAML spec forbids tabs as indentation, so the
  // document fails to parse — hence the literal \t escapes below.
  'docker-compose.yml': [
    'services:',
    '\tapi:',
    '\t\tports:',
    '\t\t\t- "8080:80"',
    '\t\thealthcheck:',
    '\t\t\ttest: curl -f http://localhost:8080/health',
    '',
  ].join('\n'),
  // Not TOML: a table header that is never closed, and two key/value lines
  // each missing one of their halves.
  'netlify.toml': [
    'this file is not valid toml',
    '[[redirects',
    'from without equals',
    '= value without key',
    '[functions]',
    'directory',
    '',
  ].join('\n'),
  // Truncated JSON: the `crons` array and its object are both left open, so
  // the parser runs off the end of the document.
  'vercel.json': [
    '{',
    '  "crons": [',
    '    { "path": "/api/cron", "schedule": "0 0 * * *" }',
    '',
  ].join('\n'),
};
