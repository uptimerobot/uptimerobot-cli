import { Command, Flags } from '@oclif/core';
import { AuthenticationError, PRODUCTION_API_URL, saveValidatedApiKey } from '../../lib/auth.js';

export default class AuthLogin extends Command {
  static override description = 'Validate and securely store a UptimeRobot API key';
  static override flags = {
    'api-key': Flags.string({
      description: 'UptimeRobot API key to validate and save',
      env: 'UPTIMEROBOT_API_KEY',
      helpValue: '<key>',
      required: true,
    }),
    json: Flags.boolean({ description: 'Emit structured JSON output' }),
  };
  static override summary = 'Log in with an API key';

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthLogin);
    try {
      await saveValidatedApiKey(flags['api-key'], PRODUCTION_API_URL);
    } catch (error) {
      if (error instanceof AuthenticationError)
        this.error(error.message, { code: error.code, exit: error.exitCode });
      throw error;
    }
    if (flags.json)
      this.log(JSON.stringify({ authenticated: true, stored: true, type: 'api-key' }));
    else this.log('API key validated and saved in the OS credential store.');
  }
}
