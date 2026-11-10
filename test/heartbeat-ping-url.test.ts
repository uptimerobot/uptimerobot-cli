import { describe, expect, it } from 'vitest';
import { withDerivedFields } from '../src/lib/response-curation.js';

const HEARTBEAT = {
  friendlyName: 'asdf123321',
  id: 803704830,
  type: 'HEARTBEAT',
  url: '997c8970ac0fcdffd5f5702754307572c377f8e6',
};

describe('derived heartbeat ping URL', () => {
  it('mirrors the ping URL the API returns as heartbeatUrl', () => {
    const fromApi = {
      ...HEARTBEAT,
      heartbeatUrl: 'https://heartbeat.example.com/m803704830-from-the-api',
    };

    expect(withDerivedFields(fromApi, {})).toEqual({
      ...fromApi,
      pingUrl: 'https://heartbeat.example.com/m803704830-from-the-api',
    });
  });

  // The override only steers the fallback composition; the API knows which
  // heartbeat host its own environment uses.
  it('prefers the API heartbeatUrl over an overridden host', () => {
    const fromApi = {
      ...HEARTBEAT,
      heartbeatUrl: 'https://heartbeat.example.com/m803704830-from-the-api',
    };
    const result = withDerivedFields(fromApi, {
      UPTIMEROBOT_HEARTBEAT_URL: 'https://hb.example.com/',
    }) as Record<string, unknown>;

    expect(result.pingUrl).toBe('https://heartbeat.example.com/m803704830-from-the-api');
  });

  it('composes the ping URL when the response has no heartbeatUrl', () => {
    expect(withDerivedFields(HEARTBEAT, {})).toEqual({
      ...HEARTBEAT,
      pingUrl:
        'https://heartbeat.uptimerobot.com/m803704830-997c8970ac0fcdffd5f5702754307572c377f8e6',
    });
  });

  it('derives the URL for every heartbeat in a collection and leaves others alone', () => {
    const http = { friendlyName: 'api', id: 1, type: 'HTTP', url: 'https://example.com' };
    const result = withDerivedFields({ items: [HEARTBEAT, http], nextCursor: null }, {});

    expect(result).toEqual({
      items: [expect.objectContaining({ pingUrl: expect.stringContaining('/m803704830-') }), http],
      nextCursor: null,
    });
  });

  // Whatever the API supplies has to win, or the derived value would shadow the
  // real one.
  it('leaves an API-supplied pingUrl in place', () => {
    const authoritative = { ...HEARTBEAT, pingUrl: 'https://heartbeat.example.com/from-the-api' };

    expect(withDerivedFields(authoritative, {})).toEqual(authoritative);
  });

  it('honours an overridden heartbeat host', () => {
    const result = withDerivedFields(HEARTBEAT, {
      UPTIMEROBOT_HEARTBEAT_URL: 'https://hb.example.com/',
    }) as Record<string, unknown>;

    expect(result.pingUrl).toBe(
      'https://hb.example.com/m803704830-997c8970ac0fcdffd5f5702754307572c377f8e6',
    );
  });

  // The token lives in `url`, which other monitor types use for a real target,
  // so the type check is what keeps the composition from firing on them.
  it.each([
    [
      'a non-heartbeat monitor',
      { heartbeatUrl: null, id: 1, type: 'HTTP', url: 'https://example.com' },
    ],
    ['a heartbeat with no token yet', { heartbeatUrl: null, id: 1, type: 'HEARTBEAT', url: '' }],
    ['a payload that is not a monitor', { message: 'ok' }],
  ])('adds nothing for %s', (_label, payload) => {
    expect(withDerivedFields(payload, {})).toEqual(payload);
  });
});
