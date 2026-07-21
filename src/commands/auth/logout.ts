import { Flags } from '@oclif/core';
import { BaseCommand } from '../../lib/base-command.js';
import { credentialStore } from '../../lib/credential-store.js';

export default class AuthLogout extends BaseCommand {
  static override description =
    'Remove the API key saved in the OS credential store or config file';
  static override flags = {
    json: Flags.boolean({ description: 'Emit structured JSON output' }),
  };
  static override summary = 'Log out of the stored API-key session';

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthLogout);
    let removed: boolean;
    try {
      removed = await credentialStore.deleteApiKey();
    } catch {
      this.error('Credential storage is unavailable.', {
        code: 'AUTH_STORAGE_UNAVAILABLE',
        exit: 1,
      });
    }

    if (flags.json) this.log(JSON.stringify({ removed }));
    else this.log(removed ? 'Stored API key removed.' : 'No stored API key was found.');
    if (process.env.UPTIMEROBOT_API_KEY) {
      this.warn('UPTIMEROBOT_API_KEY is still set and will continue to authenticate commands.');
    }
  }
}
