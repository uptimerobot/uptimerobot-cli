import { Command, Flags } from '@oclif/core';
import { credentialStore } from '../../lib/credential-store.js';

interface AuthenticationStatus {
  authenticated: boolean;
  source: 'keyring' | null;
  type: 'api-key' | null;
}

export default class AuthStatus extends Command {
  static override description = 'Show whether an API key is saved in the OS credential store';
  static override flags = {
    json: Flags.boolean({ description: 'Emit structured JSON output' }),
  };
  static override summary = 'Show authentication status';

  async run(): Promise<AuthenticationStatus> {
    const { flags } = await this.parse(AuthStatus);
    let apiKey: string | undefined;
    try {
      apiKey = await credentialStore.getApiKey();
    } catch {
      this.error('Secure credential storage is unavailable.', {
        code: 'AUTH_STORAGE_UNAVAILABLE',
        exit: 1,
      });
    }
    const status: AuthenticationStatus = apiKey
      ? { authenticated: true, source: 'keyring', type: 'api-key' }
      : { authenticated: false, source: null, type: null };
    if (flags.json) this.log(JSON.stringify(status));
    else if (status.authenticated)
      this.log('Authenticated with an API key stored in the OS credential store.');
    else this.log('No stored authentication found.');
    return status;
  }
}
