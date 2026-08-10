import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../src/lib/redact-secrets.js';

const HEARTBEAT = {
  friendlyName: 'cron-nightly',
  id: 803704830,
  pingUrl: 'https://heartbeat.uptimerobot.com/m803704830-997c8970ac0fcdffd5f5702754307572c377f8e6',
  type: 'HEARTBEAT',
  url: '997c8970ac0fcdffd5f5702754307572c377f8e6',
};

const HTTP = { friendlyName: 'checkout', id: 1, type: 'HTTP', url: 'https://checkout.example.com' };

describe('heartbeat token redaction', () => {
  it('redacts the token and the ping URL it composes', () => {
    const { redacted, value } = redactSecrets(HEARTBEAT);

    expect(value).toEqual({
      ...HEARTBEAT,
      pingUrl: '[REDACTED]',
      url: '[REDACTED]',
    });
    expect(redacted).toEqual(['pingUrl', 'url']);
  });

  // The same field name is a plain target address on every other monitor type,
  // which is why this is keyed on the record rather than added to the
  // sensitive-name list.
  it('leaves url alone on monitors that are not heartbeats', () => {
    const { redacted, value } = redactSecrets(HTTP);

    expect(value).toEqual(HTTP);
    expect(redacted).toEqual([]);
  });

  it('redacts only the heartbeats in a mixed collection, naming their paths', () => {
    const { redacted, value } = redactSecrets({ items: [HTTP, HEARTBEAT], nextCursor: null });

    expect(value).toEqual({
      items: [HTTP, { ...HEARTBEAT, pingUrl: '[REDACTED]', url: '[REDACTED]' }],
      nextCursor: null,
    });
    expect(redacted).toEqual(['items[1].pingUrl', 'items[1].url']);
  });
});
