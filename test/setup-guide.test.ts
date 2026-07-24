import { describe, expect, it } from 'vitest';
import type { CliInvocation } from '../src/lib/agent-setup/cli-invocation.js';
import { renderSetupGuide } from '../src/lib/agent-setup/setup-guide.js';

const ON_PATH: CliInvocation = { command: 'uptimerobot', source: 'override' };
const VIA_NPX: CliInvocation = { command: 'npx @uptimerobot/cli', source: 'npx' };

describe('renderSetupGuide', () => {
  const guide = renderSetupGuide(ON_PATH);

  // Each of these is a guardrail the guide exists to carry. Asserting the exact
  // substring is what stops a later edit from silently dropping one.
  it.each([
    ['the agent-setup tag instruction', '--tag-names agent-setup'],
    ['the create flag, not the list filter', '--tag-names'],
    ['a warning that --tags is not for create', 'never `--tags` on create'],
    ['the fail-safe heartbeat ping', '|| true'],
    [
      'the canonical ping verbatim',
      'curl -fsS --retry 3 --max-time 10 "<url>" > /dev/null || true',
    ],
    [
      'the braced crontab form with the push URL inlined',
      '&& { curl -fsS --retry 3 --max-time 10 "<full-push-url>" > /dev/null || true; }',
    ],
    [
      'the non-set-e EXIT trap variant carrying the default-empty heartbeat var',
      'trap \'rc=$?; hb="${UPTIMEROBOT_BACKUP_HEARTBEAT:-}";',
    ],
    [
      'the default-empty heartbeat expansion (the set -u fail-safe bug fix)',
      'hb="${UPTIMEROBOT_BACKUP_HEARTBEAT:-}"',
    ],
    [
      'the non-empty guard that skips the ping when the URL is unset',
      'if [ -n "$hb" ]; then curl -fsS --retry 3 --max-time 10 "$hb" > /dev/null || true; fi',
    ],
    ['the required per-surface inventory line before the proposal', 'Open with an inventory line'],
    [
      'the read-only probing allowance for user-confirmed-public URLs',
      'Read-only probing of a URL the user has confirmed is public is allowed',
    ],
    ['static-site generators in the frameworks-it-misses list', 'static-site generators'],
    ['a concrete static-site generator example', 'SvelteKit'],
    ['the base-URL-first rule', 'Ask the user for the base URL first'],
    ['the cap-of-10 rule', 'Cap at 10 monitors per run'],
    ['the confirm-before-create rule', 'before creating any monitor'],
  ])('states %s', (_label, substring) => {
    expect(guide).toContain(substring);
  });

  it('names all nine monitor types', () => {
    for (const type of [
      'http',
      'keyword',
      'ping',
      'port',
      'heartbeat',
      'dns',
      'api',
      'udp',
      'visual-comparison',
    ]) {
      expect(guide).toContain(`\`${type}\``);
    }
  });

  it('templates every command through a bare invocation on PATH', () => {
    expect(guide).toContain('uptimerobot monitors create http');
    expect(guide).toContain('uptimerobot monitors create heartbeat');
    expect(guide).toContain('uptimerobot monitors list --tags agent-setup --json');
    expect(guide).toContain('uptimerobot verify');
    expect(guide).not.toContain('npx @uptimerobot/cli');
  });

  it('templates every command through the npx form when the CLI is not on PATH', () => {
    const viaNpx = renderSetupGuide(VIA_NPX);
    expect(viaNpx).toContain('npx @uptimerobot/cli monitors create http');
    expect(viaNpx).toContain('npx @uptimerobot/cli monitors create heartbeat');
    expect(viaNpx).toContain('npx @uptimerobot/cli verify');
    // The bare binary must never leak into an npx caller's guide as a command
    // (the `@uptimerobot/cli` in the npx form does not match either of these).
    expect(viaNpx).not.toContain('uptimerobot monitors create');
    expect(viaNpx).not.toContain('uptimerobot verify');
  });

  it('carries a NestJS resolution checklist before any nestjs path is trusted', () => {
    expect(guide).toContain('NestJS resolution checklist');
    expect(guide).toContain('setGlobalPrefix');
    expect(guide).toContain('RouterModule.register(');
    expect(guide).toContain('@UseGuards');
    // The coverage wording no longer implies NestJS is undetected.
    expect(guide).toContain('NestJS is detected but shallow');
  });

  it('drops the pre-flight readiness probe entirely', () => {
    expect(guide).not.toContain('Before you start');
    expect(guide).not.toContain('monitors list --limit 1');
    expect(guide).not.toContain('--version');
  });

  it('collapses monitor creation to a single confirmation, no separate yes', () => {
    expect(guide).toContain('One confirmation, not a ceremony');
    expect(guide).toContain('**is** the go-ahead');
    expect(guide).toContain('No separate "type yes" step');
    // The strict shown-diff-then-yes gate stays, but only for the file edits.
    expect(guide).toContain('one file, one diff, one yes');
  });

  it('tells the agent to attach an alert contact so monitors are not silent', () => {
    expect(guide).toContain('--assigned-alert-contacts');
    expect(guide).toContain('alert-contacts list');
    expect(guide).toContain('the monitor is silent');
  });
});
