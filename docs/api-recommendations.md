# API recommendations for the CLI

The CLI works against the current public API without API-repository changes. The following small API contracts would make the integration more durable.

## 1. First-class analytics attribution

`PublicApiUsageTrackingInterceptor` currently publishes `user_id`, endpoint, `user_agent`, and timestamp. The CLI encodes the required dimensions in its user agent today and also sends explicit headers:

- `X-UptimeRobot-Client: cli`
- `X-UptimeRobot-Execution-Environment: local|ci`
- `X-UptimeRobot-Invocation-Mode: human|agent`

Recommended API change:

1. Validate `X-UptimeRobot-Client` against a small source enum, execution environment against `local | ci`, and invocation mode against `human | agent`.
2. Add HTTP method, `client_source`, `client_version`, `execution_environment`, and `invocation_mode` to the `public-api-v3.usage.logs` event.
3. For successful writes, pass the handler result into `trackUsage` and include `resource_type` and `resource_id` when the response identifies a created or mutated resource.
4. Retain user-agent parsing as a fallback for older CLI versions and other clients.
5. Apply attribution to successful writes in analytics rather than adding CLI-specific state to monitor records.

This directly supports the PRD while keeping the REST resource model independent of the client used to mutate it.

## 2. OpenAPI-owned destructive-action metadata

The current CLI safely classifies DELETE and monitor-reset operations as destructive. Add an `x-uptimerobot-destructive: true` operation extension so the API contract remains the authority when future non-DELETE actions need confirmation.

## 3. Stable command names

Current `operationId` values contain Nest controller names. They are implementation-oriented and may change during an API refactor. Either make operation IDs stable public identifiers or add an `x-uptimerobot-cli-command` extension such as `monitors stats uptime`.

## 4. Document common error responses

The API returns useful structured errors such as `{message, code}`, but the OpenAPI operations do not consistently describe 400, 401, 403, 404, 409, 422, and 429 responses. Define a shared error schema and reusable responses, including rate-limit headers. This would let the CLI generate more precise errors instead of retaining a defensive fallback parser.

## 5. Add a cross-repository release gate

The CLI checks the CDN contract on every change, hourly, and on a `public-api-v3-updated` repository dispatch. Detection alone cannot guarantee the PRD's same-release promise across two repositories. The API release pipeline should dispatch the event before publication and block until the CLI workflow confirms that the matching snapshot, generated commands, tests, and package release are available. If automatic releases are not desired, the gate should at least create and require a CLI sync PR before the API deployment proceeds.

## Deferred OAuth prerequisite

OAuth is intentionally deferred from this CLI release. Before adding it, review `PublicApiAuthGuard`: its strategy list currently includes `service-token` and `public-api-key`, while surrounding code and comments reference `mcp-oauth-bearer`. Adding the OAuth strategy to the public v3 guard, with scope tests for read and write operations, appears necessary for MCP OAuth access tokens to work against API v3.
