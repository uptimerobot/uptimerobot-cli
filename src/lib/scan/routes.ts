/**
 * Detects HTTP route definitions declared in a repository, so that monitor
 * discovery starts from endpoints the project actually serves.
 *
 * The scan is pure and offline: it walks the working tree, pattern-matches
 * paths and file contents, and never imports, evaluates, requests, or spawns
 * anything. Dotenv-style files are never opened, so no secret value is ever in
 * hand. Nothing here throws — an unreadable, binary or malformed file is
 * skipped — so a hostile repository cannot crash the CLI. This is a library
 * only: it never prints and never raises a CliFailure; the command layer owns
 * both.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import type { ScanFinding } from './finding.js';

export type { ScanEvidence } from './finding.js';

/**
 * One route definition. `kind` is 'next-app' | 'next-pages' | 'django' |
 * 'rails' | 'express' | 'nestjs' | 'laravel' | 'astro' | 'nuxt' | 'sveltekit' |
 * 'pages-router', `value` is the route path as written or derived, e.g.
 * '/api/health' — always slash-prefixed, and never carrying a host — and
 * `detail` holds extras such as { method: 'GET' }.
 */
export type RouteFinding = ScanFinding;

/**
 * Whether a route path reads as a health/liveness/readiness endpoint — the
 * strongest kind of monitor target, and the one an agent should reach for
 * first. Matched on the final path segment, so `/api/health`, `/v1/healthz`,
 * `/-/health` and `/actuator/health` all count, while `/status-page` — a
 * different segment that merely starts the same way — does not.
 * Case-insensitive; a trailing slash is ignored.
 */
export function isHealthPath(path: string): boolean {
  const segments = path.toLowerCase().split('/').filter(Boolean);
  const last = segments.at(-1);
  if (last === undefined) return false;
  // `health_check`, `health-check` and `_health` are the same endpoint wearing
  // three conventions, so the separator is normalised away before the lookup
  // rather than spelled out three times in the set.
  return HEALTH_SEGMENTS.has(last.replaceAll('_', '-').replace(/^-+/, ''));
}

/** Final segments that name a health probe rather than a product surface. */
const HEALTH_SEGMENTS: ReadonlySet<string> = new Set([
  'alive',
  'health',
  'health-check',
  'healthcheck',
  'healthy',
  'healthz',
  'heartbeat',
  'live',
  'liveness',
  'livez',
  'ping',
  'ready',
  'readiness',
  'readyz',
  'status',
  'up',
]);

export interface ScanRoutesOptions {
  /** Bytes. Files larger than this are never read. Defaults to 512 KiB. */
  maxFileBytes?: number;
  /** Files an extractor could read before the walk stops. Defaults to 20000. */
  maxFiles?: number;
  /** Called once if either budget ran out, so the caller can say the list is partial. */
  onTruncated?: () => void;
}

/**
 * A whole-repository walk has to stay cheap enough to run inside `init`.
 *
 * Sized against a large real monorepo, where the whole tree fits inside this
 * budget: covering it costs about two seconds and finds ~40% more candidates
 * than the 5000 this started at, which truncated silently. Two seconds once,
 * during setup, is worth a scan that reaches the end of the repository.
 */
const DEFAULT_MAX_FILES = 20_000;
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;

/**
 * How many directory entries the walk may look at per candidate it is allowed
 * to keep. The file budget bounds the expensive half — opening and matching —
 * but on its own it would let a repository of a million images be traversed in
 * full, because none of them are ever charged for. This bounds the cheap half
 * too, generously enough that only an enormous tree reaches it.
 */
const ENTRIES_PER_CANDIDATE = 20;

interface WalkBudget {
  /** Candidate files the walk may still queue. */
  files: number;
  /** Directory entries the walk may still examine. */
  entries: number;
}

/**
 * Directories that never hold the routes a project serves. The walk also skips
 * every dot-directory (`.git`, `.next`, `.vercel`, `.claude/worktrees` …): those
 * are VCS, tooling, build caches and agent worktrees — no codebase declares
 * routes there, and a worktree copy would double-count every route besides.
 * Listed here are only the non-dotted exceptions: dependency and build output,
 * and the Jest test/mock suites that stand up throwaway apps.
 */
const SKIPPED_DIRECTORIES = new Set([
  '__mocks__',
  '__pycache__',
  '__tests__',
  'build',
  'dist',
  'node_modules',
  'vendor',
]);

const SCRIPT_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.mjs', '.mts', '.ts']);

/**
 * Every extension a `pages/` directory routes, and the kind it reports as.
 *
 * A static-site generator addresses `pages/` exactly as the Next.js pages
 * router does — `index` is its directory, `_`-prefixed files are private — so
 * the derivation is shared and only the extension differs. Next.js and the
 * generators live in one map rather than a set plus a map, so adding an
 * extension is one edit in one place. Markdown is deliberately generic, since
 * half a dozen generators route it.
 */
const PAGES_KIND_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ['.astro', 'astro'],
  ['.js', 'next-pages'],
  ['.jsx', 'next-pages'],
  ['.md', 'pages-router'],
  ['.mdx', 'pages-router'],
  ['.ts', 'next-pages'],
  ['.tsx', 'next-pages'],
  ['.vue', 'nuxt'],
]);

/**
 * SvelteKit routes by directory under `src/routes`, marking the routable file
 * `+page.*` — closer to the Next.js app router than to its pages router. The
 * optional `@layout` suffix resets which layout wraps the page; it never
 * changes the URL.
 */
const SVELTEKIT_FILENAME = /^\+page(?:@[\w-]*)?\.(?:js|svelte|ts)$/;

const NEXT_APP_FILENAME = /^(page|route)\.(?:js|jsx|ts|tsx)$/;
/** Declarations and colocated tests share the router extensions but never route. */
const NON_ROUTE_FILENAME = /\.(?:d|spec|stories|test)\.[jt]sx?$/;
/**
 * A colocated test, by filename. A test routinely stands up a throwaway app
 * (`app.post('/echo', …)`) to exercise a handler, and that is not an endpoint
 * the project serves. Covers `.spec`, `.test` and NestJS `.e2e-spec` across
 * every script extension, including the `.m`/`.c` variants. Suites kept in a
 * `__tests__/` directory are pruned by the walk instead.
 */
const TEST_FILENAME = /\.(?:e2e-spec|spec|test)\.[cm]?[jt]sx?$/;

const ROUTE_HANDLER_EXPORT =
  /export\s+(?:async\s+)?(?:function|const|let|var)\s+(DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT)\b/g;
/** The leading lookbehind keeps `os.path(` and `foo_path(` out of the results. */
const DJANGO_ROUTE = /(?<![\w.])(path|re_path)\s*\(\s*[bfruBFRU]{0,2}(['"])([^'"\n]*)\2/g;
const RAILS_VERB_ROUTE = /^[ \t]*(delete|get|patch|post|put)\s+(['"])([^'"\n]*)\2/gm;
const RAILS_RESOURCE_ROUTE = /^[ \t]*(resources?)\s+:([A-Za-z_]\w*)/gm;
/**
 * Any `<receiver>.<verb>('/...')`, which covers `app`, `router`, `server` and
 * `this.app` alike. Requiring a slash-prefixed literal is what keeps unrelated
 * `.get()` calls — Map, Headers, caches — out of the results.
 */
const EXPRESS_ROUTE =
  /\.\s*(all|delete|get|head|options|patch|post|put|use)\s*\(\s*(['"`])(\/[^'"`\n]*)\2/g;
/**
 * NestJS decorators. `@Controller('prefix')` opens a class and each method
 * decorator below composes against it. Both capture the raw argument list up to
 * the first `)` — parsed afterwards for a string, an object `path:` key, or an
 * array's first element — so a `)` inside the arguments only ends the capture
 * early, never crashes. The `@Get`/`@Post`/… list matches the HTTP method
 * decorators only; `@Header(` is left alone because a method needs `(` right
 * after its name.
 */
const NESTJS_CONTROLLER = /@Controller\s*\(([^)]*)\)/g;
const NESTJS_METHOD = /@(All|Delete|Get|Head|Options|Patch|Post|Put)\s*\(([^)]*)\)/g;
/**
 * Laravel route definitions: the static `Route::<verb>(...)` facade form and the
 * `$router-><verb>(...)` variable form that a `use ($router)` group closure
 * uses. Requiring `Route::` or a `$var->` receiver — never a bare `->` — keeps
 * closure-body calls such as `app('request')->get('psp')` out of the results.
 * `any` answers every method and is reported as ALL, like Express's `all`.
 */
const LARAVEL_ROUTE =
  /(?:Route::|\$\w+->)\s*(get|post|put|patch|delete|options|any)\s*\(\s*(['"])([^'"\n]*)\2/g;
/** `match(['get','post'], 'path', …)`: the verbs are an array, the path second. */
const LARAVEL_MATCH_ROUTE =
  /(?:Route::|\$\w+->)\s*match\s*\(\s*\[[^\]]*\]\s*,\s*(['"])([^'"\n]*)\1/g;
/** `resource`/`apiResource` stand for a whole REST family, reported once. */
const LARAVEL_RESOURCE_ROUTE =
  /(?:Route::|\$\w+->)\s*(apiResource|resource)\s*\(\s*(['"])([^'"\n]*)\2/g;

/**
 * Every route definition the scan can find under `repoRoot`, ordered by file,
 * then line, then value, so repeated scans of the same tree are identical.
 * Returns an empty list for a missing or unreadable root rather than throwing.
 */
export async function scanRoutes(
  repoRoot: string,
  options: ScanRoutesOptions = {},
): Promise<readonly RouteFinding[]> {
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxFiles = Math.max(0, options.maxFiles ?? DEFAULT_MAX_FILES);
  const budget: WalkBudget = { files: maxFiles, entries: maxFiles * ENTRIES_PER_CANDIDATE };

  const paths: string[] = [];
  await collectFiles(repoRoot, budget, paths);
  if (budget.files <= 0 || budget.entries <= 0) options.onTruncated?.();

  const findings: RouteFinding[] = [];
  for (const path of paths) {
    try {
      await collectFromFile(path, repoRelativePath(repoRoot, path), maxFileBytes, findings);
    } catch {
      // One malformed file never fails the scan.
    }
  }
  return sortedUnique(findings);
}

/**
 * Depth-first walk in alphabetical order, so the file budget always cuts the
 * same tail off the same tree. Symlinks are never followed: a link can point
 * anywhere, including outside the repository.
 */
async function collectFiles(directory: string, budget: WalkBudget, files: string[]): Promise<void> {
  if (budget.files <= 0 || budget.entries <= 0) return;

  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return; // A missing or unreadable directory is skipped, never fatal.
  }

  entries.sort((first, second) => compareStrings(first.name, second.name));
  for (const entry of entries) {
    if (budget.files <= 0 || budget.entries <= 0) return;
    budget.entries -= 1;
    if (entry.isSymbolicLink()) continue;

    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      // Dot-directories are tooling, VCS, build caches and agent worktrees,
      // never route sources; the named set covers the non-dotted exceptions.
      if (!entry.name.startsWith('.') && !SKIPPED_DIRECTORIES.has(entry.name)) {
        await collectFiles(path, budget, files);
      }
      continue;
    }
    if (!entry.isFile()) continue;

    // Dotenv-style files are excluded here, before anything can open them, so
    // the scan never holds a secret value in memory.
    if (isDotenvFile(entry.name)) continue;
    // Charged only for files an extractor could actually read. Charging every
    // file instead let an asset-heavy tree — images, locales, generated JSON —
    // exhaust the budget before the walk ever reached the source.
    if (!isRouteCandidateFile(entry.name)) continue;
    budget.files -= 1;
    files.push(path);
  }
}

/**
 * Whether any extractor could read this file, judged from its name alone.
 *
 * A deliberate superset of what {@link collectFromFile} goes on to accept: the
 * Next.js router checks need the file's directory, which the walk does not have
 * here, so every `.tsx` passes rather than only those under a `pages` root.
 * Being a superset is what keeps this a pure budgeting question — nothing is
 * excluded here that the dispatch would have kept.
 */
function isRouteCandidateFile(name: string): boolean {
  // A colocated test declares no real endpoint, and the dispatch drops it
  // outright, so it should not cost budget either.
  if (TEST_FILENAME.test(name)) return false;
  if (NEXT_APP_FILENAME.test(name) || SVELTEKIT_FILENAME.test(name)) return true;
  if (name === 'urls.py' || name === 'routes.rb') return true;

  const extension = extname(name);
  return (
    PAGES_KIND_BY_EXTENSION.has(extension) ||
    SCRIPT_EXTENSIONS.has(extension) ||
    extension === '.php'
  );
}

/** Runs every extractor that applies to one file, appending to `findings`. */
async function collectFromFile(
  path: string,
  file: string,
  maxFileBytes: number,
  findings: RouteFinding[],
): Promise<void> {
  const segments = file.split('/');
  const name = segments.at(-1) ?? '';
  const extension = extname(name);

  // A colocated test never declares a real endpoint, whichever framework it is
  // written against, so no extractor should see it. Applied before dispatch, it
  // covers Express too — the detector that would otherwise turn a test's
  // throwaway `app.post('/echo')` into a candidate.
  if (TEST_FILENAME.test(name)) return;

  const appRoot = NEXT_APP_FILENAME.test(name) ? routerRootIndex(segments, 'app') : -1;
  const routesPage = SVELTEKIT_FILENAME.test(name);
  const svelteRoot = routesPage ? routerRootIndex(segments, 'routes') : -1;
  const pagesKind = PAGES_KIND_BY_EXTENSION.get(extension);
  const pagesRoot =
    pagesKind !== undefined && !NON_ROUTE_FILENAME.test(name)
      ? routerRootIndex(segments, 'pages')
      : -1;
  const isDjango = name === 'urls.py';
  const isRails = name === 'routes.rb';
  const isScript = SCRIPT_EXTENSIONS.has(extension);
  const isPhp = extension === '.php';
  const isAppRouteHandler = appRoot !== -1 && name.startsWith('route.');

  // No early "does anything apply?" guard: a file nothing matches reads no text
  // below, runs no extractor, and returns at the `text === undefined` check all
  // the same. A guard here would only be a second registration list, silently
  // disabling any extractor someone forgot to add to it.
  //
  // Next.js routes are derived from the path alone, so an oversized page still
  // reports; only the extractors that need text depend on a successful read.
  const text =
    isDjango || isRails || isScript || isPhp || isAppRouteHandler
      ? await readTextFile(path, maxFileBytes)
      : undefined;
  const lineStarts = text === undefined ? [0] : lineStartOffsets(text);
  const lineAt = (index: number) => lineNumberAt(lineStarts, index);

  if (appRoot !== -1) {
    collectNextApp(segments, appRoot, file, isAppRouteHandler, text, lineAt, findings);
  }
  if (pagesRoot !== -1 && pagesKind !== undefined) {
    collectNextPages(segments, pagesRoot, file, pagesKind, findings);
  }
  if (svelteRoot !== -1) collectSvelteKit(segments, svelteRoot, file, findings);
  if (text === undefined) return;
  if (isDjango) collectDjango(text, file, lineAt, findings);
  if (isRails) collectRails(text, file, lineAt, findings);
  if (isScript) collectExpress(text, file, lineAt, findings);
  // A NestJS controller file is a script with an `@Controller(` decorator; the
  // cheap substring gate skips the regex work on the vast majority of scripts.
  // The `@Get` decorators it matches are never matched by `collectExpress`
  // (which needs a `.verb('/…')` call), so a controller file is not double-counted.
  if (isScript && text.includes('@Controller(')) collectNestjs(text, file, lineAt, findings);
  // Laravel routes live in `routes/*.php`; controllers, models and PHPUnit tests
  // (which call `$this->get(...)`) never call `Route::`, so this gate keeps
  // precision high and naturally excludes tests without a filename rule.
  if (isPhp && text.includes('Route::')) collectLaravel(text, file, lineAt, findings);
}

function collectNextApp(
  segments: readonly string[],
  rootIndex: number,
  file: string,
  isRouteHandler: boolean,
  text: string | undefined,
  lineAt: (index: number) => number,
  findings: RouteFinding[],
): void {
  const value = nextAppRoutePath(segments, rootIndex);
  if (value === undefined) return;

  if (!isRouteHandler) {
    findings.push({
      kind: 'next-app',
      value,
      evidence: { file, line: 1 },
      detail: { type: 'page' },
    });
    return;
  }

  const handlers = text === undefined ? [] : [...text.matchAll(ROUTE_HANDLER_EXPORT)];
  if (handlers.length === 0) {
    findings.push({
      kind: 'next-app',
      value,
      evidence: { file, line: 1 },
      detail: { type: 'route' },
    });
    return;
  }
  for (const handler of handlers) {
    findings.push({
      kind: 'next-app',
      value,
      evidence: { file, line: lineAt(handler.index) },
      detail: { method: handler[1] ?? '', type: 'route' },
    });
  }
}

function collectNextPages(
  segments: readonly string[],
  rootIndex: number,
  file: string,
  kind: string,
  findings: RouteFinding[],
): void {
  const value = nextPagesRoutePath(segments, rootIndex);
  if (value === undefined) return;
  findings.push({
    kind,
    value,
    evidence: { file, line: 1 },
    detail: { type: value === '/api' || value.startsWith('/api/') ? 'api' : 'page' },
  });
}

/**
 * A SvelteKit `+page.*`, whose URL is the directory chain below `src/routes`.
 * Route groups — `(marketing)` — organise files without appearing in the URL,
 * which is exactly the Next.js app-router rule, so that derivation is reused.
 */
function collectSvelteKit(
  segments: readonly string[],
  rootIndex: number,
  file: string,
  findings: RouteFinding[],
): void {
  const value = nextAppRoutePath(segments, rootIndex);
  if (value === undefined) return;
  findings.push({
    kind: 'sveltekit',
    value,
    evidence: { file, line: 1 },
    detail: { type: 'page' },
  });
}

function collectDjango(
  text: string,
  file: string,
  lineAt: (index: number) => number,
  findings: RouteFinding[],
): void {
  for (const match of text.matchAll(DJANGO_ROUTE)) {
    const literal = match[3] ?? '';
    const isRegex = match[1] === 're_path';
    findings.push({
      kind: 'django',
      value: normalizePath(isRegex ? stripRegexAnchors(literal) : literal),
      evidence: { file, line: lineAt(match.index) },
      ...(isRegex ? { detail: { pattern: 'regex' } } : {}),
    });
  }
}

function collectRails(
  text: string,
  file: string,
  lineAt: (index: number) => number,
  findings: RouteFinding[],
): void {
  for (const match of text.matchAll(RAILS_VERB_ROUTE)) {
    findings.push({
      kind: 'rails',
      value: normalizePath(match[3] ?? ''),
      evidence: { file, line: lineAt(match.index) },
      detail: { method: (match[1] ?? '').toUpperCase() },
    });
  }
  // A resource declaration stands for a whole RESTful family; the collection
  // path is reported once rather than expanded into seven guessed routes.
  for (const match of text.matchAll(RAILS_RESOURCE_ROUTE)) {
    findings.push({
      kind: 'rails',
      value: normalizePath(match[2] ?? ''),
      evidence: { file, line: lineAt(match.index) },
      detail: { resource: match[1] ?? '' },
    });
  }
}

function collectExpress(
  text: string,
  file: string,
  lineAt: (index: number) => number,
  findings: RouteFinding[],
): void {
  for (const match of text.matchAll(EXPRESS_ROUTE)) {
    const verb = match[1] ?? '';
    findings.push({
      kind: 'express',
      value: normalizePath(match[3] ?? ''),
      evidence: { file, line: lineAt(match.index) },
      // `use` mounts a prefix instead of serving a method, so it carries no one.
      detail: verb === 'use' ? { mount: 'true' } : { method: verb.toUpperCase() },
    });
  }
}

/**
 * NestJS controllers. Each method decorator composes against the nearest
 * preceding `@Controller`, so several controllers in one file each keep their
 * own prefix. The runtime global prefix — `app.setGlobalPrefix(...)` in
 * `main.ts`, a variable (`GLOBAL_PATH`) rather than a literal in api/, plus any
 * `enableVersioning(...)` — is deliberately NOT composed here: these values are
 * controller-relative, mirroring how `collectExpress` emits mount prefixes
 * without resolving them. The downstream agent prepends the global prefix.
 */
function collectNestjs(
  text: string,
  file: string,
  lineAt: (index: number) => number,
  findings: RouteFinding[],
): void {
  const controllers: { index: number; prefix: string }[] = [];
  for (const match of text.matchAll(NESTJS_CONTROLLER)) {
    controllers.push({ index: match.index, prefix: nestControllerPrefix(match[1] ?? '') });
  }
  if (controllers.length === 0) return;

  for (const match of text.matchAll(NESTJS_METHOD)) {
    // `matchAll` yields controllers in source order, so the last one before this
    // decorator is the class it belongs to.
    let controller: { index: number; prefix: string } | undefined;
    for (const candidate of controllers) {
      if (candidate.index < match.index) controller = candidate;
      else break;
    }
    if (controller === undefined) continue;

    // `@All` serves every method, so it is reported as ALL, like Express's `all`.
    const method = (match[1] ?? '').toUpperCase();
    findings.push({
      kind: 'nestjs',
      value: composeNestPath(controller.prefix, nestMethodPath(match[2] ?? '')),
      evidence: { file, line: lineAt(match.index) },
      detail: controller.prefix === '' ? { method } : { method, controller: controller.prefix },
    });
  }
}

/**
 * Laravel route declarations. The literal path in each call is captured as
 * written; `Route::prefix()->group(...)` / `Route::group(['prefix'=>...], ...)`
 * nesting is NOT composed — the same literal-capture approach Django and Rails
 * take — and the `routes/api.php` → `/api` prefix (a config convention in
 * `bootstrap/app.php` / the RouteServiceProvider) is NOT prepended. The
 * downstream agent composes both. Chained-builder forms such as
 * `Route::namespace('x')->get(...)` are neither of the two handled shapes and
 * are left for the agent as well.
 */
function collectLaravel(
  text: string,
  file: string,
  lineAt: (index: number) => number,
  findings: RouteFinding[],
): void {
  for (const match of text.matchAll(LARAVEL_ROUTE)) {
    const verb = (match[1] ?? '').toUpperCase();
    findings.push({
      kind: 'laravel',
      value: normalizePath(match[3] ?? ''),
      evidence: { file, line: lineAt(match.index) },
      detail: { method: verb === 'ANY' ? 'ALL' : verb },
    });
  }
  // `match([...], 'path')` answers several methods, so it is reported as ALL.
  for (const match of text.matchAll(LARAVEL_MATCH_ROUTE)) {
    findings.push({
      kind: 'laravel',
      value: normalizePath(match[2] ?? ''),
      evidence: { file, line: lineAt(match.index) },
      detail: { method: 'ALL' },
    });
  }
  // A resource declaration stands for a whole RESTful family; the base path is
  // reported once rather than expanded into seven guessed routes, as with Rails.
  for (const match of text.matchAll(LARAVEL_RESOURCE_ROUTE)) {
    findings.push({
      kind: 'laravel',
      value: normalizePath(match[3] ?? ''),
      evidence: { file, line: lineAt(match.index) },
      detail: { resource: match[1] ?? '' },
    });
  }
}

/** The `@Controller(...)` prefix: a string, an object `path:`, or `''` when empty. */
function nestControllerPrefix(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  if (trimmed.startsWith('{')) {
    const match = /\bpath\s*:\s*(['"])([^'"\n]*)\1/.exec(trimmed);
    return match?.[2] ?? '';
  }
  // A string prefix, or the first element of an array form `@Controller(['a','b'])`.
  return firstStringLiteral(trimmed);
}

/** A method decorator's optional path argument; empty for `@Get()`. */
function nestMethodPath(raw: string): string {
  return firstStringLiteral(raw);
}

/** The first string literal in a decorator argument, reaching past a leading `[`. */
function firstStringLiteral(raw: string): string {
  const match = /\[?\s*(['"])([^'"\n]*)\1/.exec(raw);
  return match?.[2] ?? '';
}

/**
 * Joins a controller prefix and a method path into one controller-relative
 * absolute path: a single leading slash, no doubled slashes, no trailing slash,
 * and `/` when the result would be empty. `@Get()` on `@Controller('x')` → `/x`.
 */
function composeNestPath(prefix: string, methodPath: string): string {
  const combined = `/${prefix}/${methodPath}`.replace(/\/{2,}/g, '/').replace(/\/$/, '');
  return combined === '' ? '/' : combined;
}

/**
 * Locates the segment that opens a Next.js router tree. A `<root>` at the
 * repository root or directly under `src` wins, which resolves `src/app`,
 * `apps/web/src/app` and `app/app/page.tsx` the way Next.js does; otherwise
 * the outermost match is used, which covers a bare `apps/web/app`.
 * Returns -1 when the file is not inside such a tree.
 */
function routerRootIndex(segments: readonly string[], root: 'app' | 'pages' | 'routes'): number {
  let outermost = -1;
  let anchored = -1;
  for (const [index, segment] of segments.slice(0, -1).entries()) {
    if (segment !== root) continue;
    if (outermost === -1) outermost = index;
    if (index === 0 || segments[index - 1] === 'src') anchored = index;
  }
  return anchored === -1 ? outermost : anchored;
}

/** Undefined when the file sits in a private folder and therefore never routes. */
function nextAppRoutePath(segments: readonly string[], rootIndex: number): string | undefined {
  const parts: string[] = [];
  for (const segment of segments.slice(rootIndex + 1, -1)) {
    if (segment.startsWith('_')) return undefined;
    // Route groups and parallel-route slots organise files without ever
    // appearing in the URL.
    if (segment.startsWith('@')) continue;
    if (segment.startsWith('(') && segment.endsWith(')')) continue;
    parts.push(segment);
  }
  return joinRoutePath(parts);
}

/** Undefined for `_app`, `_document`, `_error` and anything else underscored. */
function nextPagesRoutePath(segments: readonly string[], rootIndex: number): string | undefined {
  const directories = segments.slice(rootIndex + 1, -1);
  if (directories.some((segment) => segment.startsWith('_'))) return undefined;

  const name = basenameWithoutExtension(segments.at(-1) ?? '');
  if (name.startsWith('_')) return undefined;
  // `index` addresses the directory that holds it.
  return joinRoutePath(name === 'index' ? directories : [...directories, name]);
}

function basenameWithoutExtension(name: string): string {
  const extension = extname(name);
  return extension === '' ? name : name.slice(0, -extension.length);
}

function joinRoutePath(parts: readonly string[]): string {
  return parts.length === 0 ? '/' : `/${parts.join('/')}`;
}

/** Framework paths are often relative to their mount point; findings are not. */
function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function stripRegexAnchors(value: string): string {
  return value.replace(/^\^/, '').replace(/(?<!\\)\$$/, '');
}

function isDotenvFile(name: string): boolean {
  return name === '.env' || name === '.envrc' || name.startsWith('.env.') || name.endsWith('.env');
}

async function readTextFile(path: string, maxFileBytes: number): Promise<string | undefined> {
  try {
    const info = await stat(path);
    if (info.size > maxFileBytes) return undefined;
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

function repoRelativePath(repoRoot: string, path: string): string {
  return relative(repoRoot, path).split(sep).join('/');
}

function lineStartOffsets(text: string): number[] {
  const offsets = [0];
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
    offsets.push(index + 1);
  }
  return offsets;
}

function lineNumberAt(lineStarts: readonly number[], index: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((lineStarts[middle] ?? 0) <= index) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

/**
 * Collapses identical findings — the same route proved by the same line — then
 * orders by file, line and value, with kind and detail as final tiebreakers so
 * two findings on one line never swap places between runs.
 */
function sortedUnique(findings: readonly RouteFinding[]): RouteFinding[] {
  const unique = new Map<string, RouteFinding>();
  for (const finding of findings) {
    unique.set(
      [
        finding.evidence.file,
        finding.evidence.line,
        finding.value,
        finding.kind,
        detailKey(finding.detail),
      ].join(' '),
      finding,
    );
  }
  return [...unique.values()].sort(
    (first, second) =>
      compareStrings(first.evidence.file, second.evidence.file) ||
      first.evidence.line - second.evidence.line ||
      compareStrings(first.value, second.value) ||
      compareStrings(first.kind, second.kind) ||
      compareStrings(detailKey(first.detail), detailKey(second.detail)),
  );
}

function detailKey(detail: Readonly<Record<string, string>> | undefined): string {
  if (detail === undefined) return '';
  return Object.entries(detail)
    .sort(([first], [second]) => compareStrings(first, second))
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
}

/** Byte-order comparison; locale-aware sorting would not be reproducible. */
function compareStrings(first: string, second: string): number {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}
