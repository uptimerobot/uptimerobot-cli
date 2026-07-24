import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RouteFinding } from '../src/lib/scan/routes.js';
import { scanRoutes } from '../src/lib/scan/routes.js';
import {
  DJANGO_REPOSITORY,
  EXPRESS_REPOSITORY,
  HOSTILE_REPOSITORY,
  NEXT_APP_REPOSITORY,
  NEXT_PAGES_REPOSITORY,
  NEXT_SRC_APP_REPOSITORY,
  NEXT_SRC_PAGES_REPOSITORY,
  RAILS_REPOSITORY,
  type RepositoryFixture,
} from './fixtures/scan/routes/repositories.js';

/**
 * Records every path the scanner actually opens. The dotenv guardrail is a
 * promise about reads, not about results, so it is asserted against the reads
 * themselves rather than against the findings they would have produced.
 */
const openedFiles = vi.hoisted(() => [] as string[]);

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  const readFile = original.readFile as (path: unknown, options: unknown) => Promise<unknown>;
  return {
    ...original,
    default: original,
    readFile: (path: unknown, options: unknown) => {
      openedFiles.push(String(path));
      return readFile(path, options);
    },
  };
});

const temporaryDirectories: string[] = [];

/** Materializes a fixture repository in a temporary directory. */
async function writeRepository(files: RepositoryFixture): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'uptimerobot-cli-test-'));
  temporaryDirectories.push(root);
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return root;
}

/** `kind path file:line detail` — compact enough to read a whole scan at once. */
function summarize(findings: readonly RouteFinding[]): string[] {
  return findings.map((finding) => {
    const detail = Object.entries(finding.detail ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join(',');
    return `${finding.kind} ${finding.value} ${finding.evidence.file}:${finding.evidence.line}${
      detail ? ` ${detail}` : ''
    }`;
  });
}

beforeEach(() => {
  openedFiles.length = 0;
});

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('scanRoutes: Next.js App Router', () => {
  it('derives paths from the directory tree, including every non-path segment', async () => {
    const root = await writeRepository(NEXT_APP_REPOSITORY);

    expect(summarize(await scanRoutes(root))).toEqual([
      // Route groups nest and still contribute nothing to the URL.
      'next-app /about app/(marketing)/(promo)/about/page.tsx:1 type=page',
      'next-app /api/health app/api/health/route.ts:3 method=GET,type=route',
      'next-app /api/health app/api/health/route.ts:7 method=POST,type=route',
      // No recognizable handler export still proves the route exists.
      'next-app /api/legacy app/api/legacy/route.js:1 type=route',
      'next-app /blog/[slug] app/blog/[slug]/page.tsx:1 type=page',
      'next-app /dashboard app/dashboard/@analytics/page.tsx:1 type=page',
      'next-app /docs/[...path] app/docs/[...path]/page.tsx:1 type=page',
      'next-app / app/page.tsx:1 type=page',
      'next-app /shop/[[...filters]] app/shop/[[...filters]]/page.tsx:1 type=page',
    ]);
  });

  it('never routes an underscore-prefixed private folder', async () => {
    const root = await writeRepository(NEXT_APP_REPOSITORY);
    const findings = await scanRoutes(root);

    expect(findings.some((finding) => finding.evidence.file.includes('_components'))).toBe(false);
  });

  it('resolves a src/app root', async () => {
    const root = await writeRepository(NEXT_SRC_APP_REPOSITORY);

    expect(summarize(await scanRoutes(root))).toEqual([
      'next-app /login src/app/(auth)/login/page.tsx:1 type=page',
      'next-app /api/status src/app/api/status/route.ts:1 method=GET,type=route',
      'next-app / src/app/page.tsx:1 type=page',
    ]);
  });

  it('anchors the router root the way Next.js does in nested layouts', async () => {
    const root = await writeRepository({
      // A workspace package: the only `app` present is the router root.
      'apps/web/app/api/orders/route.ts': 'export function GET() {}\n',
      // A workspace package with its own src root.
      'apps/admin/src/app/settings/page.tsx': 'export default function S() {}\n',
      // A route literally named `/app`: the outer directory is the root.
      'app/app/page.tsx': 'export default function A() {}\n',
    });

    expect(summarize(await scanRoutes(root))).toEqual([
      'next-app /app app/app/page.tsx:1 type=page',
      'next-app /settings apps/admin/src/app/settings/page.tsx:1 type=page',
      'next-app /api/orders apps/web/app/api/orders/route.ts:1 method=GET,type=route',
    ]);
  });
});

describe('scanRoutes: Next.js Pages Router', () => {
  it('maps index to its directory and skips every reserved file', async () => {
    const root = await writeRepository(NEXT_PAGES_REPOSITORY);

    expect(summarize(await scanRoutes(root))).toEqual([
      'next-pages /api/ping pages/api/ping.ts:1 type=api',
      'next-pages /api/search/[[...query]] pages/api/search/[[...query]].ts:1 type=api',
      'next-pages /api/users/[...rest] pages/api/users/[...rest].ts:1 type=api',
      'next-pages /blog/[id] pages/blog/[id].tsx:1 type=page',
      'next-pages /blog pages/blog/index.tsx:1 type=page',
      'next-pages / pages/index.tsx:1 type=page',
    ]);
  });

  it('resolves a src/pages root', async () => {
    const root = await writeRepository(NEXT_SRC_PAGES_REPOSITORY);

    expect(summarize(await scanRoutes(root))).toEqual([
      'next-pages /api/webhook src/pages/api/webhook.ts:1 type=api',
      'next-pages / src/pages/index.tsx:1 type=page',
    ]);
  });
});

describe('scanRoutes: Django', () => {
  it('captures path and re_path literals and ignores lookalike calls', async () => {
    const root = await writeRepository(DJANGO_REPOSITORY);

    expect(summarize(await scanRoutes(root))).toEqual([
      'django /invoices/ billing/urls.py:4',
      'django / project/urls.py:6',
      'django /api/health/ project/urls.py:7',
      // Anchors are stripped so every value is still a path.
      'django /api/orders/(?P<pk>\\d+)/ project/urls.py:8 pattern=regex',
      'django /billing/ project/urls.py:9',
    ]);
  });
});

describe('scanRoutes: Rails', () => {
  it('reads config/routes.rb only, covering verbs and resource declarations', async () => {
    const root = await writeRepository(RAILS_REPOSITORY);

    expect(summarize(await scanRoutes(root))).toEqual([
      'rails /health config/routes.rb:2 method=GET',
      'rails /api/v1/sessions config/routes.rb:3 method=POST',
      'rails /account config/routes.rb:4 method=PATCH',
      'rails /api/v1/sessions config/routes.rb:5 method=DELETE',
      'rails /monitors config/routes.rb:7 resource=resources',
      'rails /profile config/routes.rb:8 resource=resource',
    ]);
  });
});

describe('scanRoutes: Express', () => {
  it('detects verb calls on any receiver and skips non-route .get() calls', async () => {
    const root = await writeRepository(EXPRESS_REPOSITORY);

    expect(summarize(await scanRoutes(root))).toEqual([
      'express /health server.js:5 method=GET',
      'express /api/v1/monitors server.js:6 method=POST',
      'express /api/v1 server.js:7 mount=true',
      'express /users src/routes/users.ts:5 method=GET',
      'express /users/:id src/routes/users.ts:6 method=DELETE',
      'express /users/:id/audit src/routes/users.ts:7 method=ALL',
    ]);
  });
});

describe('scanRoutes: NestJS', () => {
  it('composes each method decorator against the nearest @Controller prefix', async () => {
    const root = await writeRepository({
      'src/monitors/storm-protection.controller.ts': [
        "import { Controller, Get, Patch, Post } from '@nestjs/common';",
        '',
        "@Controller('monitors/storm-protection')",
        'export class StormProtectionController {',
        '  @Get()',
        '  list() {}',
        '',
        "  @Get(':id')",
        '  getById() {}',
        '',
        "  @Post('sub/path')",
        '  create() {}',
        '',
        "  @Patch(':id')",
        '  patch() {}',
        '}',
        '',
      ].join('\n'),
      // A colocated spec stands up throwaway controllers; the TEST_FILENAME guard
      // means it is never read, whatever it declares.
      'src/monitors/storm-protection.controller.spec.ts':
        "@Controller('should-not-appear')\n@Get()\ndescribe('x', () => {});\n",
    });

    expect(summarize(await scanRoutes(root))).toEqual([
      'nestjs /monitors/storm-protection src/monitors/storm-protection.controller.ts:5 method=GET,controller=monitors/storm-protection',
      'nestjs /monitors/storm-protection/:id src/monitors/storm-protection.controller.ts:8 method=GET,controller=monitors/storm-protection',
      'nestjs /monitors/storm-protection/sub/path src/monitors/storm-protection.controller.ts:11 method=POST,controller=monitors/storm-protection',
      'nestjs /monitors/storm-protection/:id src/monitors/storm-protection.controller.ts:14 method=PATCH,controller=monitors/storm-protection',
    ]);
  });

  it('handles a bare @Controller(), @All, and several controllers in one file', async () => {
    const root = await writeRepository({
      'src/app.controller.ts': [
        "import { All, Controller, Get } from '@nestjs/common';",
        '',
        '@Controller()',
        'export class AppController {',
        '  @Get()',
        '  root() {}',
        '',
        "  @Get('health')",
        '  health() {}',
        '}',
        '',
        "@Controller('admin')",
        'export class AdminController {',
        '  @All()',
        '  proxy() {}',
        '}',
        '',
      ].join('\n'),
    });

    // The empty prefix yields no `controller` detail; @All belongs to AdminController.
    expect(summarize(await scanRoutes(root))).toEqual([
      'nestjs / src/app.controller.ts:5 method=GET',
      'nestjs /health src/app.controller.ts:8 method=GET',
      'nestjs /admin src/app.controller.ts:14 method=ALL,controller=admin',
    ]);
  });
});

describe('scanRoutes: Laravel', () => {
  it('captures verb, match and resource routes, normalizing the leading slash', async () => {
    const root = await writeRepository({
      'routes/api.php': [
        '<?php',
        'use Illuminate\\Support\\Facades\\Route;',
        '',
        "Route::get('getMonitorList/{pspURLKey}', [ApiController::class, 'getMonitorList']);",
        "Route::post('clearCache/{pspURLKey}', [ApiController::class, 'clearCache']);",
        "Route::any('webhook', [ApiController::class, 'webhook']);",
        "Route::match(['get', 'post'], 'sync/{id}', [ApiController::class, 'sync']);",
        "Route::resource('photos', PhotoController::class);",
        "Route::apiResource('videos', VideoController::class);",
        '',
      ].join('\n'),
      // No `Route::` here, so the controller's own `$this->get(...)` is never a route.
      'app/Http/Controllers/ApiController.php': [
        '<?php',
        'class ApiController {',
        "    public function show() { return $this->get('should-not-appear'); }",
        '}',
        '',
      ].join('\n'),
    });

    // `{pspURLKey}` / `{id}` are preserved; `any` and `match` report ALL.
    expect(summarize(await scanRoutes(root))).toEqual([
      'laravel /getMonitorList/{pspURLKey} routes/api.php:4 method=GET',
      'laravel /clearCache/{pspURLKey} routes/api.php:5 method=POST',
      'laravel /webhook routes/api.php:6 method=ALL',
      'laravel /sync/{id} routes/api.php:7 method=ALL',
      'laravel /photos routes/api.php:8 resource=resource',
      'laravel /videos routes/api.php:9 resource=apiResource',
    ]);
  });

  it('reads the $router variable form without composing the group prefix', async () => {
    const root = await writeRepository({
      'routes/legacy.php': [
        '<?php',
        "Route::group(['prefix' => 'legacy'], function () use ($router) {",
        "    $router->get('status', 'LegacyController@status');",
        "    $router->post('sync/{id}', 'LegacyController@sync');",
        '});',
        '',
      ].join('\n'),
    });

    // The `legacy` group prefix is not prepended; each literal path stands alone.
    expect(summarize(await scanRoutes(root))).toEqual([
      'laravel /status routes/legacy.php:3 method=GET',
      'laravel /sync/{id} routes/legacy.php:4 method=POST',
    ]);
  });
});

describe('scanRoutes: tests and dot-directories', () => {
  it('never treats a route declared in a test file as an endpoint', async () => {
    const root = await writeRepository({
      'src/server.ts': "app.get('/real');\n",
      'src/handler.spec.ts': "app.post('/echo');\n",
      'src/handler.integration.spec.ts': "app.post('/echo-integration');\n",
      'src/handler.test.ts': "app.get('/from-test');\n",
      'src/handler.e2e-spec.ts': "app.get('/from-e2e');\n",
      'src/__tests__/plain.ts': "app.get('/inside-tests-dir');\n",
    });

    // Only the real route survives; every throwaway app in a test is dropped.
    expect(summarize(await scanRoutes(root))).toEqual(['express /real src/server.ts:1 method=GET']);
  });

  it('never descends into a dot-directory, including an agent worktree copy', async () => {
    const root = await writeRepository({
      'apps/api/server.ts': "app.get('/health');\n",
      // A nested git worktree under .claude is a second copy of the whole tree.
      '.claude/worktrees/wt/apps/api/server.ts': "app.get('/health');\n",
      // Any other dot-directory is tooling, never a route source.
      '.config/server.ts': "app.get('/from-dotdir');\n",
    });

    // Found once, from the real tree — never from a dot-directory copy.
    expect(summarize(await scanRoutes(root))).toEqual([
      'express /health apps/api/server.ts:1 method=GET',
    ]);
  });
});

describe('scanRoutes: guardrails', () => {
  it('never opens a dotenv-style file', async () => {
    const root = await writeRepository(HOSTILE_REPOSITORY);
    const findings = await scanRoutes(root);

    // The recorder is only meaningful if it saw the files that are read.
    expect(openedFiles.some((path) => path.endsWith('urls.py'))).toBe(true);
    expect(
      openedFiles.filter((path) => /(?:^|\/)\.env|\.env$/.test(path)),
      'a dotenv-style file was opened',
    ).toEqual([]);
    expect(
      findings.filter((finding) => finding.value.includes('leaked')),
      'a finding came from a dotenv-style file',
    ).toEqual([]);
  });

  it('skips build output, dependencies and virtual environments', async () => {
    const root = await writeRepository(HOSTILE_REPOSITORY);

    expect(summarize(await scanRoutes(root))).toEqual([
      // Unparseable JavaScript still yields its route and never throws.
      'express /broken-but-found broken.ts:2 method=GET',
      'rails /reachable config/routes.rb:3 method=GET',
      'django /ok/ urls.py:1',
    ]);
  });

  it('never follows a symlink', async () => {
    const outside = await writeRepository({ 'config/routes.rb': "get '/outside'\n" });
    const root = await writeRepository({ 'server.js': "app.get('/inside');\n" });
    await symlink(outside, join(root, 'linked'), 'dir');

    expect(summarize(await scanRoutes(root))).toEqual(['express /inside server.js:1 method=GET']);
  });

  it('returns nothing for a missing root instead of throwing', async () => {
    await expect(scanRoutes(join(tmpdir(), 'uptimerobot-cli-absent-repository'))).resolves.toEqual(
      [],
    );
  });

  it('produces identical results across repeated scans', async () => {
    const root = await writeRepository(NEXT_APP_REPOSITORY);

    expect(await scanRoutes(root)).toEqual(await scanRoutes(root));
  });
});

describe('scanRoutes: work bounds', () => {
  it('stops after maxFiles, cutting the same tail off the same alphabetical walk', async () => {
    const root = await writeRepository(NEXT_APP_REPOSITORY);

    expect(summarize(await scanRoutes(root, { maxFiles: 3 }))).toEqual([
      'next-app /about app/(marketing)/(promo)/about/page.tsx:1 type=page',
      'next-app /api/health app/api/health/route.ts:3 method=GET,type=route',
      'next-app /api/health app/api/health/route.ts:7 method=POST,type=route',
    ]);
    expect(await scanRoutes(root, { maxFiles: 0 })).toEqual([]);
  });

  it('never reads a file larger than maxFileBytes', async () => {
    const root = await writeRepository(EXPRESS_REPOSITORY);
    await writeFile(join(root, 'huge.js'), `app.get('/huge');\n${'// padding\n'.repeat(20_000)}`);

    expect(await scanRoutes(root, { maxFileBytes: 64 })).toEqual([]);
    expect(openedFiles).toEqual([]);

    const findings = await scanRoutes(root);
    expect(findings.some((finding) => finding.value === '/huge')).toBe(true);
  });

  it('still reports path-derived routes when the file itself is too large to read', async () => {
    const root = await writeRepository(NEXT_APP_REPOSITORY);

    expect(summarize(await scanRoutes(root, { maxFileBytes: 1 }))).toEqual([
      'next-app /about app/(marketing)/(promo)/about/page.tsx:1 type=page',
      'next-app /api/health app/api/health/route.ts:1 type=route',
      'next-app /api/legacy app/api/legacy/route.js:1 type=route',
      'next-app /blog/[slug] app/blog/[slug]/page.tsx:1 type=page',
      'next-app /dashboard app/dashboard/@analytics/page.tsx:1 type=page',
      'next-app /docs/[...path] app/docs/[...path]/page.tsx:1 type=page',
      'next-app / app/page.tsx:1 type=page',
      'next-app /shop/[[...filters]] app/shop/[[...filters]]/page.tsx:1 type=page',
    ]);
  });
});
