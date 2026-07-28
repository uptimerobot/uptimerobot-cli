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
    ['the default cap rule', 'Cap at 50 monitors per run'],
    ['the confirm-before-create rule', 'before creating any monitor'],
    ['the auth-gate check heading', 'Auth-gate check'],
    ['the never-read-a-secret rule for detection', 'never read a secret value'],
    ['the Express/Fastify auth-middleware signal', 'auth middleware on the route'],
    ['the Django/DRF signal', 'permission_classes'],
    ['the Rails signal', 'before_action :authenticate'],
    ['the Laravel signal', "->middleware('auth')"],
    ['the FastAPI signal', 'Depends('],
    ['the Spring signal', '@PreAuthorize'],
    ['the prefer-a-public-route remedy', 'Prefer a public alternative'],
    ['the user-supplied-credential path via existing flags', '--auth-type HTTP_BASIC'],
    ['the custom-header remedy naming the header form', 'X-Health-Token'],
    ['the coverage principle that replaced the one-or-two rule', 'distinct failure mode'],
    ['what counts as an independent failure', 'a different critical dependency'],
    ['the collapse rule for near-duplicates', 'one template are one monitor'],
    ['the one-heartbeat-per-job rule', 'one heartbeat per job'],
    ['heartbeats being the cheapest coverage', 'cheapest coverage'],
    ['an inventory example that proposes every job', 'every job gets a heartbeat'],
    ['the burden-of-proof on proposing few', 'you are under-proposing'],
  ])('states %s', (_label, substring) => {
    expect(guide).toContain(substring);
  });

  // The cap was never the real limit — this prose was. A run that restores it
  // silently undoes the whole point of raising the ceiling.
  it('no longer tells the agent to propose only one or two monitors', () => {
    expect(guide).not.toContain('one or two that prove the system works');
    expect(guide).not.toContain('does not want 60 monitors');
  });

  it('no longer models an inventory that proposes a fraction of each surface', () => {
    expect(guide).not.toContain('25 URLs in the sitemap, 2 proposed');
    expect(guide).not.toContain('Cron: 3\njobs, 1 proposed');
  });

  it('defaults the monitor cap to 50', () => {
    expect(renderSetupGuide(ON_PATH)).toContain('Cap at 50 monitors per run');
  });

  it('interpolates a custom cap everywhere it appears', () => {
    const capped = renderSetupGuide(ON_PATH, { maxMonitors: 3 });

    expect(capped).toContain('Cap at 3 monitors per run');
    expect(capped).toContain('capped at 3');
    expect(capped).toContain('over the cap of 3');
    expect(capped).not.toContain('Cap at 50 monitors per run');
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
