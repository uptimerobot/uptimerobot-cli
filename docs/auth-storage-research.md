# Authentication storage research

Research date: 2026-07-11. Sources are limited to official documentation and repositories.

## Executive summary

- **Stripe CLI now uses a hybrid design.** It prefers the native OS credential store for its most sensitive credentials, but falls back to an unencrypted JSON file with `0600` permissions when the keyring is unavailable, and tells the user that this happened. Less-sensitive/test credentials and profile metadata remain in `config.toml` with `0600` permissions.
- **Sentry CLI uses a plaintext configuration file on every platform.** On Unix it creates/replaces that file with mode `0600`; it does not use Keychain, Credential Manager, or Secret Service. CI normally supplies `SENTRY_AUTH_TOKEN`.
- **`@napi-rs/keyring` is well covered on macOS and Windows and reasonable on desktop Ubuntu.** Its current Linux implementation tries Secret Service first and then falls back to Linux kernel keyutils. That fallback is suitable for headless Linux but is only an in-memory cache: it does not survive reboot, so it cannot alone fulfill a promise that `auth login` persists indefinitely across sessions.
- For UptimeRobot, the most predictable first version is: `auth login --api-key <key>`, validate before saving, prefer the OS keyring, and either (a) fail clearly on storage failure and direct CI/headless users to `UPTIMEROBOT_API_KEY`, or (b) offer an **explicit, warned-about** `0600` plaintext fallback. Do not silently fall back. (Option (b) was later implemented; see the implementation decision at the end of this document.)

## Stripe CLI

### Login UX

The current Stripe command has three login paths:

- `stripe login` starts browser-based login for an interactive terminal.
- `stripe login --interactive` securely prompts for an existing API key when a browser is unavailable.
- Non-interactive/agent use has a two-step browser pairing flow (`--non-interactive`, then `--complete`); the command help also recommends `STRIPE_API_KEY` or the global `--api-key` override for scripts and agents.

Stripe also provides `stripe status`, `stripe logout`, `stripe logout --all`, plus `stripe login list` and `stripe login switch` for profiles. The official installation documentation describes inline `--api-key` use as an alternative for individual commands, not as the primary persistent-login UX. Sources: [login command](https://github.com/stripe/stripe-cli/blob/44488cb6ef1e92152146ae9e1bb5870717c46885/pkg/cmd/login.go), [logout command](https://github.com/stripe/stripe-cli/blob/44488cb6ef1e92152146ae9e1bb5870717c46885/pkg/cmd/logout.go), [official install/login documentation](https://docs.stripe.com/stripe-cli/install).

### Storage and permissions

Stripe uses `XDG_CONFIG_HOME/stripe`, falling back to `~/.config/stripe`. Its normal profile file is `config.toml`; Stripe explicitly sets and repairs its mode to `0600`. The current source initializes a credential store backed by `zalando/go-keyring`, with an unencrypted `credentials.json` fallback. The fallback creates its directory as `0700`, writes the file as `0600`, and emits a visible warning after login. Sources: [Stripe configuration implementation](https://github.com/stripe/stripe-cli/blob/44488cb6ef1e92152146ae9e1bb5870717c46885/pkg/config/config.go), [credential-store implementation](https://github.com/stripe/stripe-cli/blob/44488cb6ef1e92152146ae9e1bb5870717c46885/pkg/keyring/keyring.go), [fallback warning](https://github.com/stripe/stripe-cli/blob/44488cb6ef1e92152146ae9e1bb5870717c46885/pkg/login/login.go).

The current implementation is nuanced rather than “everything goes in the keychain”:

- Test-mode API keys are stored in `config.toml`.
- Live-mode API keys are redacted in `config.toml` and the full value is stored in the credential store.
- User access/session credentials are stored in the credential store.

Source: [Stripe profile storage](https://github.com/stripe/stripe-cli/blob/44488cb6ef1e92152146ae9e1bb5870717c46885/pkg/config/profile.go).

The underlying Go keyring uses macOS Keychain, Windows Credential Manager, and Secret Service over D-Bus on Linux/BSD. Secret Service normally requires a desktop keyring such as GNOME Keyring and a `login` collection. Source: [`zalando/go-keyring` official repository](https://github.com/zalando/go-keyring/blob/master/README.md).

### Headless Linux and CI

On a normal Ubuntu desktop, the Secret Service backend is generally available through GNOME Keyring. On minimal Ubuntu, SSH-only machines, containers, or CI runners, D-Bus/Secret Service may be absent or locked. Stripe handles this with a three-second timeout around keyring operations and then uses the warned-about `0600` JSON fallback. Stripe’s own Docker documentation additionally demonstrates supplying live keys through a password store or per-command `--api-key`. Sources: [Stripe keyring timeout/fallback](https://github.com/stripe/stripe-cli/blob/44488cb6ef1e92152146ae9e1bb5870717c46885/pkg/keyring/keyring.go), [Stripe CLI Docker guidance](https://github.com/stripe/stripe-cli#password-store-setup-with-docker).

## Sentry CLI

### Login UX

`sentry-cli login` offers to open a browser so the user can create a token, securely prompts for the token, verifies it against the API, and then saves it. `sentry-cli login --auth-token <token>` accepts a token directly, and `--global` selects global rather than project-local storage. `sentry-cli info` reports authentication information. There is no keychain-specific UX or logout command in the current command tree. Sources: [Sentry login implementation](https://github.com/getsentry/sentry-cli/blob/0f55bf46f56e544503dc355eb7df3336414d49c2/src/commands/login.rs), [login help integration fixture](https://github.com/getsentry/sentry-cli/blob/0f55bf46f56e544503dc355eb7df3336414d49c2/tests/integration/_cases/login/login-help.trycmd), [info command](https://github.com/getsentry/sentry-cli/blob/0f55bf46f56e544503dc355eb7df3336414d49c2/src/commands/info.rs).

### Storage and permissions

Sentry stores `[auth] token=...` directly in an INI file. Its global lookup prefers an existing `~/.sentryclirc`, otherwise an existing OS config-directory file at `sentry/sentrycli.ini`, and otherwise defaults to `~/.sentryclirc`. It also searches upward from the working directory for a project `.sentryclirc` or `sentrycli.ini`. On non-Windows platforms, saves use an atomic temporary file created with mode `0600`; a test verifies that an existing `0644` file is replaced with `0600`. Windows relies on the user-profile filesystem ACLs because Unix modes do not apply. Sources: [Sentry configuration implementation and permission test](https://github.com/getsentry/sentry-cli/blob/0f55bf46f56e544503dc355eb7df3336414d49c2/src/config.rs), [configuration path constants](https://github.com/getsentry/sentry-cli/blob/0f55bf46f56e544503dc355eb7df3336414d49c2/src/constants.rs).

### Headless Linux and CI

Sentry avoids all desktop/keyring dependencies. `SENTRY_AUTH_TOKEN` takes precedence over the token stored in the INI file, making it the natural CI/container path; `--auth-token` is also available. This is operationally robust on Ubuntu servers and Windows runners, but the persisted token is plaintext at rest. Source: [Sentry authentication precedence](https://github.com/getsentry/sentry-cli/blob/0f55bf46f56e544503dc355eb7df3336414d49c2/src/config.rs).

## `@napi-rs/keyring`

### Platform and runtime support

Version 1.3.0 publishes prebuilt Node-API binaries for macOS x64/arm64; Windows x64/x86/arm64; Linux x64/arm64 GNU and musl, plus ARMv7 and RISC-V; and FreeBSD x64. Its declared Node requirement is `>=10`, so Node 22/24 is covered. Its CI runtime-tests Node 22 and 24 on macOS arm64, Windows x64, and Ubuntu x64. The Ubuntu test explicitly installs and starts GNOME Keyring and D-Bus; therefore it proves desktop Secret Service behavior but does **not** test a bare headless environment. Sources: [`package.json`](https://github.com/Brooooooklyn/keyring-node/blob/f330874629298929eda4c4729d1987c7449b51ca/package.json), [CI matrix](https://github.com/Brooooooklyn/keyring-node/blob/f330874629298929eda4c4729d1987c7449b51ca/.github/workflows/CI.yml).

The native backends are:

- macOS: Apple Keychain.
- Windows: Windows native credential store/Credential Manager.
- Linux: Secret Service first; if initialization fails, Linux kernel keyutils.

Sources: [platform store setup](https://github.com/Brooooooklyn/keyring-node/blob/f330874629298929eda4c4729d1987c7449b51ca/src/entry.rs), [Linux fallback selection](https://github.com/Brooooooklyn/keyring-node/blob/f330874629298929eda4c4729d1987c7449b51ca/src/linux_credential_builder.rs), [Rust backend dependencies](https://github.com/Brooooooklyn/keyring-node/blob/f330874629298929eda4c4729d1987c7449b51ca/Cargo.toml).

### Linux caveat

The kernel-keyutils fallback is valuable because it is available without GNOME/KDE or D-Bus, but it is not durable disk storage. Its upstream documentation says the facility is completely in memory, does not survive reboot, and applications must handle a missing credential by re-prompting or reloading it. Consequently, `@napi-rs/keyring` can work on headless Linux, but a successful `setPassword()` does not necessarily mean “remember this permanently.” Source: [`linux-keyutils-keyring-store` persistence documentation](https://docs.rs/linux-keyutils-keyring-store/latest/src/linux_keyutils_keyring_store/lib.rs.html#39-46).

Another integration caveat is that synchronous `getPassword()` returns `null` for any backend error, not only “not found,” so the CLI should test storage operations rather than treating every failure as logged out. (The asynchronous API similarly resolves to `undefined`.) Sources: [`Entry` implementation](https://github.com/Brooooooklyn/keyring-node/blob/f330874629298929eda4c4729d1987c7449b51ca/src/entry.rs), [generated TypeScript declarations](https://github.com/Brooooooklyn/keyring-node/blob/f330874629298929eda4c4729d1987c7449b51ca/index.d.ts).

## Recommendation for UptimeRobot v1

Use the explicit command requested for this version:

```bash
uptimerobot auth login --api-key <key>
```

The implementation should validate the key before storage, redact it from all output, and resolve credentials in this order:

1. `--api-key`
2. `UPTIMEROBOT_API_KEY`
3. stored credential

For persistence:

1. Use `@napi-rs/keyring` on macOS, Windows, and Linux.
2. After writing, immediately read back the credential and return a clear storage error if that fails.
3. On Linux, distinguish Secret Service from the kernel-keyutils fallback if the library exposes enough backend information; currently its public API does not make that distinction obvious.
4. Do not promise durable persistence on headless Linux when only keyutils is available.
5. Choose one explicit product policy:
   - **Security-first:** fail `auth login` and tell the user to configure Secret Service or use `UPTIMEROBOT_API_KEY`.
   - **Convenience-first, Stripe-style:** ask for/require an explicit plaintext-fallback opt-in, store beneath the CLI config directory with directory `0700` and file `0600`, and print the exact location and warning.

For this CLI, the security-first policy is the cleaner default. CI and agents already have a first-class environment-variable path, while macOS, Windows, and Ubuntu desktop users receive the intended persistent keychain experience. OAuth can later reuse the same credential-store abstraction without changing generated API commands.

## Implementation decision (2026-07-21)

The shipped policy is the **convenience-first, Stripe-style** option above:

1. `auth login` validates the key, then tries the OS keyring first, with a three-second timeout around keyring operations (mirroring Stripe's guard against hung D-Bus sessions on Linux).
2. If the keyring is unavailable or fails the read-back check, the key is written to `credentials.json` beneath the CLI config directory (`UPTIMEROBOT_CONFIG_DIR`, else `XDG_CONFIG_HOME/uptimerobot`, else `~/.config/uptimerobot`) with directory `0700` and file `0600` permissions, written atomically and verified by read-back.
3. The fallback is never silent: `auth login` prints the exact file location and a warning, and `auth status` reports `source: "file"` with the path in human output.
4. Reads prefer the keyring so a later keyring-backed login takes precedence over a stale file; `auth logout` removes the credential from both backends.
5. Only if both backends fail does login fail with `AUTH_STORAGE_UNAVAILABLE`, pointing at `UPTIMEROBOT_API_KEY`.
