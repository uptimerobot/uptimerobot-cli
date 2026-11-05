import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_CLIENTS,
  SKIP_PATTERNS,
  VENDORS,
  type VendorEntry,
  classifyPackage,
  matchPackage,
  normalizeCatalogName,
} from '../src/lib/scan/vendors.js';

describe('the vendor map data', () => {
  it('names every provider once, with a search term and a class', () => {
    const names = VENDORS.map((entry) => entry.catalogName);
    expect(new Set(names).size).toBe(names.length);
    for (const entry of VENDORS) {
      expect(entry.catalogName.trim()).not.toBe('');
      expect(entry.searchTerm.trim()).not.toBe('');
      expect(['runtime', 'build-time']).toContain(entry.class);
      expect(entry.signals.length).toBeGreaterThan(0);
    }
  });

  it('covers the providers the skill fixtures expect', () => {
    for (const name of [
      'AWS',
      'Google Cloud',
      'Vercel',
      'Stripe',
      'Supabase',
      'Sentry',
      'Resend',
      'SendGrid',
      'Twilio',
      'GitHub',
    ]) {
      expect(VENDORS.find((entry) => entry.catalogName === name)).toBeDefined();
    }
  });

  it('never lists the same package signal under two providers', () => {
    const seen = new Map<string, string>();
    for (const entry of VENDORS) {
      for (const signal of entry.signals) {
        if (signal.kind !== 'package') continue;
        const key = `${signal.ecosystems?.join(',') ?? '*'}:${signal.pattern}`;
        expect(seen.get(key) ?? entry.catalogName).toBe(entry.catalogName);
        seen.set(key, entry.catalogName);
      }
    }
  });

  it('keeps skipped packages and protocol clients out of the map', () => {
    for (const name of [
      ...SKIP_PATTERNS.map((pattern) => pattern.replace('*', 'x')),
      ...PROTOCOL_CLIENTS,
    ]) {
      expect(matchPackage('npm', name)).toBeUndefined();
      expect(matchPackage('pip', name)).toBeUndefined();
    }
  });

  it('gives every non-package signal a non-empty pattern', () => {
    for (const entry of VENDORS) {
      for (const signal of entry.signals) {
        expect(signal.pattern.trim()).not.toBe('');
        if (signal.kind === 'hostname') expect(signal.pattern).toMatch(/^(\*\.)?[a-z0-9.-]+$/);
      }
    }
  });

  it('lists no package pattern that an earlier entry already catches', () => {
    const ecosystems = ['npm', 'pip', 'go', 'gem', 'composer', 'cargo'] as const;
    for (const entry of VENDORS) {
      for (const signal of entry.signals) {
        if (signal.kind !== 'package') continue;
        const probe = signal.pattern.replace('*', 'probe');
        for (const ecosystem of signal.ecosystems ?? ecosystems) {
          expect(matchPackage(ecosystem, probe)?.entry.catalogName).toBe(entry.catalogName);
        }
      }
    }
  });

  it('marks only the code hosts and CI providers as build-time', () => {
    const buildTime = VENDORS.filter((entry) => entry.class === 'build-time').map(
      (entry) => entry.catalogName,
    );
    expect(buildTime.sort()).toEqual(['Bitbucket', 'CircleCI', 'GitHub', 'GitLab']);
  });
});

describe('matchPackage', () => {
  const name = (match: { entry: VendorEntry } | undefined) => match?.entry.catalogName;

  it('matches exact names and scoped prefixes', () => {
    expect(name(matchPackage('npm', 'stripe'))).toBe('Stripe');
    expect(name(matchPackage('npm', '@supabase/supabase-js'))).toBe('Supabase');
    expect(name(matchPackage('npm', '@sentry/nextjs'))).toBe('Sentry');
    expect(name(matchPackage('npm', '@aws-sdk/client-s3'))).toBe('AWS');
    expect(name(matchPackage('npm', 'launchdarkly-node-server-sdk'))).toBe('LaunchDarkly');
  });

  it('is case-insensitive and treats pip underscores, dots and extras as dashes', () => {
    expect(name(matchPackage('pip', 'Sentry_SDK'))).toBe('Sentry');
    expect(name(matchPackage('pip', 'google.cloud.storage'))).toBe('Google Cloud');
    expect(name(matchPackage('pip', 'boto3[crt]'))).toBe('AWS');
  });

  it('honours ecosystem restrictions', () => {
    expect(name(matchPackage('pip', 'anthropic'))).toBe('Anthropic');
    expect(matchPackage('npm', 'anthropic')).toBeUndefined();
    expect(name(matchPackage('npm', '@anthropic-ai/sdk'))).toBe('Anthropic');
    expect(name(matchPackage('gem', 'stripe'))).toBe('Stripe');
  });

  it('matches Go module paths by prefix', () => {
    expect(name(matchPackage('go', 'cloud.google.com/go/storage'))).toBe('Google Cloud');
    expect(name(matchPackage('go', 'github.com/stripe/stripe-go/v81'))).toBe('Stripe');
    expect(name(matchPackage('go', 'github.com/twilio/twilio-go'))).toBe('Twilio');
    expect(matchPackage('go', 'github.com/acme/billing')).toBeUndefined();
  });

  it('does not match a prefix pattern against a longer unrelated name', () => {
    expect(matchPackage('npm', 'stripe-fake')).toBeUndefined();
    expect(matchPackage('npm', 'my-launchdarkly-wrapper')).toBeUndefined();
    expect(matchPackage('go', 'example.com/cloud.google.com/go/storage')).toBeUndefined();
    expect(matchPackage('npm', '@shopify/polaris')).toBeUndefined();
    expect(matchPackage('npm', '@mapbox/tilebelt')).toBeUndefined();
    expect(name(matchPackage('npm', '@mapbox/mapbox-sdk'))).toBe('Mapbox');
  });

  it('classifies with skip before protocol client before vendor', () => {
    expect(classifyPackage('npm', '@shopify/polaris')).toEqual({
      outcome: 'skip',
      name: '@shopify/polaris',
    });
    expect(classifyPackage('pip', 'Psycopg[binary]')).toEqual({
      outcome: 'protocol-client',
      name: 'psycopg',
    });
    expect(classifyPackage('npm', 'left-pad')).toEqual({ outcome: 'unmapped', name: 'left-pad' });
    expect(classifyPackage('gem', 'stripe')).toMatchObject({ outcome: 'vendor', name: 'stripe' });
  });

  it('normalizes catalog names the way the resolver compares them', () => {
    expect(normalizeCatalogName(' Fly.io ')).toBe('flyio');
    expect(normalizeCatalogName('Clerk Chat')).not.toBe(normalizeCatalogName('Clerk'));
  });
});
