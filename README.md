# UptimeRobot CLI

[![npm version](https://img.shields.io/npm/v/@uptimerobot/cli)](https://www.npmjs.com/package/@uptimerobot/cli)
[![npm downloads](https://img.shields.io/npm/dm/@uptimerobot/cli)](https://www.npmjs.com/package/@uptimerobot/cli)
[![CI](https://github.com/uptimerobot/uptimerobot-cli/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/uptimerobot/uptimerobot-cli/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/node/v/@uptimerobot/cli)](https://nodejs.org)
[![License: Apache-2.0](https://img.shields.io/npm/l/@uptimerobot/cli)](./LICENSE)

The official command-line interface for UptimeRobot. Manage uptime monitors, incidents, status pages, maintenance windows, and alert contacts from your terminal, scripts, CI pipelines, or coding agents — readable tables when you're interactive, stable JSON when you're automating.

Built on the UptimeRobot API v3. The CLI combines human-friendly commands with structured output, local validation, and safe automation defaults.

- Manage monitors, incidents, status pages, maintenance windows, alert contacts, integrations, tags, and more.
- Create each monitor type through a dedicated command such as `monitors create http` or `monitors create keyword`.
- Use readable tables interactively and stable JSON or JSONL for automation.
- Inspect and validate monitor requests locally before sending them.

## Installation

UptimeRobot CLI requires Node.js 22.12 or newer.

```sh
npm install --global @uptimerobot/cli
```

With pnpm:

```sh
pnpm add --global @uptimerobot/cli
```

Verify the installation:

```sh
uptimerobot --version
uptimerobot --help
```

## AI agent skills

Install the [UptimeRobot AI skills](https://github.com/uptimerobot/ai) for supported coding agents:

```sh
uptimerobot skills install
```

The CLI shows the exact external command and requires confirmation before handing the terminal to `npx skills`. `npx` may download and execute the third-party `skills` package, which can write skill files into your project or agent directories. The installer prompts for the skills, agents, and installation scope. In a non-interactive environment, run `npx skills add uptimerobot/ai` directly after reviewing it.

## Authentication

[Create an API key](https://help.uptimerobot.com/en/articles/11620152-how-to-use-uptimerobot-s-api), then save it in your operating system's secure credential store:

```sh
uptimerobot auth login
```

The CLI prompts for the key with masked input and validates it before saving, so the key never appears in shell history. For scripts, provide it through the environment instead:

```sh
UPTIMEROBOT_API_KEY='your-api-key' uptimerobot auth login
```

The key is stored in macOS Keychain, Windows Credential Manager, or an available Linux keyring. When no OS keyring is available — common on minimal or headless Linux — the key is saved in plaintext at `~/.config/uptimerobot/credentials.json` with owner-only `0600` permissions. Set `UPTIMEROBOT_CONFIG_DIR` to change that location. Prefer a preconfigured environment or secret manager instead of typing secrets directly into shell history.

For CI, containers, and other temporary environments, provide the key without storing it:

```sh
export UPTIMEROBOT_API_KEY='your-api-key'
uptimerobot monitors list
```

Credentials are resolved from `--api-key`, then `UPTIMEROBOT_API_KEY`, then the stored key. Run `uptimerobot auth logout` to remove the stored credential.

## Quick start

List monitors:

```sh
uptimerobot monitors list
```

Create an HTTP monitor:

```sh
uptimerobot monitors create http \
  --name checkout-api \
  --url https://checkout.example.com \
  --interval 60 \
  --timeout 30 \
  --method GET \
  --check-ssl \
  --follow-redirects
```

Inspect or delete it:

```sh
uptimerobot monitors get 797054213
uptimerobot monitors delete 797054213 --confirm
```

## Find the right command

Help is available at every level of the command tree:

```sh
uptimerobot help
uptimerobot monitors --help
uptimerobot monitors create --help
uptimerobot monitors create keyword --help
uptimerobot incidents comments create --help
```

Monitor creation commands expose only the fields relevant to their type and supply the API monitor type automatically. Command help includes accepted values, required fields, defaults, constraints, and examples from the packaged API contract.

Typed flags cover normal use. Full API request bodies remain available when needed:

```sh
uptimerobot monitors create http --body @monitor.json
uptimerobot monitors update 797054213 --set interval=120
uptimerobot monitors create http --body - < monitor.json
```

## Validate before sending

Inspect a monitor request contract or print a validated example without credentials or network access:

```sh
uptimerobot monitors schema keyword
uptimerobot monitors schema keyword --example
```

Add `--dry-run` to compile and validate a JSON request without authenticating or sending it:

```sh
uptimerobot monitors create http --body @monitor.json --dry-run
```

Dry-run output contains the final method, path, content type, and body. Recognizable credential fields are redacted. Local validation cannot verify account entitlements, referenced resource IDs, or other server-owned rules.

## Output and automation

Interactive terminals use tables by default. Piped, redirected, and agent-driven commands use normalized JSON by default.

| Option           | Output                           |
| ---------------- | -------------------------------- |
| `--json`         | Normalized JSON                  |
| `--format jsonl` | One normalized resource per line |
| `--format table` | Human-readable table             |
| `--format plain` | Headerless, tab-separated rows   |
| `--raw`          | Untouched API response as JSON   |

Set `UPTIMEROBOT_OUTPUT` to `json`, `jsonl`, `table`, or `plain` to choose a default. Use `--agent` or `UPTIMEROBOT_AGENT=1` to identify agent execution explicitly. A truthy `CI` environment variable identifies CI execution independently.

Normalized collection JSON contains `items` and `nextCursor`. The CLI does not follow pagination automatically; pass a returned cursor through `--cursor` for the next page. Collection commands also support `--columns` and `--all`. Column selection never changes JSON, JSONL, or raw output, and `--all` may expose sensitive API fields.

Machine-readable failures are emitted as JSON on stderr. Stdout remains empty, except for `monitors bulk` commands, which print their per-item results on stdout even when the operation failed.

The exit code identifies the failure:

| Exit code | Meaning                                                                             |
| --------- | ----------------------------------------------------------------------------------- |
| `0`       | Success                                                                             |
| `1`       | Generic failure, including a bulk operation where every item failed (`BULK_FAILED`) |
| `2`       | Invalid input                                                                       |
| `3`       | Bulk operation where some items failed (`BULK_PARTIAL_FAILURE`)                     |
| `4`       | Unauthenticated (HTTP 401)                                                          |
| `5`       | Forbidden (HTTP 403)                                                                |
| `6`       | Not found (HTTP 404)                                                                |
| `7`       | Rate limited (HTTP 429)                                                             |

`monitors bulk pause`, `monitors bulk start`, and `monitors bulk update` report per-monitor outcomes in an HTTP 201 response, so a failure is only visible in the body. The CLI inspects it and exits non-zero, listing the failed entries in the error envelope's `details`.

## Safety

Destructive commands prompt in an interactive terminal. Agents and non-interactive processes must pass `--confirm` explicitly:

```sh
uptimerobot monitors delete 797054213 --confirm --json
```

The CLI retries only safe `GET` and `HEAD` requests. It does not retry `POST`, `PATCH`, or `DELETE`; retain returned resource IDs before deciding to repeat a mutation.

## Development

This project uses pnpm and oclif.

```sh
pnpm install
pnpm build
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

The command tree is generated from [`openapi/openapi.yaml`](openapi/openapi.yaml), which tracks the [published UptimeRobot OpenAPI contract](https://cdn.uptimerobot.com/api/openapi.yaml). Run `pnpm openapi:generate` after updating the snapshot. Generated command files and operation metadata should not be edited directly.

## Support

For bugs and feature requests, [open a GitHub issue](https://github.com/uptimerobot/uptimerobot-cli/issues). Include the CLI version, command, output mode, and a sanitized error response when possible. Never include an API key.

## License

Licensed under the [Apache License 2.0](LICENSE).
