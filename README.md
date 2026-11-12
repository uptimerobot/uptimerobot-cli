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

`--version` prints one human-readable line. The `version` command reports the same facts through the normal output flags, so a script asserting a minimum version reads a field instead of parsing a sentence:

```sh
uptimerobot version --json
# {"version":"1.3.0","platform":"darwin-arm64","node":"24.12.0"}
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

## Set up a repository for a coding agent

`uptimerobot init` prepares a repository for agent-driven monitoring. It resolves credentials, scans the working tree for endpoints, scheduled jobs and the third-party providers the code depends on, writes what it found to `uptimerobot-scan.md` at the project root, offers to track the third-party providers it matched in the catalog, detects which coding agent you use, and makes the UptimeRobot skills reachable from it.

```sh
uptimerobot init
```

Every command `init` prints or writes into the guide is templated: `uptimerobot` when the CLI is on PATH, `npx @uptimerobot/cli` otherwise, or whatever `UPTIMEROBOT_CLI_COMMAND` names (a workspace runner such as `pnpm --silent uptimerobot`). `UPTIMEROBOT_SKILLS_DIR` points Claude Code at a local checkout of the skills, passed as `--plugin-dir` when the agent is opened.

The scan itself is pattern matching over the working tree. It reaches no network, runs nothing, and never reads `.env` values. Its output starts with an `<!-- uptimerobot:scan:begin ... -->` marker. A rerun rewrites the whole of `uptimerobot-scan.md` when that marker is there, your own edits to it included, and refuses to overwrite a file that does not start with it, so keep notes elsewhere.

| Flag               | Effect                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `--api-key <key>`  | Key for this run, ahead of `UPTIMEROBOT_API_KEY` and the stored login                                                                          |
| `--target <name>`  | Agent to set up: `claude-code`, `codex`, `cursor`, `opencode`, or `gemini`                                                                     |
| `--no-agent`       | Scan, offer third-party services, write the seed context; skip agent setup                                                                     |
| `--no-third-party` | Skip `init`'s own offer to create third-party services; the setup guide it writes still tells the agent to propose them through `scan --apply` |
| `--no-launch`      | Write the files and print the handoff prompt instead of opening the agent                                                                      |
| `--max-monitors`   | Cap the agent at this many monitors per run; written into the setup guide (default 50)                                                         |
| `--clean`          | Remove what a previous run planted, then exit                                                                                                  |
| `--yes`            | Never prompt; run non-interactively                                                                                                            |
| `--json`           | Structured JSON, which also implies `--yes`                                                                                                    |

`--clean` is terminal, cannot be combined with `--target` or `--no-agent`, and runs before the authentication check because it only removes local files — so it works logged out. Without `--target`, a non-interactive run sets up the one agent it detects, or Claude Code when it is among several; it fails and lists the candidates when it detects none, or several without Claude Code. Note that `--target` names the agent being set up, while `--agent` marks the invocation itself as agent-driven; they are different flags and can be passed together. `uptimerobot init --help` carries the full precedence rules.

Only Claude Code has a confirmed first-party install path today — `git clone https://github.com/uptimerobot/ai.git` followed by `claude --plugin-dir ./ai`, which loads the plugin for that session only, since the marketplace listing has not shipped. Codex, Cursor, Gemini, and OpenCode instead get a marked, idempotent UptimeRobot section written to `AGENTS.md` at the project root. Nothing is written to your home directory or to any global agent configuration.

At an interactive terminal `init` opens Claude Code on the scan itself; with `--no-launch`, or for another agent, open the agent in the repository and ask it to read `uptimerobot-setup.md` and then `uptimerobot-scan.md`. The setup guide carries the guardrails (confirm before creating, the monitor cap, never read `.env` values) and the scan carries the candidates. It proposes monitors and heartbeats from that file, asks before creating anything, tags what it creates `agent-setup`, and writes `uptimerobot-report.md`. That report is the agent's account of its own work; `uptimerobot verify` is the API's:

```sh
uptimerobot verify
uptimerobot verify --json
uptimerobot verify --tags agent-setup,production
```

`verify` only reads. It lists every monitor carrying the tag with its ID, status, type, target, and creation time, and exits 0 whether the count is zero or a hundred. It also states what the count misses: tags are replaced wholesale on update, and the email-only quick setup creates monitors through an endpoint that accepts no tags, so treat the number as a floor rather than a total.

`--tags` takes a comma-separated, case-sensitive list — the same spelling `monitors list --tags` uses. Setting tags at creation is a different flag, `--tag-names`, repeated once per tag:

```sh
uptimerobot monitors create http \
  --name checkout-api \
  --url https://checkout.example.com \
  --tag-names agent-setup \
  --tag-names production
```

Two smaller commands do parts of the same job on their own. Without `--apply`, `uptimerobot scan [PATH]` prints the seed context and nothing else, no API key, no network, no writes, so it can be run against any directory as often as you like:

```sh
uptimerobot scan
uptimerobot scan ../other-repo --json
```

The `AGENTS.md` block comes from `uptimerobot init --target <agent>` (or `init` at an interactive terminal), and `uptimerobot init --clean` removes it and leaves the rest of the file byte-identical. `uptimerobot skills install` is separate: it confirms and runs `npx skills add uptimerobot/ai`, and plants nothing.

### Third-party providers: the scan and `scan --apply`

The scan reads dependency manifests (`package.json`, `requirements*.txt`, `pyproject.toml`, `go.mod`, `Gemfile`, `composer.json`, `Cargo.toml`), deploy files (`vercel.json`, `fly.toml`, `wrangler.toml`, `serverless.yml` and the like; a `Procfile` is a hint only), terraform providers and resource prefixes, CI files, container registries in `Dockerfile` and compose files, and the root git remote, and names the providers they point at. Only structured fields count: a package name in a README or a comment yields nothing, `.env*` files are never opened, and dot directories other than `.github` and `.circleci`, symlinks, nested checkouts and files over 512 KiB are not read, so the result can be partial. The report ends with a section like this:

```
## Third-party providers (candidates for third-party services)

### Runtime (proposed by default)

- AWS: boto3@1.35.80 (requirements.txt:2), infra/main.tf:1 (provider "aws"); signals: eu-central-1, s3
- Stripe: stripe@17.4.0 (package.json:9)
- Vercel: vercel.json

### Build-time (optional, affects deploys, not users)

- GitHub: git remote: github.com, .github/workflows/ci.yml

### Skipped

- next, react (framework or UI library)
- pg (protocol client, self-hosted or unknown)
```

The JSON output carries the same data under `thirdParty` (`candidates`, `skipped`, `unknown`, `totals`), and the seed context schema is 2.

`uptimerobot scan --apply` turns the runtime candidates into third-party services. It needs an API key like every other authenticated command and fails with the usual authentication error before any request when none resolves. It reads the account's third-party services and allowance, searches the catalog once per provider, prints a proposal, asks, then creates:

```sh
uptimerobot scan --apply                              # proposal, question, creates on yes
uptimerobot scan --apply --json --agent               # proposal only; exits 2 with CONFIRMATION_REQUIRED when there is something to create, 1 with CATALOG_UNRESOLVED when a lookup failed, else 0
uptimerobot scan --apply --confirm --only Stripe --only Vercel --json
uptimerobot scan --apply --confirm --skip Sentry
uptimerobot scan --apply --confirm --only Vercel=862  # settles an ambiguous row
uptimerobot scan --apply --include-build-time         # also proposes CI, code host and registries
```

`--confirm` is your yes: the question is skipped, so pass it only after the proposal was reviewed, and prefer naming the approved providers with `--only`. `--json` never confirms by itself; at a terminal it still asks, and off a terminal or with `--agent` it prints the proposal and exits 2 when the proposal holds something to create, or 0 with `confirmation: "not-needed"` when every provider is already tracked or nothing matched, so a script must handle both. `--only` and `--skip` match the scan's providers case-insensitively; an unknown or malformed name exits 2 with `INVALID_INPUT`, as does `--only` naming a build-time provider without `--include-build-time`. `--confirm`, `--only`, `--skip` and `--include-build-time` are refused without `--apply`. `--api-key` works as for `init` and is read only with `--apply`.

Each proposal row ends in one status: `create`, `already-tracked`, `not-in-catalog`, `ambiguous` (several catalog rows match; pick one with `--only <provider>=<id>`), `unresolved` (the lookup failed; retry), or `over-allowance` (the plan has no slot left; runtime rows keep slots first). A row is accepted only when its catalog name equals the provider's name after lowercasing and dropping punctuation, so `Clerk.io` never stands in for `Clerk`. A provider counts as already tracked when the account's own monitor list, read at the start of the run, names it or the catalog row says so; the list covers the catalog's one-minute cache, so two confirmed runs in a row create each provider once. The list reads at most 10,000 monitors; past that it is partial, the proposal says so, and a provider the list never reached is proposed again, which is safe: the API answers a repeat create with the monitor the account already has.

Creates run one at a time in proposal order and stop at the first failure, which is never retried. A create the API never answered (no response, or a server error) is reported as outcome unknown rather than as not created, with no command to repeat it by hand: re-run `scan --apply` to see whether it exists. The create sends only a catalog id, and the search sends only the provider's name from the built-in vendor list; no file content, path or version from the repository reaches a request, but which providers the repository depends on is disclosed to the API through the searches it makes.

Exit codes: 0 when the confirmed set was created in full or there was nothing to create; 1 with `CATALOG_UNRESOLVED` when a selected provider could not be looked up, after any creates that did resolve; 2 with `CONFIRMATION_REQUIRED` when confirmation is absent or declined, or with `INVALID_INPUT`; the authentication code when no key resolves; the API's mapped exit code when a create fails. The `--json` document carries the proposal rows, `allowance` (`used` and `limit`, each null when the account did not report them, and `proposed`), `tracked` (`providerIds`, `partial`), `confirmation` (`required`, `declined`, `confirmed`, `not-needed`, or `blocked` when an `--only <provider>=<id>` named an id the search did not return) and `results[]` (`created` with `monitorId`; `unknown` or `failed` with the `error`). A malformed or unknown `--only` or `--skip` name fails before any document is written: the error envelope goes to stderr and stdout stays empty.

At an interactive terminal `uptimerobot init` offers the runtime providers it can match before it starts the agent, when the proposal has something to create and `uptimerobot-scan.md` is its own to write, and records the outcome in that file. `--no-third-party` skips the offer; `--yes`, `--json`, an agent or a pipe also skip it and the handoff points at `scan --apply`. The setup guide tells the agent to run `scan --apply --json --agent`, show the proposal, and pass `--confirm` only after the user says yes in the conversation.

## Find the right command

Help is available at every level of the command tree:

```sh
uptimerobot help
uptimerobot monitors --help
uptimerobot monitors create --help
uptimerobot monitors create keyword --help
uptimerobot incidents comments create --help
```

`uptimerobot help <command-or-topic>` is equivalent to the `--help` flag, so `uptimerobot help monitors create` and `uptimerobot monitors create --help` print the same page.

Monitor creation commands expose only the fields relevant to their type and supply the API monitor type automatically. Command help includes accepted values, required fields, defaults, constraints, and examples from the packaged API contract.

Typed flags cover normal use. Full API request bodies remain available when needed:

```sh
uptimerobot monitors create http --body @monitor.json
uptimerobot monitors update 797054213 --set interval=120
uptimerobot monitors create http --body - < monitor.json
```

`--body` is a base document, and typed flags and `--set` are applied on top of it. Those two are peers, so giving the same field a different value with both is an error rather than a silent win for one of them:

```sh
uptimerobot monitors create http --name checkout-api --set friendlyName=checkout
# INVALID_INPUT: friendlyName received conflicting values:
#   --name checkout-api and --set friendlyName=checkout. Pass only one.
```

## Third-party services

A third-party service tracks the public status page of an outside provider, such as a cloud or a payment processor, and alerts you when the provider reports an incident. Find the provider's id first, then track it:

```sh
uptimerobot third-party-providers list --search stripe
uptimerobot third-party-providers get 4317
uptimerobot monitors create third-party-service --provider-id 4317 --components 11 --components 12 --notify-severity major --notify-incremental-updates
```

Omit `--components` to track every component. Then read its state and incidents by the monitor id the create returned:

```sh
uptimerobot monitors third-party-service status 800123456
uptimerobot monitors third-party-service incidents list 800123456
uptimerobot monitors third-party-service incidents get 800123456 1234567890
uptimerobot monitors third-party-service incidents activity-log 800123456 1234567890
```

`uptimerobot monitors delete <id>` stops tracking a service. A third-party service cannot be paused.

To find the providers a repository depends on and track them in one go, see [Third-party providers: the scan and `scan --apply`](#third-party-providers-the-scan-and-scan---apply).

## Heartbeat monitors

A heartbeat monitor stays silent until something pings it. The API returns the address that job should call as `heartbeatUrl`, and normalized output repeats it as `pingUrl`. Both, and the `url` token they are built from, are secrets, so all three are redacted unless you ask for them:

```sh
uptimerobot monitors get 803704830 --json
# {"type":"HEARTBEAT","id":803704830,"url":"[REDACTED]","heartbeatUrl":"[REDACTED]","pingUrl":"[REDACTED]"}

uptimerobot monitors get 803704830 --json --reveal-secrets
# {"type":"HEARTBEAT","id":803704830,"url":"997c8970…","heartbeatUrl":"https://heartbeat.uptimerobot.com/m803704830-997c8970…","pingUrl":"https://heartbeat.uptimerobot.com/m803704830-997c8970…"}
```

Reach for `--reveal-secrets` when wiring up the job that pings it, which is normally once per monitor. Anyone holding the ping URL can report the heartbeat on your behalf, so a leaked one keeps a dead service looking alive with no alert raised. `url` on every other monitor type is a target address, not a secret, and is never redacted; `heartbeatUrl` is `null` there.

`pingUrl` is added by the CLI, so `--raw` does not include it. When a response has no `heartbeatUrl`, the CLI composes `pingUrl` from the monitor's `id` and `url`, where `url` carries the monitor's token rather than a target address; set `UPTIMEROBOT_HEARTBEAT_URL` to point that composition at a different host.

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

| Option             | Output                               |
| ------------------ | ------------------------------------ |
| `--json`           | Normalized JSON                      |
| `--format jsonl`   | One normalized resource per line     |
| `--format table`   | Human-readable table                 |
| `--format plain`   | Headerless, tab-separated rows       |
| `--raw`            | Untouched API response as JSON       |
| `--reveal-secrets` | Credential-like fields shown in full |

Recognizable credential fields in a response, such as `httpPassword`, print as `[REDACTED]` in every format, and a stderr notice names what was hidden. Pass `--reveal-secrets` to print the values instead. `--raw` skips redaction along with the rest of normalization. Machine-readable error envelopes are redacted the same way but unconditionally, because failure output is what ends up in bug reports and CI logs; `--reveal-secrets` does not lift it. Redaction matches field names, so a credential quoted inside an error `message` is not covered.

Set `UPTIMEROBOT_OUTPUT` to `json`, `jsonl`, `table`, or `plain` to choose a default. Use `--agent` or `UPTIMEROBOT_AGENT=1` to identify agent execution explicitly. A truthy `CI` environment variable identifies CI execution independently.

Normalized collection JSON contains `items` and `nextCursor`. The CLI does not follow pagination automatically; pass a returned cursor through `--cursor` for the next page. Collection commands also support `--columns` and `--all`. Column selection never changes JSON, JSONL, or raw output, and `--all` may expose sensitive API fields.

Machine-readable failures are emitted as JSON on stderr. Stdout remains empty, except for `monitors bulk` commands, which print their per-item results on stdout even when the operation failed.

The exit code identifies the failure:

| Exit code | Meaning                                                                             |
| --------- | ----------------------------------------------------------------------------------- |
| `0`       | Success                                                                             |
| `1`       | Generic failure, including a bulk operation where every item failed (`BULK_FAILED`) |
| `2`       | Invalid input, rejected either locally or by the API (HTTP 400 or 422)              |
| `3`       | Bulk operation where some items failed (`BULK_PARTIAL_FAILURE`)                     |
| `4`       | Unauthenticated (HTTP 401)                                                          |
| `5`       | Forbidden (HTTP 403)                                                                |
| `6`       | Not found (HTTP 404)                                                                |
| `7`       | Rate limited (HTTP 429)                                                             |
| `8`       | Conflict with the current state (HTTP 409)                                          |

Exit code `2` covers both a request the CLI rejected before sending and one the API rejected as invalid, so it always means the input is wrong. Along with `8`, it says the request will not succeed as sent and should be changed rather than repeated; `1` and `7` are the failures a plain retry may clear.

The error envelope's `code` is `HTTP_<status>` whenever `status` is present, and a CLI symbol such as `INVALID_INPUT` or `AUTH_REQUIRED` otherwise, so `status` distinguishes a failure the API reported from one the CLI raised. When the API supplies an error code of its own it is passed through verbatim as `apiCode` and is never interpreted; it is not part of the CLI's contract, because the API does not currently document those codes:

```sh
uptimerobot monitors get 999999999 --json
# {"error":{"apiCode":"000-004","code":"HTTP_404","message":"Monitor not found","status":404}}
```

Branch on `code` or `status`. Read `apiCode` only for diagnostics, and use `--raw` for the untouched API response.

`monitors bulk pause`, `monitors bulk start`, and `monitors bulk update` report per-monitor outcomes in an HTTP 201 response, so a failure is only visible in the body. The CLI inspects it and exits non-zero, listing the failed entries in the error envelope's `details`.

Those three commands report acceptance rather than completion. The API answers `success` for every matched monitor as soon as the write is accepted; it carries no operation id, and nothing in the response distinguishes queued from applied. Exit code `0` therefore means the request was accepted, not that the monitors have changed. A pipeline that pauses monitors before a deploy should confirm with `uptimerobot monitors get <id>` before it continues.

## Safety

Commands that delete, and `scan --apply`, which creates on your behalf, prompt in an interactive terminal. Agents and non-interactive processes must pass `--confirm` explicitly, and only after the proposal was reviewed:

```sh
uptimerobot monitors delete 797054213 --confirm --json
```

The CLI retries only safe `GET` and `HEAD` requests. It does not retry `POST`, `PATCH`, or `DELETE`; retain returned resource IDs before deciding to repeat a mutation.

## Scanning untrusted repositories

`uptimerobot scan` without `--apply` only reads files. `scan --apply` and the third-party offer in `init` also use your API key to create third-party services, and which providers are proposed is decided by dependency names in the repository: a planted manifest can fill your allowance with services you never use. Read the proposal, and give `--confirm` to a script only together with `--only` for the exact providers you reviewed. The agent the commands hand off to does not stop at reading either. The CLI authenticates from your OS keyring, and your coding agent has a shell. Text planted in a scanned repository — in a route file, a Compose comment, a cron script — can therefore instruct the agent to run `uptimerobot monitors create`, or any other authenticated command, directly. Nothing here sandboxes the agent, detects injected instructions, or filters what a scanned file can say before the agent reads it.

The blast radius is the UptimeRobot account behind whichever key resolves, at that key's permissions: monitors, status pages, maintenance windows, alert contacts, and incident comments can be created, changed, or deleted, and reading a monitor back returns the credentials stored on it, such as `httpUsername`, `httpPassword`, and `customHttpHeaders`. Where no OS keyring is available and the key sits in `~/.config/uptimerobot/credentials.json`, a shell can read the key itself. What the CLI does not add is reach: it holds no credential other than that key, and an agent with a shell could already read your repository and make network calls without it.

The mitigations available today are procedural. Review the diff before applying it, and do not run `init` — or point an agent at `uptimerobot-scan.md` — in a repository you would not otherwise trust to run its own build. The skills require the agent to show its proposal and get an explicit yes in the conversation before creating a monitor or editing a file, but that is an instruction to the model rather than a check the harness enforces: under `--permission-mode acceptEdits` the approval gate is gone, and only the agent's compliance is left. If a run does go wrong, `uptimerobot monitors list --json` shows the current state of the account and `uptimerobot auth logout` removes the stored key.

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
