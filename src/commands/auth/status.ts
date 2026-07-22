import { Flags } from '@oclif/core';
import { BaseCommand } from '../../lib/base-command.js';
import { credentialStore } from '../../lib/credential-store.js';
import { detectInvocationMode } from '../../lib/invocation.js';
import { resolveFormat } from '../../output/resolve-format.js';

interface AuthenticationStatus {
  authenticated: boolean;
  source: 'file' | 'keyring' | null;
  type: 'api-key' | null;
}

export default class AuthStatus extends BaseCommand {
  static override description =
    'Show whether an API key is saved in the OS credential store or config file';
  static override flags = {
    json: Flags.boolean({ description: 'Emit structured JSON output' }),
  };
  static override summary = 'Show authentication status';

  async run(): Promise<AuthenticationStatus> {
    const { flags } = await this.parse(AuthStatus);
    let stored: Awaited<ReturnType<typeof credentialStore.getApiKey>>;
    try {
      stored = await credentialStore.getApiKey();
    } catch {
      this.error('Credential storage is unavailable.', {
        code: 'AUTH_STORAGE_UNAVAILABLE',
        exit: 1,
      });
    }
    const status: AuthenticationStatus = stored
      ? { authenticated: true, source: stored.backend, type: 'api-key' }
      : { authenticated: false, source: null, type: null };
    const format = resolveFormat(flags, detectInvocationMode(false));
    if (format === 'json' || format === 'jsonl') this.log(JSON.stringify(status));
    else if (!stored) this.log('No stored authentication found.');
    else if (stored.backend === 'keyring')
      this.log('Authenticated with an API key stored in the OS credential store.');
    else this.log('Authenticated with an API key stored in the config file.');
    return status;
  }
}
