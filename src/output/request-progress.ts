import { ux } from '@oclif/core';
import type { ApiResult } from '../api/client.js';

export async function withRequestProgress(
  enabled: boolean,
  request: () => Promise<ApiResult>,
): Promise<ApiResult> {
  if (!enabled) return request();

  ux.action.start('Loading');

  try {
    const result = await request();
    ux.action.stop(result.response.ok ? 'done' : 'failed');
    return result;
  } catch (error) {
    ux.action.stop('failed');
    throw error;
  }
}
