import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../src/lib/redact-secrets.js';

const PING_URL =
  'https://heartbeat.uptimerobot.com/m803704830-997c8970ac0fcdffd5f5702754307572c377f8e6';

const HEARTBEAT = {
  friendlyName: 'cron-nightly',
  heartbeatUrl: PING_URL,
  id: 803704830,
  pingUrl: PING_URL,
  type: 'HEARTBEAT',
  url: '997c8970ac0fcdffd5f5702754307572c377f8e6',
};

const HTTP = {
  friendlyName: 'checkout',
  heartbeatUrl: null,
  id: 1,
  type: 'HTTP',
  url: 'https://checkout.example.com',
};

describe('heartbeat token redaction', () => {
  // heartbeatUrl is the API's name for the same endpoint as pingUrl, so hiding
  // only one of them would hide nothing.
  it('redacts the token and both names of the ping URL', () => {
    const { redacted, value } = redactSecrets(HEARTBEAT);

    expect(value).toEqual({
      ...HEARTBEAT,
      heartbeatUrl: '[REDACTED]',
      pingUrl: '[REDACTED]',
      url: '[REDACTED]',
    });
    expect(redacted).toEqual(['heartbeatUrl', 'pingUrl', 'url']);
  });

  // The same field name is a plain target address on every other monitor type,
  // which is why this is keyed on the record rather than added to the
  // sensitive-name list.
  it('leaves url and heartbeatUrl alone on monitors that are not heartbeats', () => {
    const { redacted, value } = redactSecrets(HTTP);

    expect(value).toEqual(HTTP);
    expect(redacted).toEqual([]);
  });

  it('redacts only the heartbeats in a mixed collection, naming their paths', () => {
    const { redacted, value } = redactSecrets({ items: [HTTP, HEARTBEAT], nextCursor: null });

    expect(value).toEqual({
      items: [
        HTTP,
        { ...HEARTBEAT, heartbeatUrl: '[REDACTED]', pingUrl: '[REDACTED]', url: '[REDACTED]' },
      ],
      nextCursor: null,
    });
    expect(redacted).toEqual(['items[1].heartbeatUrl', 'items[1].pingUrl', 'items[1].url']);
  });
});
