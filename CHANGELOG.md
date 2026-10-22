# Changelog

All notable changes to the UptimeRobot CLI are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

The public contract covers the command tree and flags, machine-readable output
shapes, error codes, exit codes, and environment variables. Human table layout
may change in minor releases.

## [Unreleased]

### Added

- `uptimerobot monitors create` is available as a plain command beside the typed
  `monitors create <type>` commands. It takes `--body` and `--set` with no typed
  flags, as an untyped escape hatch. The generator now keeps the plain command
  whenever a request body is a discriminated union.

### Fixed

- Machine-readable error envelopes are redacted, so the documented rule that
  credential-like fields print as `[REDACTED]` in every format now holds on the
  failure path as well as the success path. Redaction is applied where a failure
  becomes output rather than at each error's source, covering the API's `details`
  passthrough, the CLI's own bulk failure entries, and any error shape added
  later. Nothing in the published API populates `details` with a credential
  today and bulk entries carry only ids, names, and statuses, so no output
  changes; what changes is that a future endpoint cannot leak through this path
  without a CLI change. Two limits are deliberate: redaction matches field names,
  so a credential interpolated into a free-text `message` is still shown, and
  `--reveal-secrets` does not lift redaction on errors the way it does on
  successful output.

## [1.0.0] - 2026-08-10

First stable release. The public contract stated above — the command tree and
flags, machine-readable output shapes, error codes, exit codes, and environment
variables — is from here on covered by semantic versioning, so changing it
requires a major release. Everything below was landed deliberately before that
freeze; each entry is a change that would otherwise have needed a 2.0.

### Added

- Heartbeat monitors carry a derived `pingUrl` in normalized output. The API
  returns the ingredients without naming the result — `url` holds the token and
  the endpoint is `<host>/m<id>-<token>` — so the URL a heartbeat must receive
  could previously only be obtained from the dashboard. Set
  `UPTIMEROBOT_HEARTBEAT_URL` to override the host. Derived, not authoritative:
  `--raw` is unaffected, and this gives way to the API field once it exists.
- `--publish-on-status-page` on `incidents comments create` and
  `incidents comments update`, controlling whether a comment appears on the
  status page. The field was added to the published API contract; the flag is
  generated from it and defaults to `false`.
- `uptimerobot version` reports the CLI version, platform, and Node.js runtime
  through the normal output flags, so `uptimerobot version --json` answers
  `{"version":"1.0.0","platform":"darwin-arm64","node":"24.12.0"}`. The bare
  `--version` flag is handled inside oclif before any command runs and keeps
  printing the single human line it always has; asserting a minimum version in
  CI no longer means parsing that sentence.

### Changed

- The error envelope's `code` is now always `HTTP_<status>` for a failure the
  API reported, and the upstream code is passed through verbatim as `apiCode`.
  It previously reported whichever code the API happened to include and fell
  back to `HTTP_<status>` only when there was none, so the same failure was
  spelled `000-004` on one endpoint and `HTTP_404` on another, and the spelling
  could change without a CLI release. Those codes are documented nowhere in the
  API contract, so `apiCode` is diagnostic only; branch on `code` or `status`.
- A typed flag and `--set` that give the same request body field different
  values now fail with `INVALID_INPUT` and exit 2, naming the field and both
  values. Previously `--set` won silently and the typed flag was discarded.
  Passing both with the same value is still accepted. `--body` is unchanged: it
  is a base document that typed flags and `--set` may both override.
- A request the API rejects as invalid now exits `2`, the code locally caught
  invalid input already used, instead of the generic `1`. HTTP 400 and HTTP 422
  both map to it. HTTP 409 takes a new exit code `8`, because a conflict is a
  well-formed request that only the current server state refuses. Previously all
  three were indistinguishable from a transient fault, so a script could not
  tell "the input is wrong, do not repeat it" from "retrying may help". Exit
  code `1` stays the generic fallback for everything not mapped to a code of its
  own, including a bulk operation in which every item failed (`BULK_FAILED`).
- `monitors bulk pause`, `monitors bulk start`, and `monitors bulk update`
  document in their help, and in the `monitors bulk` topic help, that these
  writes report acceptance rather than completion: the API answers `success`
  for every matched monitor as soon as the write is accepted, returns no
  operation id, and offers nothing that distinguishes queued from applied, so
  `monitors get` is the only way to confirm the new state. Behaviour is
  unchanged; a pipeline that paused monitors before a deploy could otherwise
  start deploying while they were still live.

### Fixed

- A heartbeat monitor's `url` and derived `pingUrl` are redacted in responses.
  `url` carries the token its ping endpoint is built from, so anyone holding
  either can report the heartbeat and keep a dead service looking alive with no
  alert raised — and a single `monitors list` previously put every heartbeat
  token on the account into CI logs and agent transcripts. Redaction is keyed on
  the monitor rather than the field name, so `url` on every other type still
  prints as the target address it is. `--reveal-secrets` shows both, and `--raw`
  is unchanged.
- A reader that closes stdout early, as `| head`, `| head -c`, and `| grep -q`
  do, no longer produces a `Detected unsettled top-level await` warning on
  stderr and exit code 13. The CLI now treats the broken pipe as the end of its
  output and exits 0, or with the exit code the command had already decided on.
  Output delivered before the reader left is unchanged, and a failure is still
  reported on stderr.

## [0.3.0] - 2026-07-29

### Added

- `uptimerobot skills install` confirms and launches the external `npx skills`
  installer for the UptimeRobot AI skill collection.
- `--reveal-secrets` prints credential fields in a response instead of
  redacting them.
- `--dry-run` on `status-pages create` and `status-pages update`. Both compile a
  JSON request body, so the flag was missing only because it was gated on the
  documented content type rather than on what the command can actually send.
- `uptimerobot help <command-or-topic>` prints that command's or topic's help,
  matching `uptimerobot <command-or-topic> --help`. It previously failed with
  `INVALID_INPUT`.

### Fixed

- Recognizable credential fields in a response, such as `httpPassword`, are
  redacted in JSON, JSONL, table, and plain output; they previously printed in
  cleartext, so credentials reached CI logs and agent transcripts. A stderr
  notice names the redacted fields. `--raw` stays unredacted as an explicit
  escape hatch.
- `monitors bulk pause`, `monitors bulk start`, and `monitors bulk update` now
  exit non-zero when the API reports failed items. These endpoints answer
  HTTP 201 regardless of the per-monitor outcome, so a run in which every item
  failed previously exited `0` with nothing on stderr. The results still print
  on stdout; the failed entries are now also reported in the error envelope's
  `details` on stderr, with exit code `1` (`BULK_FAILED`) when every item
  failed and `3` (`BULK_PARTIAL_FAILURE`) when only some did.
- `status-pages create` and `status-pages update` now send `application/json`
  unless `--file` is passed. They previously always sent `multipart/form-data`,
  which flattened `monitorIds` and `tagIds` into repeated scalar fields — a
  single ID was rejected with `monitorIds must be an array` — and collapsed
  `customSettings` into one JSON string field, so pages were created empty and
  unstyled.
- With `--file`, arrays are now sent as `key[]` and nested objects as dotted
  paths, so a logo or icon upload no longer corrupts the rest of the body.
- Unknown-command errors name the command the way the CLI accepts it. A miss
  such as `uptimerobot monitors lst` reported `command monitors:lst not found`,
  suggesting a colon syntax the CLI does not accept, in both machine and human
  output.
- `uptimerobot monitors --help` describes the `monitors create` topic as
  "Create a monitor of a given type" instead of borrowing the summary of its
  first subcommand ("Create a monitor (API)"), which made the topic look like
  it only created API monitors. `monitors stats response-time` is now described
  explicitly too, so `monitors stats --help` distinguishes the topic from the
  command of the same name.

## [0.2.0] - 2026-07-28

### Removed

- The `user get` alias. Use `uptimerobot user me` instead — `user get` was a
  hand-written alias for the same `/v3/user/me` endpoint.

## [0.1.2] - 2026-07-27

### Added

- `uptimerobot help` prints the same command overview as `uptimerobot --help`,
  which previously failed with `INVALID_INPUT`.

### Changed

- `auth login` and the `auth` help topic now show where to create an API key,
  so first-time users know where to get one.
- Monitor `interval` now accepts a minimum of 15 seconds (was 30), matching the
  published API contract.

### Fixed

- `auth login` returns to the shell after the API key is submitted at the masked
  prompt; it previously hung until interrupted with Ctrl+C.

## [0.1.0] - 2026-07-24

### Added

- Interactive `auth login`: when no `--api-key` or `UPTIMEROBOT_API_KEY` is
  provided, an interactive terminal prompts for the key with masked input;
  agents and non-interactive processes receive `AUTH_REQUIRED` with guidance.
- Warned plaintext credential fallback: when no OS keyring is available,
  `auth login` stores the validated API key in a `0600` config file and
  prints the exact location; `auth status` reports the storage backend and
  `auth logout` clears both backends.
- Node.js version preflight: a clear message and exit 1 on Node versions older
  than 22.12.0 instead of a stack trace.
- `--api-key` validation during `auth login` now carries the CLI's attribution
  headers and a 10-second timeout.

### Changed

- Numeric path and query parameters are sent with their exact spelling, so
  64-bit IDs and cursors no longer lose precision through JavaScript numbers.
- Table columns align and truncate by terminal display width; CJK and emoji in
  resource names no longer break alignment.
- `auth login`, `auth status`, and `auth logout` follow the same output
  contract as generated commands: JSON when piped, agent-driven, or requested.
- The published package no longer contains TypeScript declarations, source
  maps, or internal documentation (108 files / 81 KB, down from 420 / 164 KB).

### Removed

- Runtime dependency on zod; parameter validation is now dependency-free.
- Internal research and planning documents from the repository and package.

### Security

- Redirects are followed manually and the origin is re-checked at every hop
  before credentials are attached; cross-origin redirects are refused.

[Unreleased]: https://github.com/uptimerobot/uptimerobot-cli/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/uptimerobot/uptimerobot-cli/compare/v0.3.0...v1.0.0
[0.3.0]: https://github.com/uptimerobot/uptimerobot-cli/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/uptimerobot/uptimerobot-cli/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/uptimerobot/uptimerobot-cli/compare/v0.1.0...v0.1.2
[0.1.0]: https://github.com/uptimerobot/uptimerobot-cli/releases/tag/v0.1.0
