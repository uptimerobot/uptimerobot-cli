import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../src/api/client.js';

describe('API client', () => {
  it('attributes requests made in CI', async () => {
    let observedRequest: Request | undefined;
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(async (request) => {
      observedRequest = request instanceof Request ? request : new Request(request);
      return new Response('{}', {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    });
    const client = createApiClient({
      apiKey: 'u123-secret',
      apiUrl: new URL('https://api.uptimerobot.com/v3'),
      environment: 'ci',
      fetchImplementation,
      mode: 'human',
      version: '0.1.0',
    });

    await client.request(new URL('https://api.uptimerobot.com/v3/monitors'), { method: 'GET' });

    expect({
      environment: observedRequest?.headers.get('x-uptimerobot-execution-environment'),
      userAgent: observedRequest?.headers.get('user-agent'),
    }).toEqual({
      environment: 'ci',
      userAgent: 'uptimerobot-cli/0.1.0 mode/human environment/ci',
    });
  });

  it('returns the response together with its parsed payload', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 42 }] }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    const client = createApiClient({
      apiKey: 'u123-secret',
      apiUrl: new URL('https://api.uptimerobot.com/v3'),
      environment: 'local',
      fetchImplementation,
      mode: 'human',
      version: '0.1.0',
    });

    const result = await client.request(new URL('https://api.uptimerobot.com/v3/monitors'), {
      method: 'GET',
    });

    expect({ payload: result.payload, status: result.response.status }).toEqual({
      payload: { data: [{ id: 42 }] },
      status: 200,
    });
  });

  it('returns a successful text body unchanged', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('ok', {
        headers: { 'content-type': 'text/plain' },
        status: 200,
      }),
    );
    const client = createApiClient({
      apiKey: 'u123-secret',
      apiUrl: new URL('https://api.uptimerobot.com/v3'),
      environment: 'local',
      fetchImplementation,
      mode: 'human',
      version: '0.1.0',
    });

    const result = await client.request(new URL('https://api.uptimerobot.com/v3/health'), {
      method: 'GET',
    });

    expect(result.payload).toBe('ok');
  });

  it('does not retry a non-transient HTTP error', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(JSON.stringify({ code: 'INVALID_TOKEN', message: 'Invalid token.' }), {
          headers: { 'content-type': 'application/json' },
          status: 401,
        }),
    );
    const client = createApiClient({
      apiKey: 'invalid',
      apiUrl: new URL('https://api.uptimerobot.com/v3'),
      environment: 'local',
      fetchImplementation,
      mode: 'human',
      version: '0.1.0',
    });

    const result = await client.request(new URL('https://api.uptimerobot.com/v3/monitors'), {
      method: 'GET',
    });

    expect({ payload: result.payload, requests: fetchImplementation.mock.calls.length }).toEqual({
      payload: { code: 'INVALID_TOKEN', message: 'Invalid token.' },
      requests: 1,
    });
  });

  it('preserves a raw HTTP error body', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('Token is required', {
        headers: { 'content-type': 'text/plain' },
        status: 401,
      }),
    );
    const client = createApiClient({
      apiKey: 'invalid',
      apiUrl: new URL('https://api.uptimerobot.com/v3'),
      environment: 'local',
      fetchImplementation,
      mode: 'human',
      version: '0.1.0',
    });

    const result = await client.request(new URL('https://api.uptimerobot.com/v3/monitors'), {
      method: 'GET',
    });

    expect(result.payload).toBe('Token is required');
  });

  it('retries a network failure for a safe read', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 42 }] }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      );
    const client = createApiClient({
      apiKey: 'u123-secret',
      apiUrl: new URL('https://api.uptimerobot.com/v3'),
      environment: 'local',
      fetchImplementation,
      mode: 'human',
      version: '0.1.0',
    });

    const result = await client.request(new URL('https://api.uptimerobot.com/v3/monitors'), {
      method: 'GET',
    });

    expect({ payload: result.payload, requests: fetchImplementation.mock.calls.length }).toEqual({
      payload: { data: [{ id: 42 }] },
      requests: 2,
    });
  });

  it('does not retry a mutating request', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(JSON.stringify({ message: 'Temporarily unavailable.' }), {
          headers: { 'content-type': 'application/json' },
          status: 503,
        }),
    );
    const client = createApiClient({
      apiKey: 'u123-secret',
      apiUrl: new URL('https://api.uptimerobot.com/v3'),
      environment: 'local',
      fetchImplementation,
      mode: 'human',
      version: '0.1.0',
    });

    const result = await client.request(new URL('https://api.uptimerobot.com/v3/monitors'), {
      body: '{}',
      method: 'POST',
    });

    expect({
      requests: fetchImplementation.mock.calls.length,
      status: result.response.status,
    }).toEqual({
      requests: 1,
      status: 503,
    });
  });

  it('allows a same-origin request outside the configured base path', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    const client = createApiClient({
      apiKey: 'u123-secret',
      apiUrl: new URL('https://api.uptimerobot.com/v3'),
      environment: 'local',
      fetchImplementation,
      mode: 'human',
      version: '0.1.0',
    });

    const result = await client.request(new URL('https://api.uptimerobot.com/health'), {
      method: 'GET',
    });

    expect(result.payload).toEqual({ status: 'ok' });
  });

  it('refuses to send credentials to a different origin', async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const client = createApiClient({
      apiKey: 'u123-secret',
      apiUrl: new URL('https://api.uptimerobot.com/v3'),
      environment: 'local',
      fetchImplementation,
      mode: 'human',
      version: '0.1.0',
    });

    await expect(
      client.request(new URL('https://example.com/monitors'), { method: 'GET' }),
    ).rejects.toThrow('Refusing to send credentials to a different origin.');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('does not follow a redirect to a different origin, keeping credentials off the wire', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        headers: { location: 'https://evil.example/collect' },
        status: 302,
      }),
    );
    const client = createApiClient({
      apiKey: 'u123-secret',
      apiUrl: new URL('https://api.uptimerobot.com/v3'),
      environment: 'local',
      fetchImplementation,
      mode: 'human',
      version: '0.1.0',
    });

    await expect(
      client.request(new URL('https://api.uptimerobot.com/v3/monitors'), { method: 'GET' }),
    ).rejects.toThrow('Refusing to follow a redirect to a different origin.');
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const redirected = fetchImplementation.mock.calls.some(([request]) =>
      String(request instanceof Request ? request.url : request).includes('evil.example'),
    );
    expect(redirected).toBe(false);
  });

  it('follows a same-origin redirect and re-attaches credentials to every hop', async () => {
    const seen: Array<{ authorization: string | null; url: string }> = [];
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(async (request) => {
      const outgoing = request instanceof Request ? request : new Request(request);
      seen.push({
        authorization: outgoing.headers.get('authorization'),
        url: outgoing.url,
      });
      if (seen.length === 1) {
        return new Response(null, {
          headers: { location: '/v3/monitors-archived' },
          status: 302,
        });
      }
      return new Response(JSON.stringify({ data: [] }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    });
    const client = createApiClient({
      apiKey: 'u123-secret',
      apiUrl: new URL('https://api.uptimerobot.com/v3'),
      environment: 'local',
      fetchImplementation,
      mode: 'human',
      version: '0.1.0',
    });

    const result = await client.request(new URL('https://api.uptimerobot.com/v3/monitors'), {
      method: 'GET',
    });

    expect(result.payload).toEqual({ data: [] });
    expect(seen).toEqual([
      {
        authorization: 'Bearer u123-secret',
        url: 'https://api.uptimerobot.com/v3/monitors',
      },
      {
        authorization: 'Bearer u123-secret',
        url: 'https://api.uptimerobot.com/v3/monitors-archived',
      },
    ]);
  });

  it('drops the body and switches to GET when a POST receives a 303', async () => {
    const seen: Array<{ body: string | null; contentType: string | null; method: string }> = [];
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(async (request) => {
      const outgoing = request instanceof Request ? request : new Request(request);
      seen.push({
        body: outgoing.body === null ? null : await outgoing.text(),
        contentType: outgoing.headers.get('content-type'),
        method: outgoing.method,
      });
      if (seen.length === 1) {
        return new Response(null, {
          headers: { location: 'https://api.uptimerobot.com/v3/monitors/42' },
          status: 303,
        });
      }
      return new Response(JSON.stringify({ id: 42 }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    });
    const client = createApiClient({
      apiKey: 'u123-secret',
      apiUrl: new URL('https://api.uptimerobot.com/v3'),
      environment: 'local',
      fetchImplementation,
      mode: 'human',
      version: '0.1.0',
    });

    const result = await client.request(new URL('https://api.uptimerobot.com/v3/monitors'), {
      body: '{}',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    expect(result.payload).toEqual({ id: 42 });
    expect(seen).toEqual([
      { body: '{}', contentType: 'application/json', method: 'POST' },
      { body: null, contentType: null, method: 'GET' },
    ]);
  });

  it('stops following redirects after a bounded number of hops', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(null, {
          headers: { location: 'https://api.uptimerobot.com/v3/loop' },
          status: 302,
        }),
    );
    const client = createApiClient({
      apiKey: 'u123-secret',
      apiUrl: new URL('https://api.uptimerobot.com/v3'),
      environment: 'local',
      fetchImplementation,
      mode: 'human',
      version: '0.1.0',
    });

    const result = await client.request(new URL('https://api.uptimerobot.com/v3/loop'), {
      method: 'GET',
    });

    expect({
      requests: fetchImplementation.mock.calls.length,
      status: result.response.status,
    }).toEqual({ requests: 6, status: 302 });
  });
});
