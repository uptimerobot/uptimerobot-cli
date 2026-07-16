import { ux } from '@oclif/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../src/api/client.js';
import { withRequestProgress } from '../src/output/request-progress.js';

describe('request progress', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('starts a successful request and finishes with done', async () => {
    const start = vi.spyOn(ux.action, 'start').mockImplementation(() => {});
    const stop = vi.spyOn(ux.action, 'stop').mockImplementation(() => {});
    const result: ApiResult = {
      payload: { success: true },
      response: new Response(null, { status: 200 }),
    };
    let completeRequest!: (result: ApiResult) => void;
    const request = new Promise<ApiResult>((resolve) => (completeRequest = resolve));

    const progress = withRequestProgress(true, () => request);
    expect(start).toHaveBeenCalledWith('Loading');
    completeRequest(result);

    await expect(progress).resolves.toBe(result);
    expect(stop).toHaveBeenCalledWith('done');
  });

  it('finishes an HTTP error with failed and returns the result', async () => {
    vi.spyOn(ux.action, 'start').mockImplementation(() => {});
    const stop = vi.spyOn(ux.action, 'stop').mockImplementation(() => {});
    const result: ApiResult = {
      payload: { message: 'Unauthorized' },
      response: new Response(null, { status: 401 }),
    };

    await expect(withRequestProgress(true, async () => result)).resolves.toBe(result);
    expect(stop).toHaveBeenCalledWith('failed');
  });

  it('finishes a network error with failed and rethrows it', async () => {
    vi.spyOn(ux.action, 'start').mockImplementation(() => {});
    const stop = vi.spyOn(ux.action, 'stop').mockImplementation(() => {});
    const failure = new Error('Connection refused');

    await expect(
      withRequestProgress(true, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(stop).toHaveBeenCalledWith('failed');
  });

  it('does not start progress when disabled', async () => {
    const start = vi.spyOn(ux.action, 'start').mockImplementation(() => {});
    const stop = vi.spyOn(ux.action, 'stop').mockImplementation(() => {});
    const result: ApiResult = {
      payload: { success: true },
      response: new Response(null, { status: 200 }),
    };

    await expect(withRequestProgress(false, async () => result)).resolves.toBe(result);
    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });
});
