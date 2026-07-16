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
});
