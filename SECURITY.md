# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities through GitHub's private vulnerability
reporting: <https://github.com/uptimerobot/uptimerobot-cli/security/advisories/new>

Do **not** open a public issue for a vulnerability, and never include an API
key, credential file contents, or other secrets in any report — sanitize
command output before sharing it. We aim to acknowledge reports within three
business days.

## Credential storage notes

- The CLI validates API keys before storing them and persists them in the
  operating system's credential store (macOS Keychain, Windows Credential
  Manager, or an available Linux keyring).
- When no OS keyring is available, the key falls back to a plaintext
  `credentials.json` with owner-only `0600` permissions; login reports the
  file location when this happens. `UPTIMEROBOT_API_KEY` avoids persistent
  storage entirely.
- If you believe a key was exposed (for example through shell history, logs,
  or a pasted error), revoke it in the UptimeRobot dashboard first, then
  report the circumstances.
