import type { CredentialBackend, CredentialStore } from './credential-store.js';
import { credentialStore } from './credential-store.js';
import type { ExecutionEnvironment, InvocationMode } from './invocation.js';

export const PRODUCTION_API_URL = 'https://api.uptimerobot.com/v3';

const VALIDATION_TIMEOUT_MS = 10_000;

export interface ValidationAttribution {
  environment: ExecutionEnvironment;
  mode: InvocationMode;
  version: string;
}

export class AuthenticationError extends Error {
  constructor(
    readonly code:
      | 'AUTH_INVALID'
      | 'AUTH_REQUIRED'
      | 'AUTH_STORAGE_UNAVAILABLE'
      | 'AUTH_URL_RESTRICTED',
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
  }
}

export async function saveValidatedApiKey(
  apiKey: string,
  apiUrl: string,
  attribution: ValidationAttribution,
  store: CredentialStore = credentialStore,
  fetchImplementation: typeof fetch = fetch,
): Promise<CredentialBackend> {
  if (apiUrl !== PRODUCTION_API_URL) {
    throw new AuthenticationError(
      'AUTH_URL_RESTRICTED',
      'Persistent login is only available for api.uptimerobot.com. Use UPTIMEROBOT_API_KEY or --api-key with a custom API URL.',
      2,
    );
  }
  let response: Response;
  try {
    response = await fetchImplementation(new URL(`${apiUrl}/user/me`), {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${apiKey}`,
        'user-agent': `uptimerobot-cli/${attribution.version} mode/${attribution.mode} environment/${attribution.environment}`,
        'x-uptimerobot-client': 'cli',
        'x-uptimerobot-execution-environment': attribution.environment,
        'x-uptimerobot-invocation-mode': attribution.mode,
      },
      signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
    });
  } catch (error) {
    throw new AuthenticationError(
      'AUTH_INVALID',
      `Could not validate the API key: ${error instanceof Error ? error.message : String(error)}`,
      1,
    );
  }
  if (!response.ok) {
    throw new AuthenticationError(
      'AUTH_INVALID',
      `API key validation failed with HTTP ${response.status}.`,
      4,
    );
  }
  try {
    return await store.setApiKey(apiKey);
  } catch {
    throw new AuthenticationError(
      'AUTH_STORAGE_UNAVAILABLE',
      'No credential storage is available. Use UPTIMEROBOT_API_KEY for this environment.',
      1,
    );
  }
}

export async function resolveApiKey(
  explicitApiKey: unknown,
  apiUrl: string,
  store: CredentialStore = credentialStore,
): Promise<string> {
  if (typeof explicitApiKey === 'string' && explicitApiKey.length > 0) return explicitApiKey;
  if (apiUrl !== PRODUCTION_API_URL) {
    throw new AuthenticationError(
      'AUTH_URL_RESTRICTED',
      'Stored credentials are only used with api.uptimerobot.com. Pass --api-key or set UPTIMEROBOT_API_KEY for a custom API URL.',
      2,
    );
  }
  let stored: Awaited<ReturnType<CredentialStore['getApiKey']>>;
  try {
    stored = await store.getApiKey();
  } catch {
    throw new AuthenticationError(
      'AUTH_STORAGE_UNAVAILABLE',
      'Credential storage is unavailable. Set UPTIMEROBOT_API_KEY or pass --api-key.',
      1,
    );
  }
  if (stored) return stored.apiKey;
  throw new AuthenticationError(
    'AUTH_REQUIRED',
    'Run `uptimerobot auth login --api-key <key>`, set UPTIMEROBOT_API_KEY, or pass --api-key.',
    2,
  );
}
