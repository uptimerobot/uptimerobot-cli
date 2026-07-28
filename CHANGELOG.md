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
