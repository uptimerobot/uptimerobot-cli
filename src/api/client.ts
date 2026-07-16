import ky, { isHTTPError } from 'ky';
import type { ExecutionEnvironment, InvocationMode } from '../lib/invocation.js';

export interface ApiClientOptions {
  apiKey: string;
  apiUrl: URL;
  environment: ExecutionEnvironment;
  fetchImplementation?: typeof fetch;
  mode: InvocationMode;
  version: string;
}

const RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];
const MAX_RETRY_DELAY_MS = 5000;
const REQUEST_TIMEOUT_MS = 30_000;

export interface ApiResult {
  payload: unknown;
  response: Response;
}

export interface ApiClient {
  request(input: URL, init: RequestInit): Promise<ApiResult>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = options.apiUrl;
  const http = ky.create({
    fetch: options.fetchImplementation ?? fetch,
    retry: {
      afterStatusCodes: RETRYABLE_STATUSES,
      delay: (attempt) => 100 * 2 ** (attempt - 1),
      limit: 2,
      maxRetryAfter: MAX_RETRY_DELAY_MS,
      methods: ['get', 'head'],
      shouldRetry: ({ error }) => (hasLongRetryAfter(error) ? false : undefined),
      statusCodes: RETRYABLE_STATUSES,
    },
    timeout: REQUEST_TIMEOUT_MS,
  });

  return {
    async request(input, init) {
      if (input.origin !== baseUrl.origin) {
        throw new Error('Refusing to send credentials to a different origin.');
      }
      const request = new Request(input, init);
      const headers = new Headers(request.headers);
      headers.set('authorization', `Bearer ${options.apiKey}`);
      headers.set(
        'user-agent',
        `uptimerobot-cli/${options.version} mode/${options.mode} environment/${options.environment}`,
      );
      headers.set('x-uptimerobot-client', 'cli');
      headers.set('x-uptimerobot-execution-environment', options.environment);
      headers.set('x-uptimerobot-invocation-mode', options.mode);
      try {
        const response = await http(new Request(request, { headers }));
        return { payload: await readSuccessPayload(response), response };
      } catch (error) {
        if (isHTTPError(error)) {
          return { payload: error.data, response: error.response };
        }
        throw error;
      }
    },
  };
}

async function readSuccessPayload(response: Response): Promise<unknown> {
  if (response.status === 204) return { success: true };
  const text = await response.text();
  if (text.length === 0) return { success: true };
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function hasLongRetryAfter(error: Error): boolean | undefined {
  if (!isHTTPError(error)) return undefined;
  const retryAfter = error.response.headers.get('retry-after');
  if (!retryAfter) return undefined;
  const seconds = Number(retryAfter);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
  return Number.isFinite(delay) && Math.max(0, delay) > MAX_RETRY_DELAY_MS ? true : undefined;
}
