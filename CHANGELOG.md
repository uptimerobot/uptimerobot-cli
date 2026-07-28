# Changelog

All notable changes to the UptimeRobot CLI are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

The public contract covers the command tree and flags, machine-readable output
shapes, error codes, exit codes, and environment variables. Human table layout
may change in minor releases.

## [Unreleased]

### Added

- `uptimerobot skills install` confirms and launches the external `npx skills`
  installer for the UptimeRobot AI skill collection.
- `--reveal-secrets` prints credential fields in a response instead of
  redacting them.
- `--dry-run` on `status-pages create` and `status-pages update`. Both compile a
  JSON request body, so the flag was missing only because it was gated on the
  documented content type rather than on what the command can actually send.

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

[Unreleased]: https://github.com/uptimerobot/uptimerobot-cli/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/uptimerobot/uptimerobot-cli/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/uptimerobot/uptimerobot-cli/compare/v0.1.0...v0.1.2
[0.1.0]: https://github.com/uptimerobot/uptimerobot-cli/releases/tag/v0.1.0
