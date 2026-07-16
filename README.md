# UptimeRobot CLI

The official imperative command-line interface for UptimeRobot API v3. It is built with oclif, uses the published OpenAPI contract as its command source, and is intended for terminals, CI jobs, cron tasks, and coding agents.

This release implements Pillar 1 of the CLI PRD. OAuth, agent-skill distribution, machine-readable schema discovery, and codebase scanning are intentionally outside this release.

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

## Commands

The checked-in OpenAPI snapshot currently generates 59 commands covering:

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
uptimerobot monitors create \
  --set friendlyName=checkout-api \
  --set url=https://checkout.example.com \
  --set type=HTTP
uptimerobot monitors delete 797054213 --confirm
```

Commands with request bodies accept any API v3 payload in three ways:

```sh
# Inline JSON
uptimerobot monitors create --body '{"friendlyName":"api","url":"https://example.com","type":"HTTP"}'

# JSON file
uptimerobot monitors create --body @monitor.json

# Composable dotted assignments; JSON literals are typed automatically
uptimerobot monitors update 797054213 --set interval=60 --set customSettings.region='"EU"'
```

Use `--file field=path` for multipart upload fields. `--body -` reads JSON from stdin.

## Output

Interactive terminals receive aligned tables, status glyphs, and color where appropriate. Output becomes JSON when:

- `--json` is passed;
- stdout is piped or redirected;
- agent execution is detected; or
- `UPTIMEROBOT_OUTPUT=json` is set.

Choose a format explicitly when needed:

```sh
uptimerobot monitors list --format table
uptimerobot monitors list --format plain
uptimerobot monitors list --format jsonl
```

`--json` is shorthand for `--format json` and cannot be combined with `--format`. JSONL emits one resource per line. Plain output emits headerless, tab-separated rows without color.

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

Failures use a stable structure on stderr while stdout remains empty:

```json
{
  "error": {
    "code": "003-005",
    "message": "Invalid token.",
    "status": 401
  }
}
```

Exit codes are `2` for input/confirmation errors, `4` for authentication, `5` for forbidden requests, `6` for not found, `7` for rate limiting, and `1` for other API or network failures.

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
