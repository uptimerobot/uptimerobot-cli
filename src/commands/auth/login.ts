import { Flags } from '@oclif/core';
import { AuthenticationError, PRODUCTION_API_URL, saveValidatedApiKey } from '../../lib/auth.js';
import { BaseCommand } from '../../lib/base-command.js';
import { detectInvocationMode, isCI, promptSecret } from '../../lib/invocation.js';
import { resolveFormat } from '../../output/resolve-format.js';

/** Where a user creates and copies an API key. Not an API endpoint. */
const API_KEY_DASHBOARD_URL = 'https://dashboard.uptimerobot.com/integrations';

export default class AuthLogin extends BaseCommand {
  static override description = `Validate and securely store a UptimeRobot API key. Run without flags to paste the key at a masked prompt. Create an API key at ${API_KEY_DASHBOARD_URL}.`;
  static override flags = {
    'api-key': Flags.string({
      description: 'UptimeRobot API key to validate and save (prompted securely when omitted)',
      env: 'UPTIMEROBOT_API_KEY',
      helpValue: '<key>',
    }),
    json: Flags.boolean({ description: 'Emit structured JSON output' }),
  };
  static override summary = 'Log in with an API key';

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthLogin);
    const mode = detectInvocationMode(false);
    let apiKey = flags['api-key'];
    if (!apiKey && mode === 'human') {
      apiKey = await promptSecret(
        `Create an API key at ${API_KEY_DASHBOARD_URL}\nPaste your UptimeRobot API key: `,
      );
    }
    if (!apiKey) {
      this.error(
        'No API key provided. Pass --api-key, set UPTIMEROBOT_API_KEY, or run in an interactive terminal.',
        { code: 'AUTH_REQUIRED', exit: 2 },
      );
    }
    let backend: Awaited<ReturnType<typeof saveValidatedApiKey>>;
    try {
      backend = await saveValidatedApiKey(apiKey, PRODUCTION_API_URL, {
        environment: isCI() ? 'ci' : 'local',
        mode,
        version: this.config.pjson.version,
      });
    } catch (error) {
      if (error instanceof AuthenticationError)
        this.error(error.message, { code: error.code, exit: error.exitCode });
      throw error;
    }
    const format = resolveFormat(flags, mode);
    if (format === 'json' || format === 'jsonl') {
      this.log(
        JSON.stringify({ authenticated: true, storage: backend, stored: true, type: 'api-key' }),
      );
    } else if (backend === 'keyring') {
      this.log('API key validated and saved in the OS credential store.');
    } else {
      this.log('API key validated and saved in the config file.');
    }
  }
}
