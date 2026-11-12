import {
  type ApiClient,
  type ApiClientOptions,
  type ApiResult,
  createApiClient,
} from '../api/client.js';
import { exitCodeFor, normalizeApiError } from '../api/errors.js';
import { AuthenticationError, resolveApiKey } from './auth.js';
import { CliFailure } from './cli-errors.js';
import { isCI } from './invocation.js';

type ClientInput = Pick<ApiClientOptions, 'apiUrl' | 'command' | 'mode' | 'version'> & {
  apiKey: unknown;
};

const authenticationFailure = (error: unknown): never => {
  if (error instanceof AuthenticationError) {
    throw new CliFailure({ code: error.code, message: error.message }, error.exitCode);
  }
  throw error;
};

export async function authenticatedClient(input: ClientInput): Promise<ApiClient> {
  const apiKey = await resolveApiKey(input.apiKey, input.apiUrl.toString()).catch(
    authenticationFailure,
  );
  return createApiClient({ ...input, apiKey, environment: isCI() ? 'ci' : 'local' });
}

export function networkFailure(error: unknown): CliFailure {
  return new CliFailure(
    { code: 'NETWORK_ERROR', message: error instanceof Error ? error.message : String(error) },
    1,
  );
}

export function requireOk({ payload, response }: ApiResult): unknown {
  if (response.ok) return payload;
  throw new CliFailure(normalizeApiError(response.status, payload), exitCodeFor(response.status));
}
