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
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;
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
    // Redirects are followed manually below so the origin check can be
    // re-applied to every hop before credentials are attached again.
    redirect: 'manual',
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
      const headers = new Headers(init.headers);
      headers.set('authorization', `Bearer ${options.apiKey}`);
      headers.set(
        'user-agent',
        `uptimerobot-cli/${options.version} mode/${options.mode} environment/${options.environment}`,
      );
      headers.set('x-uptimerobot-client', 'cli');
      headers.set('x-uptimerobot-execution-environment', options.environment);
      headers.set('x-uptimerobot-invocation-mode', options.mode);

      let url = input;
      let method = init.method ?? 'GET';
      let body = init.body;
      for (let redirects = 0; ; redirects += 1) {
        let response: Response;
        try {
          response = await http(new Request(url, { body, headers, method }));
        } catch (error) {
          if (!isHTTPError(error)) throw error;
          const location = error.response.headers.get('location');
          if (
            !REDIRECT_STATUSES.has(error.response.status) ||
            !location ||
            redirects === MAX_REDIRECTS
          ) {
            return { payload: error.data, response: error.response };
          }
          const next = new URL(location, url);
          if (next.origin !== baseUrl.origin) {
            throw new Error('Refusing to follow a redirect to a different origin.');
          }
          url = next;
          if (
            error.response.status === 303 ||
            ((error.response.status === 301 || error.response.status === 302) &&
              method !== 'GET' &&
              method !== 'HEAD')
          ) {
            method = 'GET';
            body = undefined;
            headers.delete('content-type');
          }
          continue;
        }
        return { payload: await readSuccessPayload(response), response };
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
