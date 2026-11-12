# Onboarding wizard v2 — raise the monitor cap, detect auth gates, rank health endpoints

- **Date:** 2026-07-24
- **Status:** Approved design, ready for implementation planning
- **Branch:** `feature/scanner`

## Background

`uptimerobot init` (commit `75dd2b9`) scans a repository and writes two files at
the repo root:

- `uptimerobot-scan.md` — the deterministic, offline pre-scan produced by
  `formatSeedContext` in `src/lib/scan/index.ts`: accepted candidates, a
  "Skipped, and why" list, and scheduled-job (heartbeat) candidates.
- `uptimerobot-setup.md` — the embedded setup guide produced by
  `renderSetupGuide` in `src/lib/agent-setup/setup-guide.ts`. It drives a coding
  agent through **discover → propose → create → wire → report → verify**, all
  through the `uptimerobot` CLI.

Three parts of that flow change here. None of them touches the create/wire/report
machinery; they change _how many_ monitors the agent may propose, _what it checks_
about each proposed endpoint, and _how the scan ranks_ the endpoints most worth
monitoring.

## Goals

1. Replace the fixed **10-monitor** curation cap with a higher, overridable
   ceiling (**default 50**), without losing the curate-then-confirm discipline.
2. Make the agent **detect, framework by framework, whether a proposed endpoint
   sits behind rudimentary auth** — structurally, from the code, never by reading
   a secret value.
3. Make the deterministic scanner **recognize and rank health-looking endpoints**
   so they surface as the top monitor candidates.

## Non-goals (YAGNI)

- **No auto-generating health routes.** We surface health endpoints that already
  exist; we do not write new ones or emit code snippets for the user to add.
- **No secret scraping.** The "never read `.env` values" rule is unchanged. Auth
  detection is structural only.
- **No probing beyond what exists today.** The single allowed read-only `GET`
  (to catch a 401 on a user-confirmed-public URL) stays as-is; we add no new
  network behavior.
- **No code-enforced cap.** The ceiling stays an instruction to the agent in the
  guide, consistent with the current architecture — the deterministic scanner
  does not truncate.
- **No change to the scanner's accept/reject rules.** Auth detection is
  agent-side; health recognition only affects ranking/visibility, never whether a
  candidate is accepted.

---

## Change A — Curation cap: 10 → configurable, default 50

The "10" is not a code constant; it is three instruction lines in the embedded
guide:

- `setup-guide.ts:75-77` — "**Cap at 10 monitors per run**, heartbeats included. If
  more survive, propose the 10 that best prove the system works…"
- `setup-guide.ts:206` — "One message, one table, every candidate that survived —
  **capped at 10**."
- `setup-guide.ts:456-457` — the report's Skipped section: "anything over the cap
  of 10".

### Implementation

- `renderSetupGuide(invocation: CliInvocation, options?: { maxMonitors?: number })`
  — add an options object with `maxMonitors`, defaulting to **50**. Existing
  callers and tests that pass nothing keep working and get 50. Interpolate the
  number into all three locations above (no more hard-coded "10").
- `src/commands/init.ts` — add a `--max-monitors` flag
  (`Flags.integer`, `default: 50`, minimum 1) and pass it into
  `renderSetupGuide`. Document it in the command description alongside the other
  flags.

### Behavior

- **Curation is preserved.** The required inventory line (`setup-guide.ts:209-215`)
  and the propose-then-confirm table (Step 2) are unchanged in shape. The agent
  still leads with "propose the endpoints that best prove the system works."
- **The ceiling is a backstop, not a target.** A 3-route repo proposes ~3, not 50.
- **When more than the ceiling survive:** the agent shows the _full inventory_
  counts and lets the user trim — it never silently truncates. The over-ceiling
  remainder goes to the report's Skipped section (reason: "over the cap of N").
- **Unchanged:** plan-limit handling (`-28001` monitor-limit / `-28002`
  subscription-limit stay non-retryable, `setup-guide.ts:325`), and the
  propose-then-confirm gate.

---

## Change B — Framework-aware auth-gate detection (guide)

Today the guide detects auth gates for **NestJS only** (`setup-guide.ts:165-176`),
and its reachability note (`setup-guide.ts:151-156`) treats a gated endpoint as a
skip. Generalize this into a first-class discovery step that checks **every
proposed endpoint** for an auth gate, across the frameworks the agent may meet.

### The detection step

A new sub-section in Step 1 (Discover), with a compact per-framework signal table:

| Framework         | Auth signal to look for                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| NestJS            | `@UseGuards(...)` (class- or method-level), no `@Public()`                                                            |
| Express / Fastify | auth middleware on the route or a parent router (`router.use(requireAuth)`, `app.get('/x', authMiddleware, handler)`) |
| Django / DRF      | `@login_required`, `permission_classes`                                                                               |
| Rails             | `before_action :authenticate…`                                                                                        |
| Laravel           | `->middleware('auth')`, controller middleware                                                                         |
| FastAPI           | `Depends(get_current_user)` (or equivalent dependency)                                                                |
| Spring            | Security config / `@PreAuthorize`                                                                                     |

Plus the corroborating signals the guide already references:

- a `process.env.*` secret-gate in the handler itself (e.g.
  `req.query.token !== process.env.HEALTH_SECRET`), and
- the one allowed read-only 401 probe against a user-confirmed-public URL.

**Invariants:**

- Evidence is required: the `file:line` of the guard/middleware/gate.
- **The secret value is never read.** Detection is structural. The
  "never read `.env` values" rule (`setup-guide.ts:85`) and the report
  secret-hygiene rules (`setup-guide.ts:98-99`, `448-449`) are unchanged.

### Remedy once a gate is detected — **flag-and-prefer-public** (resolved decision)

- **Default:** the gate is **flagged in the proposal with its evidence**, and the
  agent **prefers a public alternative** — typically a health endpoint the scanner
  surfaced (Change C). If no public alternative exists, the gated endpoint becomes
  a skip with a clear reason ("gated: `@UseGuards` at `x.controller.ts:12`; no
  public health route found"), recorded in the report.
- **User-chosen configuration path (documented, not default):** if the user
  volunteers a credential in the conversation, the agent may configure the monitor
  to pass the gate using flags that **already exist** on the create commands:
  `--auth-type HTTP_BASIC|BEARER|DIGEST`, `--http-username` / `--http-password`,
  and `--custom-http-headers` (see `operations.ts:1826-1889`). The supplied secret
  is stored **only on the monitor** — never written to the repo, never to the
  report. The agent never sources this value itself.

### Not changing

- The deterministic scanner's accept/reject logic (`judge` in `index.ts`): auth
  detection stays agent-side because the scanner is shallow pattern-matching and
  cannot reliably resolve auth wiring (guards, middleware chains, global prefixes).

---

## Change C — Health-endpoint recognition & ranking (scanner)

Teach the deterministic scanner to recognize health-looking route paths and mark
them, so the scan document surfaces them first and the guide can point at them as
the top candidates to curate.

### Recognition

A small `isHealthPath(path: string): boolean` helper (route knowledge lives with
the routes scanner, `src/lib/scan/routes.ts`). Matching rule:

- Compare the path's **final segment**, case-insensitively, against a token set:
  `health`, `healthz`, `healthcheck`, `health-check`, `ready`, `readyz`,
  `readiness`, `live`, `livez`, `liveness`, `status`, `ping`, `heartbeat`,
  `up`, `alive`.
- Plus two multi-segment specials matched on the tail: `/-/health` (GitLab-style)
  and `/actuator/health` (Spring).
- Exact-segment match only, so marketing/product routes like `/status-page` do
  **not** match the `status` token.

This handles `/api/health`, `/v1/healthz`, `/internal/ready`, etc., because the
match is on the final segment.

### Representation

- Add a first-class, optional `health?: boolean` to `ScanCandidate` (in
  `index.ts`) — not buried in `detail`. Set it when building candidates from route
  findings (`source === 'routes'`, `target === 'path'`) using `isHealthPath`.
- Health recognition does **not** change whether a candidate is accepted; it only
  sets this marker.

### Rendering & guide

- `formatSeedContext` surfaces health candidates **first** within the accepted
  list, with a marker (e.g. `★ likely health endpoint`), and adds a one-line note
  that these are the strongest monitor candidates. (Exact formatting is a plan-level
  detail.)
- The guide's Step 1 (Discover) and Step 2 (Propose) reference the health-marked
  candidates as the top things to curate — reinforcing "find the one or two that
  prove the system works" (`setup-guide.ts:144-147`) with a concrete signal.

---

## Files touched

| File                                 | Change                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/agent-setup/setup-guide.ts` | cap text → interpolated `maxMonitors`; new framework-aware auth-detection step; reference health-marked candidates                  |
| `src/commands/init.ts`               | add `--max-monitors` flag (default 50); pass into `renderSetupGuide`                                                                |
| `src/lib/scan/routes.ts`             | `isHealthPath` recognizer + export                                                                                                  |
| `src/lib/scan/index.ts`              | `health?: boolean` on `ScanCandidate`; set it when building route candidates; surface/rank health candidates in `formatSeedContext` |
| `test/setup-guide.test.ts`           | cap default + `maxMonitors` override; auth-step presence per framework                                                              |
| `test/scan-routes.test.ts`           | `isHealthPath` true/false cases incl. `/status-page` negative, `/-/health` + `/actuator/health` specials                            |
| `test/scan-index.test.ts`            | health marker set on health route candidates; ordering/marker in rendered doc                                                       |
| `test/init.test.ts`                  | `--max-monitors` flag parsed and threaded                                                                                           |
| `CHANGELOG.md`                       | note the three changes (optional, follow existing style)                                                                            |

## Testing approach

The repo builds then runs vitest (`pnpm test` = `pnpm build && vitest run`). Each
change ships with the test updates above. Guide-text assertions should check for
the _interpolated value_ and the presence of each framework's auth signal, not
exact prose, so wording tweaks don't break tests unnecessarily.

## Decisions resolved during brainstorming

- **Cap:** keep curation, raise the ceiling (option B). Default 50, overridable via
  `--max-monitors`. Not unbounded.
- **Auth:** framework-aware **static** detection by the agent (not the scanner),
  evidence-based, never reading the secret. Scope is _rudimentary_ auth (Basic,
  Bearer, shared-secret header, query token / guard / middleware), not full
  OAuth/session-login flows.
- **Auth remedy:** **flag-and-prefer-public** by default; monitor auth-header
  configuration only on a user-supplied secret, stored on the monitor alone.
- **Health endpoints:** surface & rank **existing** ones in the scanner (option 1).
  No auto-generation.
