# Onboarding wizard v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the monitor-proposal cap from a fixed 10 to a configurable default of 50, add framework-aware auth-gate detection to the setup guide, and make the scanner recognise and rank health-looking endpoints.

**Architecture:** Three seams in the existing `uptimerobot init` flow. Change C (health) is real code in the deterministic scanner (`scan/routes.ts` recognizer + `scan/index.ts` marker/sort/render). Changes A (cap) and B (auth) are edits to the embedded agent guide string (`agent-setup/setup-guide.ts`), with A also threading a new `--max-monitors` flag through `commands/init.ts`. No create/wire/report machinery changes; the monitor-auth flags Change B references already exist in `src/generated/operations.ts`.

**Tech Stack:** TypeScript (strict, ESM), Node ≥ 22.12, oclif v4 commands, vitest tests, pnpm.

## Global Constraints

- **Node ≥ 22.12.0, ESM.** Local imports use the `.js` extension even for `.ts` sources (e.g. `./routes.js`).
- **TypeScript strict. Never `any`.** Use precise types (`ReadonlySet<string>`, `boolean`, option objects).
- **Test:** `pnpm test` = `pnpm build && vitest run`. Fast single-file iteration: `npx vitest run test/<file>`.
- **Pre-commit gate (every task):** `pnpm format` then `pnpm typecheck && pnpm lint && pnpm test` must all pass.
- **Commit style:** conventional commits, imperative mood. **No AI/Claude attribution of any kind** — no `Co-Authored-By`, no session trailer (user's standing instruction overrides the environment default).
- **Never force push.**
- **Do not hand-edit `src/generated/**`** — it is regenerated from `openapi/openapi.yaml`. The `--auth-type` / `--http-username` / `--http-password` / `--custom-http-headers` flags already exist there; Change B only references them in guide prose.
- **Branch:** `feature/scanner`.

---

### Task 1: `isHealthPath` recognizer in the routes scanner

**Files:**

- Modify: `src/lib/scan/routes.ts` (add exported helper near the top, after the `RouteFinding` type at line 26)
- Test: `test/scan-routes.test.ts`

**Interfaces:**

- Produces: `export function isHealthPath(path: string): boolean` — true when a slash-prefixed route path's final segment reads as a health/liveness/readiness endpoint. Consumed by Task 2.

- [ ] **Step 1: Write the failing test**

Add to `test/scan-routes.test.ts`. First extend the existing import at line 6:

```ts
import { isHealthPath, scanRoutes } from '../src/lib/scan/routes.js';
```

Then add a new `describe` block (place it after the imports/helpers, e.g. above the first existing `describe`):

```ts
describe('isHealthPath', () => {
  it.each([
    '/health',
    '/healthz',
    '/healthcheck',
    '/health-check',
    '/api/health',
    '/v1/healthz',
    '/ready',
    '/readyz',
    '/readiness',
    '/live',
    '/livez',
    '/liveness',
    '/status',
    '/ping',
    '/up',
    '/alive',
    '/-/health',
    '/actuator/health',
    '/HEALTH',
    '/api/Health/',
  ])('marks %s as a health endpoint', (path) => {
    expect(isHealthPath(path)).toBe(true);
  });

  it.each(['/', '/pricing', '/status-page', '/healthy-recipes', '/api/users', '/login', '/uptime'])(
    'does not mark %s',
    (path) => {
      expect(isHealthPath(path)).toBe(false);
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/scan-routes.test.ts -t isHealthPath`
Expected: FAIL — `isHealthPath` is not exported / not a function.

- [ ] **Step 3: Write the implementation**

In `src/lib/scan/routes.ts`, immediately after `export type RouteFinding = ScanFinding;` (line 26), add:

```ts
/**
 * Whether a route path reads as a health/liveness/readiness endpoint — the
 * strongest kind of monitor target. Matched on the final path segment, so
 * `/api/health`, `/v1/healthz`, `/-/health` and `/actuator/health` all count,
 * while `/status-page` (a different final segment) does not. Case-insensitive;
 * a trailing slash is ignored.
 */
export function isHealthPath(path: string): boolean {
  const segments = path.toLowerCase().split('/').filter(Boolean);
  const last = segments.at(-1);
  return last !== undefined && HEALTH_SEGMENTS.has(last);
}

const HEALTH_SEGMENTS: ReadonlySet<string> = new Set([
  'health',
  'healthz',
  'healthcheck',
  'health-check',
  'ready',
  'readyz',
  'readiness',
  'live',
  'livez',
  'liveness',
  'status',
  'ping',
  'heartbeat',
  'up',
  'alive',
]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/scan-routes.test.ts -t isHealthPath`
Expected: PASS (both `it.each` blocks green).

- [ ] **Step 5: Gate and commit**

Run: `pnpm format && pnpm typecheck && pnpm lint && npx vitest run test/scan-routes.test.ts`
Expected: all pass.

```bash
git add src/lib/scan/routes.ts test/scan-routes.test.ts
git commit -m "feat(scan): recognize health-looking route paths"
```

---

### Task 2: Health marker, ranking, and rendering in the aggregator

**Files:**

- Modify: `src/lib/scan/index.ts` (import at line 31; `ScanCandidate` interface at lines 90-103; accepted push at line 225; `compareAccepted` at lines 798-805; `formatSeedContext` at line 852; `candidateLine` at lines 890-895)
- Test: `test/scan-index.test.ts`

**Interfaces:**

- Consumes: `isHealthPath` from Task 1.
- Produces: `ScanCandidate.health?: boolean` — set to `true` on accepted route candidates whose path is a health endpoint; health candidates sort first within their `path` group and render with a `★ ` marker.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `test/scan-index.test.ts` (the `seed`, `route`, and `formatSeedContext` helpers already exist in that file):

```ts
describe('health endpoint ranking', () => {
  it('marks a health route and sorts it ahead of other paths', () => {
    const context = seed({
      routes: [route('/pricing'), route('/api/health'), route('/docs')],
    });
    const paths = context.accepted.filter((candidate) => candidate.target === 'path');
    expect(paths[0]).toMatchObject({ value: '/api/health', health: true });
    expect(paths.slice(1).every((candidate) => candidate.health === undefined)).toBe(true);
  });

  it('leaves a non-health route unmarked', () => {
    const context = seed({ routes: [route('/pricing')] });
    expect(context.accepted[0]?.health).toBeUndefined();
  });

  it('renders the health marker and its legend', () => {
    const rendered = formatSeedContext(seed({ routes: [route('/api/health')] }));
    expect(rendered).toContain('★ `/api/health` (express)');
    expect(rendered).toContain('★ marks a likely health endpoint');
  });

  it('adds no legend when nothing is a health endpoint', () => {
    const rendered = formatSeedContext(seed({ routes: [route('/pricing')] }));
    expect(rendered).not.toContain('★ marks a likely health endpoint');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/scan-index.test.ts -t "health endpoint ranking"`
Expected: FAIL — `health` is undefined and no `★` in output.

- [ ] **Step 3: Add the `health` field and import**

In `src/lib/scan/index.ts`, change the routes import at line 31 to include `isHealthPath` (alphabetical order):

```ts
import { type ScanRoutesOptions, isHealthPath, scanRoutes } from './routes.js';
```

In the `ScanCandidate` interface, after the `detail?` member (line 102), add:

```ts
  /** Set when the path reads as a health/liveness/readiness endpoint. */
  health?: boolean;
```

- [ ] **Step 4: Set the marker when building accepted candidates**

In `buildSeedContext`, replace the accept/reject split (line 225-226):

```ts
if (verdict.rejection === undefined) accepted.push(candidate);
else rejected.push({ ...candidate, ...verdict.rejection });
```

with:

```ts
if (verdict.rejection === undefined) {
  accepted.push(
    source === 'routes' && isHealthPath(finding.value) ? { ...candidate, health: true } : candidate,
  );
} else rejected.push({ ...candidate, ...verdict.rejection });
```

- [ ] **Step 5: Sort health candidates first within their group**

Replace `compareAccepted` (lines 798-805) with:

```ts
function compareAccepted(left: ScanCandidate, right: ScanCandidate): number {
  return (
    TARGET_ORDER[left.target] - TARGET_ORDER[right.target] ||
    healthRank(left) - healthRank(right) ||
    compare(left.value, right.value) ||
    compare(left.kind, right.kind) ||
    compareEvidence(left.evidence, right.evidence)
  );
}

/** Health endpoints lead their target group: the strongest thing to monitor. */
function healthRank(candidate: ScanCandidate): number {
  return candidate.health === true ? 0 : 1;
}
```

(This is safe for `compareRejected`, which calls `compareAccepted`: rejected candidates never carry `health`, so `healthRank` is 1 for both sides and contributes 0.)

- [ ] **Step 6: Render the marker and the legend**

In `candidateLine` (lines 890-895), add the marker prefix:

```ts
function candidateLine(candidate: ScanCandidate): string {
  const alsoAt = (candidate.alsoAt ?? []).map((evidence) => citation(evidence)).join(', ');
  const marker = candidate.health === true ? '★ ' : '';
  return `${marker}\`${candidate.value}\` (${candidate.kind}) — ${citation(candidate.evidence)}${
    alsoAt === '' ? '' : `, also ${alsoAt}`
  }${detailSuffix(candidate.detail)}`;
}
```

In `formatSeedContext`, right after `lines.push('', '## Accepted candidates');` (line 852), add the legend:

```ts
lines.push('', '## Accepted candidates');
if (context.accepted.some((candidate) => candidate.health === true)) {
  lines.push('', '> ★ marks a likely health endpoint — usually the strongest thing to monitor.');
}
```

(`candidateLine` is shared with the rejected list, but rejected candidates never carry `health`, so the marker only appears among accepted candidates.)

- [ ] **Step 7: Run the new tests, then the whole scan suite**

Run: `npx vitest run test/scan-index.test.ts`
Expected: the new block passes AND every pre-existing test stays green (the health-first sort only reorders within the `path` group, and existing assertions use `.sort()`, `objectContaining`, `toContainEqual`, or substring `toContain`).

Also run the sibling command test that renders the document:
Run: `npx vitest run test/scan-command.test.ts`
Expected: PASS (its one ordered assertion has a single `path` candidate, so ordering is unchanged).

- [ ] **Step 8: Gate and commit**

Run: `pnpm format && pnpm typecheck && pnpm lint && pnpm test`
Expected: full suite green.

```bash
git add src/lib/scan/index.ts test/scan-index.test.ts
git commit -m "feat(scan): rank and mark health endpoints in the seed context"
```

---

### Task 3: Configurable monitor cap (`--max-monitors`, default 50)

**Files:**

- Modify: `src/lib/agent-setup/setup-guide.ts` (signature at line 39; cap text at lines 75-77, 206, 457)
- Modify: `src/commands/init.ts` (flags at lines 146-171; call site at line 254; `writeSetupGuide` at line 470; `renderSetupGuideFile` at line 388)
- Test: `test/setup-guide.test.ts`, `test/init.test.ts`

**Interfaces:**

- Produces: `renderSetupGuide(invocation: CliInvocation, options?: { maxMonitors?: number }): string` — `maxMonitors` defaults to 50 and is interpolated into all three cap mentions. Consumed by Task 4 (same file) and `init.ts`.

- [ ] **Step 1: Write the failing guide tests**

In `test/setup-guide.test.ts`, change the existing cap assertion at line 46 from:

```ts
    ['the cap-of-10 rule', 'Cap at 10 monitors per run'],
```

to:

```ts
    ['the default cap rule', 'Cap at 50 monitors per run'],
```

Then add two focused tests inside the `describe('renderSetupGuide', …)` block:

```ts
it('defaults the monitor cap to 50', () => {
  expect(renderSetupGuide(ON_PATH)).toContain('Cap at 50 monitors per run');
});

it('interpolates a custom --max-monitors cap everywhere it appears', () => {
  const guide = renderSetupGuide(ON_PATH, { maxMonitors: 3 });
  expect(guide).toContain('Cap at 3 monitors per run');
  expect(guide).toContain('capped at 3');
  expect(guide).toContain('over the cap of 3');
  expect(guide).not.toContain('Cap at 50 monitors per run');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/setup-guide.test.ts`
Expected: FAIL — guide still says "10", and the two-arg call is not honoured.

- [ ] **Step 3: Make `renderSetupGuide` take a cap**

In `src/lib/agent-setup/setup-guide.ts`, change the signature (line 39) and add the local:

```ts
export function renderSetupGuide(
  invocation: CliInvocation,
  options: { maxMonitors?: number } = {},
): string {
  const maxMonitors = options.maxMonitors ?? 50;
  /** Templates a bare subcommand into the resolved invocation. */
  const cmd = (subcommand: string): string => formatInvocation(invocation, subcommand);
```

Replace the guardrail cap lines (75-77):

```ts
    `- **Cap at ${maxMonitors} monitors per run**, heartbeats included. If more survive, propose the ${maxMonitors}`,
    '  that best prove the system works and hand the rest to the report as skipped for the',
    '  cap. Never silently truncate.',
```

Replace the propose-step line (206):

```ts
    `One message, one table, every candidate that survived — **capped at ${maxMonitors}**. Every row`,
```

Replace the report skipped-line (457):

```ts
    `  verbatim), duplicates dropped after normalization, anything over the cap of ${maxMonitors}, and`,
```

- [ ] **Step 4: Run the guide tests**

Run: `npx vitest run test/setup-guide.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing init wiring test**

In `test/init.test.ts`, update the existing assertion at line 365 from `'Cap at 10 monitors per run'` to `'Cap at 50 monitors per run'`. Then add a test mirroring the existing "--no-agent writes the guide" test (around line 353):

```ts
it('threads --max-monitors into the setup guide cap', async () => {
  await Init.run(['--no-agent', '--max-monitors', '3', '--json'], { root: projectRoot });
  const content = await readFile(join(repository, SETUP_GUIDE_FILE), 'utf8');
  expect(content).toContain('Cap at 3 monitors per run');
  expect(content).not.toContain('Cap at 50 monitors per run');
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run test/init.test.ts -t "max-monitors"`
Expected: FAIL — `Nonexistent flag: --max-monitors`.

- [ ] **Step 7: Add the flag and thread it through init**

In `src/commands/init.ts`, add to the `flags` object (after the `json` flag at line 153):

```ts
    'max-monitors': Flags.integer({
      description: 'Cap the number of monitors the setup guide proposes in one run',
      default: 50,
      min: 1,
    }),
```

At the call site (line 254), pass the flag:

```ts
const setupGuide = await this.writeSetupGuide(root, invocation, flags['max-monitors']);
```

Change `writeSetupGuide` (line 470) to accept and forward the cap:

```ts
  private writeSetupGuide(
    root: string,
    invocation: CliInvocation,
    maxMonitors: number,
  ): Promise<MarkedFileOutput> {
    return this.writeMarkedFile({
      beginPrefix: SETUP_BEGIN_PREFIX,
      existsCode: 'SETUP_GUIDE_EXISTS',
      path: join(root, SETUP_GUIDE_FILE_NAME),
      rendered: this.renderSetupGuideFile(invocation, maxMonitors),
      writeCode: 'SETUP_GUIDE_WRITE_FAILED',
    });
  }
```

Change `renderSetupGuideFile` (line 388) to accept the cap and pass it into `renderSetupGuide`:

```ts
  private renderSetupGuideFile(invocation: CliInvocation, maxMonitors: number): string {
    return [
      `${SETUP_BEGIN_PREFIX} version=${this.config.pjson.version} -->`,
      '',
      `Generated by \`${formatInvocation(invocation, 'init')}\`; rerun it to regenerate, or remove`,
      `this file with \`${formatInvocation(invocation, 'init --uninstall')}\`. Edits are overwritten.`,
      '',
      renderSetupGuide(invocation, { maxMonitors }).trimEnd(),
      '',
      SETUP_END_MARKER,
      '',
    ].join('\n');
  }
```

(If `Flags.integer` rejects the `min` option under this oclif version, drop `min` and rely on the default; a `--max-monitors 0` is a user choice, not a crash. Verify with `pnpm typecheck`.)

- [ ] **Step 8: Run the init tests**

Run: `npx vitest run test/init.test.ts`
Expected: PASS (the updated 50-assertion and the new threading test).

- [ ] **Step 9: Gate and commit**

Run: `pnpm format && pnpm typecheck && pnpm lint && pnpm test`
Expected: full suite green.

```bash
git add src/lib/agent-setup/setup-guide.ts src/commands/init.ts test/setup-guide.test.ts test/init.test.ts
git commit -m "feat(init): make the monitor cap configurable, default 50"
```

---

### Task 4: Framework-aware auth-gate detection in the guide

**Files:**

- Modify: `src/lib/agent-setup/setup-guide.ts` (insert a subsection in Step 1 — Discover, after the "deeper than the scan" bullet list that ends at line 163, before the "NestJS resolution checklist" at line 165)
- Test: `test/setup-guide.test.ts`

**Interfaces:**

- Consumes: `renderSetupGuide` from Task 3 (same file). No new exported symbols.

- [ ] **Step 1: Write the failing tests**

Add to the `it.each([...])` guardrail table in `test/setup-guide.test.ts` (the block that ends at line 48-50):

```ts
    ['the auth-gate check heading', 'Auth-gate check'],
    ['the never-read-a-secret rule for detection', 'never read a secret value'],
    ['the Express/Fastify auth-middleware signal', 'auth middleware on the route'],
    ['the Django/DRF signal', 'permission_classes'],
    ['the Rails signal', 'before_action :authenticate'],
    ['the Laravel signal', "->middleware('auth')"],
    ['the FastAPI signal', 'Depends('],
    ['the Spring signal', '@PreAuthorize'],
    ['the prefer-a-public-route remedy', 'Prefer a public alternative'],
    ['the user-supplied-credential path via existing flags', '--auth-type HTTP_BASIC'],
    ['the custom-header remedy naming the header form', 'X-Health-Token'],
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/setup-guide.test.ts`
Expected: FAIL — none of the new substrings are present yet.

- [ ] **Step 3: Insert the auth-gate subsection**

In `src/lib/agent-setup/setup-guide.ts`, after the "Shell-installed cron jobs." bullet block that ends at line 163 (the blank `''` line before `'**NestJS resolution checklist.**'` at line 165), insert:

```ts
    '',
    '**Auth-gate check — run it on every endpoint before you propose it.** An endpoint that',
    'answers `401`/`403` to an anonymous checker becomes a monitor that alerts forever, so',
    'read the code for the signal its framework uses to require auth. You are reading',
    '*structure*, not secrets — **never read a secret value**; cite the gate as `file:line`:',
    '',
    '- **NestJS** — a `@UseGuards(...)` on the controller class or method with no `@Public()`',
    '  override (the NestJS checklist below covers this in full).',
    "- **Express / Fastify** — auth middleware on the route or a parent router: `router.use(",
    "  requireAuth)`, `app.get('/x', authMiddleware, handler)`.",
    '- **Django / DRF** — a `@login_required`, or a `permission_classes` that is not `AllowAny`.',
    '- **Rails** — a `before_action :authenticate…` on the controller (watch for `skip_before_action`).',
    "- **Laravel** — `->middleware('auth')` on the route, or auth middleware on the controller.",
    '- **FastAPI** — a `Depends(...)` that resolves the current user / authentication.',
    '- **Spring** — a Spring Security config or a `@PreAuthorize` on the handler.',
    '',
    'Corroborate with the two signals you already have: a `process.env.*` secret-gate in the',
    'handler (`req.query.token !== process.env.HEALTH_SECRET` and the like), and the one',
    'read-only 401 probe allowed above against a URL the user has confirmed public.',
    '',
    'Once you find a gate — **prefer a public route; never quietly unlock one:**',
    '',
    '1. **Prefer a public alternative.** A ★-marked health endpoint from the scan, or any',
    '   ungated route, is the better target — propose that instead.',
    '2. **If the user wants the gated endpoint monitored, they supply the credential — you',
    '   never read it.** Set it on the monitor with flags that already exist: `--auth-type',
    '   HTTP_BASIC|BEARER|DIGEST` with `--http-username`/`--http-password`, or',
    '   `--custom-http-headers \'{"X-Health-Token": "<value the user gave you>"}\'`. The secret',
    '   lives on the monitor and nowhere else — never in the repo, never in the report.',
    '3. **Otherwise it is a skip**, recorded with its reason: "gated (`file:line`); no public route".',
    '',
```

- [ ] **Step 4: Run the guide tests**

Run: `npx vitest run test/setup-guide.test.ts`
Expected: PASS — new substrings present; the existing NestJS-checklist test (line 87-93) still green because `@UseGuards` / `setGlobalPrefix` / `RouterModule.register(` are untouched.

- [ ] **Step 5: Gate and commit**

Run: `pnpm format && pnpm typecheck && pnpm lint && pnpm test`
Expected: full suite green.

```bash
git add src/lib/agent-setup/setup-guide.ts test/setup-guide.test.ts
git commit -m "feat(init): add framework-aware auth-gate detection to the setup guide"
```

---

## Self-Review

**Spec coverage:**

- Change A (cap 10→50, `--max-monitors`, curation/confirm preserved, no silent truncation) → Task 3. ✅
- Change B (framework-aware structural auth detection, never read secret, flag-and-prefer-public remedy, existing auth flags) → Task 4. ✅
- Change C (recognize health paths, first-class `health` marker, surface first) → Tasks 1 + 2. ✅
- Non-goals (no auto-generated routes, no secret scraping, no new probing, no code-enforced cap, no accept/reject change) → respected: Task 2 only marks/sorts/renders; Task 4 is prose; Task 3 changes guide text + a flag. ✅

**Placeholder scan:** No TBD/TODO; every code and test step carries complete content. ✅

**Type consistency:** `isHealthPath(path: string): boolean` (Task 1) is imported and called identically in Task 2. `ScanCandidate.health?: boolean` is defined in Task 2 Step 3 and read in Steps 4-6 and in tests. `renderSetupGuide(invocation, { maxMonitors })` (Task 3) is called with that exact shape from `renderSetupGuideFile`. `writeSetupGuide`/`renderSetupGuideFile` gain a `maxMonitors: number` parameter consistently. ✅

**Regression checks baked in:** Task 2 Step 7 and Task 3 Steps 1/5 update the two existing assertions that hard-code "10" and confirm the health sort leaves order-tolerant assertions green.
