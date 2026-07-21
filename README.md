# UptimeRobot CLI

The official imperative command-line interface for UptimeRobot API v3. It is built with oclif, uses the published OpenAPI contract as its command source, and is intended for terminals, CI jobs, cron tasks, and coding agents.

This release implements Pillar 1 of the CLI PRD. OAuth, agent-skill distribution, and codebase scanning are intentionally outside this release. The CLI includes local request-schema discovery and dry-run compilation from its packaged OpenAPI snapshot; those features do not contact the API or replace server-side validation.

## Requirements

- Node.js 22.12 or newer. CI verifies the maintained Node 22 and Node 24 LTS lines.
- pnpm 10.26.0 for development.
- A UptimeRobot API key.

## Install and run

```sh
pnpm install
pnpm build
pnpm exec uptimerobot --help
```

For a published package:

```sh
pnpm add --global @uptimerobot/cli
uptimerobot --help
```

## Authentication

Persist an API key in the operating system's secure credential store:

```sh
uptimerobot auth login --api-key 'your-api-key'
uptimerobot auth status
```

`auth login` validates the key against API v3 before saving it. The `--api-key` value can be visible in shell history and process listings, so prefer an environment variable when that matters:

```sh
UPTIMEROBOT_API_KEY='your-api-key' uptimerobot auth login
```

Commands resolve credentials in this order: `--api-key`, `UPTIMEROBOT_API_KEY`, then the stored key. CI, containers, and other headless environments should normally use the environment variable without persisting it:

```sh
export UPTIMEROBOT_API_KEY='your-api-key'
uptimerobot monitors list
```

Stored credentials use macOS Keychain, Windows Credential Manager, or the available Linux keyring through `@napi-rs/keyring`. Minimal/headless Linux may fall back to an in-memory kernel keyring whose contents do not survive reboot. If no backend can save the key, the CLI fails clearly and never silently writes it to plaintext. See [`docs/auth-storage-research.md`](docs/auth-storage-research.md) for the platform comparison with Stripe and Sentry.

Remove the stored credential with `uptimerobot auth logout`. An exported `UPTIMEROBOT_API_KEY` remains active because a child process cannot unset its parent shell environment.

`uptimerobot auth whoami` is an alias for `uptimerobot auth status`. To retrieve the authenticated API user instead, use `uptimerobot user me` or its alias, `uptimerobot user get`.

## Commands

The checked-in OpenAPI snapshot currently expands 59 API operations into 67 commands covering:

- monitors, bulk monitor operations, and uptime/response-time statistics;
- incidents, activity logs, sent alerts, and comments;
- public status pages and announcements;
- maintenance windows and monitor groups;
- alert contacts and integrations;
- tags and authenticated-user information.

Use nested help to see flags derived from the API contract:

```sh
uptimerobot monitors --help
uptimerobot monitors list --help
uptimerobot incidents comments create --help
```

Examples:

```sh
uptimerobot monitors list --status down
uptimerobot monitors get 797054213 --json
uptimerobot monitors create http \
  --name checkout-api \
  --url https://checkout.example.com \
  --interval 60 \
  --timeout 30 \
  --method GET \
  --check-ssl \
  --follow-redirects
uptimerobot monitors delete 797054213 --confirm
```

Monitor creation is generated from the request body's OpenAPI discriminator. Each monitor type has its own command and variant-specific help:

```sh
uptimerobot monitors create --help
uptimerobot monitors create http --help
uptimerobot monitors create keyword --help
uptimerobot monitors create heartbeat --help
```

The current contract generates `http`, `keyword`, `ping`, `port`, `heartbeat`, `dns`, `api`, `udp`, and `visual-comparison`. The lowercase command selects and injects the canonical API `type`; users do not pass `--type`. Adding or removing a discriminator mapping adds or removes the corresponding command on the next OpenAPI regeneration. Each type's help includes only its applicable flags and type-matched request examples derived from the packaged OpenAPI snapshot.

Simple fields have typed flags, structured fields accept JSON, and nested object fields also receive path-based flags such as `--config-ip-version`. Ordinary JSON object bodies are generated the same way, so monitor updates expose typed flags too:

```sh
uptimerobot monitors update --help
uptimerobot monitors update 797054213 --interval 120 --check-ssl
```

Defaults displayed in help describe the API contract; they are not silently sent when a flag is omitted. This preserves the API's omission and PATCH semantics. The one deliberate CLI safety default is Keyword monitor creation: an omitted method is compiled as `GET`, and an explicit `HEAD` is rejected locally because a Keyword monitor needs a response body. `HEAD` remains available for HTTP monitors.

Commands with request bodies accept any API v3 payload in three ways:

```sh
# Inline JSON
uptimerobot monitors create http --body '{"friendlyName":"api","url":"https://example.com","interval":60,"timeout":30}'

# JSON file
uptimerobot monitors create http --body @monitor.json

# Composable dotted assignments; JSON literals are typed automatically
uptimerobot monitors update 797054213 --set interval=60 --set customSettings.region='"EU"'
```

Typed monitor-create flags, `--body`, and repeatable `--set` can be combined. Named flags override the base body, `--set` applies afterward, and the selected discriminator is enforced last. A conflicting `type` is rejected locally.

Repeat complex array flags with one JSON object per occurrence. Help prints the item shape, and invalid values report an indexed request path. Assigned alert contacts also accept a bare numeric ID as a convenience:

```sh
uptimerobot monitors create http \
  --assigned-alert-contacts 7448212 \
  --assigned-alert-contacts '{"alertContactId":42,"threshold":5,"recurrence":30}' \
  --body @monitor.json
```

A bare ID compiles to an object with `threshold: 0` and `recurrence: 0`. Use the JSON form when those settings differ. Other arrays of objects remain JSON-only.

For checker location, use repeatable `--region` for the common case and `--region-config` for the full API object:

```sh
uptimerobot monitors create http --region na --region eu # ...other required flags
uptimerobot monitors update 797054213 \
  --region-config '{"REGION":["na","eu"],"THRESHOLD":{"na":5000,"eu":6000}}'
```

The older `--region-data` spelling remains an alias for `--region-config`, and the deprecated scalar `--regional-data` is accepted but hidden from normal help. Machine-readable monitor responses retain the API's field names and shapes; output is not rewritten to resemble request flags.

Use `--file field=path` for multipart upload fields. `--body -` reads JSON from stdin.

### Inspect and compile monitor requests locally

Inspect a monitor type's generated request contract without credentials or network access:

```sh
uptimerobot monitors schema keyword
uptimerobot monitors schema keyword --example
```

The first command returns the command, method, path, fixed discriminator, CLI safety defaults, request fields, and OpenAPI examples. `--example` prints one locally validated body ready to use with `--body`. Both describe the schema packaged with this CLI version, not account entitlements or server-only rules.

Add `--dry-run` to a JSON request-body command to build and locally validate the final request without resolving an API key or sending a request:

```sh
uptimerobot monitors create keyword \
  --name status-page \
  --url https://status.example.com \
  --interval 60 \
  --timeout 30 \
  --keyword-type ALERT_EXISTS \
  --keyword-case-type CaseSensitive \
  --keyword-value operational \
  --dry-run
```

Dry-run reports the final method, path/query, content type, and body using the same merge order and local validation as live execution. Recognizable credential fields are replaced with `[REDACTED]`; the preview's `redacted` array lists their request paths, so the displayed body is intentionally not byte-for-byte identical when credentials are present. A successful preview does not guarantee that the live API will accept referenced IDs, plan-limited features, or other server-owned constraints.

## Output

Interactive terminals receive aligned tables, status glyphs, and color where appropriate. Output becomes JSON when:

- `--json` is passed;
- stdout is piped or redirected;
- agent execution is detected; or
- `UPTIMEROBOT_OUTPUT` selects `json`, `jsonl`, `table`, or `plain`.

Choose a format explicitly when needed:

```sh
uptimerobot monitors list --format table
uptimerobot monitors list --format plain
uptimerobot monitors list --format jsonl
```

`--json` is shorthand for `--format json` and cannot be combined with `--format`. Both return the CLI's normalized resource shape. `--format jsonl` emits one normalized resource per line. `--raw` instead emits the untouched API response as JSON and implies `--format json`; it cannot be combined with a non-JSON format. Plain output emits headerless, tab-separated rows without color.

Table and plain output show a curated set of columns for collection commands — the fields the UptimeRobot dashboard surfaces (for example, `monitors list` shows `ID STATUS NAME TYPE TARGET INTERVAL IN STATE TAGS` instead of the first fields in the API response). Curation never removes data from JSON output. To override it:

```sh
# Pick explicit columns; dotted paths reach nested fields
uptimerobot incidents list --columns id,monitor.friendlyName,startedAt

# Show every API field across all rows
uptimerobot monitors list --all
```

`--columns` and `--all` are available only on collection commands, apply only to `table` and `plain` formats, and cannot be combined with each other. Unknown column names render as `—` in tables and empty fields in plain output rather than failing, since available fields vary by monitor type. `--all` is a debugging escape hatch and may display sensitive API fields.

Table cells stay on one line and default to a maximum of 48 Unicode characters; selected high-variance columns use tighter limits. Longer values end in `…`. Plain, JSON, and JSONL output always retain complete values.

Status columns in table output pair the raw API value with a glyph: `●` for healthy states (`UP`, `ENABLED`, `Resolved`, `SUCCESS`, `Published`, `Sent`, `Active`, `active`, `success`), `✗` for failures (`DOWN`, `LOOKS_DOWN`, `Ongoing`, `NOT_DELIVERED`, `error`), `▲` for warning states (`Pending`, `NotActivated`, `ToMigrate`), and `◌` for inactive or preparing states (`PAUSED`, `STARTED`, `Offline`, `Archived`, `InQueue`, `CantSend`, `Paused`, `paused`). Unrecognized values render unchanged. Color follows the usual conventions: `NO_COLOR` disables it, `FORCE_COLOR=1` forces it, and otherwise it applies only when stdout is an interactive terminal. JSON, JSONL, and plain output never contain glyphs or escape codes.

Collection responses are normalized into an `items` array plus an opaque string
`nextCursor`. This works consistently for paginated endpoints and API responses that
return a root array. Use `--raw` to preserve the original single-page API response:

```sh
uptimerobot monitors list --json
# {"items":[...],"nextCursor":"123"}

uptimerobot monitors list --raw
# {"data":[...],"nextLink":"..."}
```

The CLI never follows pagination automatically. Pass `nextCursor` back through
`--cursor` to request the next bounded page. Treat cursors as opaque strings rather
than numbers; some endpoints use 64-bit IDs that JavaScript cannot represent exactly.

When table or plain output has another page, the CLI writes a continuation notice to stderr without changing the rows on stdout:

```text
More results are available. Next cursor: <opaque-cursor>
```

Normalized JSON includes `nextCursor`, and raw output retains the API response, so those modes do not print the notice. JSONL intentionally remains a homogeneous item stream and omits wrapper metadata; use JSON when an automated caller needs the continuation cursor.

Failures use a stable structure on stderr while stdout remains empty whenever machine-readable output is selected. This includes API, network, authentication, local validation, missing argument, invalid flag, and unknown-command failures:

```json
{
  "error": {
    "code": "003-005",
    "message": "Invalid token.",
    "status": 401
  }
}
```

Machine-readable errors are selected by `--json`, `--raw`, `--format json`, `--format jsonl`, `UPTIMEROBOT_OUTPUT=json`, agent mode, or redirected stdout unless an explicit human format was selected. With interactive table/plain output, errors remain concise human text. `--raw` affects successful API responses only; errors still use the stable CLI envelope.

Exit codes are `2` for input/confirmation errors, `4` for authentication, `5` for forbidden requests, `6` for not found, `7` for rate limiting, and `1` for other API or network failures.

## Mutation retries and duplicate monitors

The CLI does not automatically retry `POST`, `PATCH`, or `DELETE` requests. If monitor creation succeeds, retain the returned ID and verify the result with `uptimerobot monitors get <id>` before deciding to submit another create request.

The API can reject a duplicate monitor with a structured `409`; the CLI preserves that server code, message, and details in machine output. A filtered monitor list can help locate an existing resource, but it is bounded and is not an atomic existence check. The CLI therefore does not provide `--if-not-exists`: a list-then-create implementation would still race and would have to invent monitor identity rules.

True safe retry semantics require an API-owned idempotency-key contract. Until that exists, duplicate detection is useful protection but must not be treated as idempotency.

## Destructive actions

Delete and reset operations require confirmation. A human in an interactive terminal is prompted. Agents and non-interactive processes are never prompted and must pass `--confirm` explicitly:

```sh
uptimerobot monitors delete 797054213 --confirm --json
```

Without `--confirm`, an agent receives a `CONFIRMATION_REQUIRED` result and no API request is made.

## Analytics attribution

Every API request includes:

- `User-Agent: uptimerobot-cli/<version> mode/<human|agent> environment/<local|ci>`;
- `X-UptimeRobot-Client: cli`;
- `X-UptimeRobot-Execution-Environment: local|ci`;
- `X-UptimeRobot-Invocation-Mode: human|agent`.

The existing v3 usage tracker records the user agent today, so CLI source, invocation mode, execution environment, write endpoint, and account are segmentable immediately. Linking an analytics event to the exact created resource ID requires the API enhancement in [`docs/api-recommendations.md`](docs/api-recommendations.md); the explicit headers provide its stable client contract.

Set `UPTIMEROBOT_AGENT=1` or pass `--agent` to identify agent execution explicitly. `UPTIMEROBOT_AGENT=0` overrides ambient agent detection.
CI execution is detected from a truthy `CI` environment variable and remains independent from human-versus-agent attribution.

## OpenAPI lockstep

The command tree is generated from [`openapi/openapi.yaml`](openapi/openapi.yaml), whose source is <https://cdn.uptimerobot.com/api/openapi.yaml>.

```sh
# Download the current public contract and regenerate all command entrypoints
pnpm openapi:update

# Regenerate from the checked-in snapshot
pnpm openapi:generate

# Fail if the CDN contract or generated command files have drifted
pnpm openapi:check
```

CI runs the drift check on both supported Node lines. A separate hourly workflow also checks the CDN and accepts a `public-api-v3-updated` repository dispatch from the API release pipeline. The cross-repository release gate described in [`docs/api-recommendations.md`](docs/api-recommendations.md) is still required to guarantee that an API release waits for its matching CLI release.

## Development

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

Run `pnpm format` to apply Oxfmt formatting locally.

Tests execute the compiled CLI as a child process against local HTTP servers. They verify behavior at the user-visible seam instead of mocking internal modules.
