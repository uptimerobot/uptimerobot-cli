import type { CredentialBackend, CredentialStore } from './credential-store.js';
import { credentialStore } from './credential-store.js';
import { type ApiClient, type ApiCommand, createApiClient } from '../api/client.js';
import { type ExecutionEnvironment, type InvocationMode, isCI } from './invocation.js';

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

/** The development API URL override is not a URL: an input error, with the same shape every command prints for one. */
export class InvalidApiUrlError extends Error {
  readonly cliError = {
    code: 'INVALID_INPUT',
    expected: 'an absolute URL',
    message: 'UPTIMEROBOT_DEV_API_URL is not a valid URL.',
    path: 'UPTIMEROBOT_DEV_API_URL',
  } as const;

  readonly exitCode = 2;

  constructor() {
    super('UPTIMEROBOT_DEV_API_URL is not a valid URL.');
  }
}

function resolveApiUrl(): URL {
  const override = process.env.UPTIMEROBOT_DEV_API_URL;
  if (override === undefined) return new URL(PRODUCTION_API_URL);
  if (!URL.canParse(override)) throw new InvalidApiUrlError();
  return new URL(override);
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

export interface ApiAccess {
  client: ApiClient;
  apiUrl: URL;
}

/**
 * The client an authenticated command talks through: the API URL from the
 * environment override or production, the key from the shared resolver, the
 * mode and version stamped on every request. Throws the resolver's
 * `AuthenticationError`, or `InvalidApiUrlError` for a bad override, which a
 * command maps the way it already does.
 */
export async function resolveApiAccess(options: {
  explicitApiKey: unknown;
  mode: InvocationMode;
  version: string;
  command?: ApiCommand;
}): Promise<ApiAccess> {
  const apiUrl = resolveApiUrl();
  const apiKey = await resolveApiKey(options.explicitApiKey, apiUrl.toString());
  const client = createApiClient({
    apiKey,
    apiUrl,
    command: options.command,
    environment: isCI() ? 'ci' : 'local',
    mode: options.mode,
    version: options.version,
  });
  return { client, apiUrl };
}
