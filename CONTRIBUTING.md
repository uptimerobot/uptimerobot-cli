# Contributing

The UptimeRobot CLI is the official command-line interface for UptimeRobot,
developed and maintained by the UptimeRobot team. Most of the command surface is
generated from the [published UptimeRobot API contract](https://cdn.uptimerobot.com/api/openapi.yaml),
so the CLI tracks the API directly.

## How to help

We are not actively seeking external code contributions, but your feedback is
welcome:

- **Found a bug, or have a feature request?**
  [Open an issue](https://github.com/uptimerobot/uptimerobot-cli/issues/new/choose).

If you would like to propose a code change, please **open an issue to discuss it
first**. Unsolicited pull requests may not be reviewed.

## Security

Do not report security vulnerabilities through public issues. See
[SECURITY.md](SECURITY.md) for how to disclose them privately.

## Development

If you are working on an approved change, the setup is:

Prerequisites — Node.js 22.12 or newer and [pnpm](https://pnpm.io/).

```sh
pnpm install
pnpm build          # compile to dist/
pnpm lint           # oxlint
pnpm typecheck      # tsc, no emit
pnpm format:check   # oxfmt --check
pnpm test           # build, then run the test suite
```

CI runs the same checks on Node 22 and 24; run them locally before opening a pull
request.

The command tree is generated from `openapi/openapi.yaml` via
`pnpm openapi:generate`. Generated command files and operation metadata are not
edited by hand.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `docs:`, `chore:`, and so on).

## Code of Conduct

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md). By participating,
you are expected to uphold it.
